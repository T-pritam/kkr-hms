/**
 * GET /api/patients/[id]/overview?billing_id=…
 *
 * Everything the patient's Overview tab shows (PRD v2, CR-16): the stay, the
 * money, lab and medicine, the services used, and how much activity there is.
 *
 * The money model (CR-15, settled with the client on 2026-09-22/23):
 *
 *   Total bill      = every payment received on the stay (all labels)
 *   Passed on       = payments labelled Lab or Medicine: money collected at the
 *                     desk for the lab or pharmacy, which is not the hospital's
 *   Hospital income = total bill − passed on
 *   Expenses        = doctor fees + referral commission, counted as soon as they
 *                     are priced, paid or not. An *included* lab/medicine amount
 *                     is income, not an expense: the lab or pharmacy bills the
 *                     hospital separately (2026-09-23).
 *   Net             = hospital income − expenses          (admin only, Q-66)
 *
 * Charges are internal: they say what the patient used and never make a balance.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { PAYMENT_KINDS, type PaymentKind } from '@/lib/billing/payment-labels'
import { labMedicineKind } from '@/lib/billing/lab-medicine'
import { getRegistrationFeeItem } from '@/lib/billing/registration-fee'
import { istToday } from '@/lib/dates/ist'

const num = (v: unknown) => Number(v) || 0
const lineTotal = (c: any) => num(c.amount) * (Number(c.qty) || 1)
const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

/** Whole days between two `YYYY-MM-DD` dates, never negative. */
function daysBetween(from: string | null, to: string): number | null {
  if (!from) return null
  const a = Date.parse(`${String(from).slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

async function countRows(db: any, table: string, column: string, value: string): Promise<number> {
  const { count } = await db.from(table).select('id', { count: 'exact', head: true }).eq(column, value)
  return count ?? 0
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireBilling(request, 'charge:read')
    if (auth.response) return auth.response
    const { user } = auth

    const supabase = await createClient()
    const { id: patientId } = await params
    const wantedBillingId = request.nextUrl.searchParams.get('billing_id')

    const { data: patient } = await supabase
      .from('patients')
      .select('id, patient_id, name, gender, phone, age_years, date_of_birth, date_of_join, status, referred_by')
      .eq('id', patientId)
      .maybeSingle()

    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

    // The current stay, or the one asked for.
    let billingQuery = supabase
      .from('patient_billing')
      .select(
        'id, patient_id, joined_date, patient_charges_total, total_doctor_fees, patient_paid_amount, referral_commission_amount, referral_settled, registration_fee_status'
      )
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })

    if (wantedBillingId) billingQuery = billingQuery.eq('id', wantedBillingId)

    const { data: billings } = await billingQuery
    const billing = (billings ?? [])[0]

    if (!billing) {
      return NextResponse.json({ error: 'No billing record for this patient' }, { status: 404 })
    }

    const [{ data: installments }, { data: charges }, { data: settlements }] = await Promise.all([
      supabase
        .from('patient_billing_installments')
        .select('id, installment_number, amount, kind, payment_date, payment_method')
        .eq('patient_billing_id', billing.id)
        .order('installment_number', { ascending: true }),
      supabase
        .from('patient_charges')
        .select(
          'id, charge_type, amount, qty, charge_date, lab_medicine_status, charge_item:charge_items(id, category)'
        )
        .eq('patient_billing_id', billing.id)
        .order('charge_date', { ascending: false }),
      supabase
        .from('doctor_visit_settlements')
        .select('id, total_amount, settlement_amount, settled, doctor:doctors(id, name)')
        .eq('patient_billing_id', billing.id)
        .is('deleted_at', null),
    ])

    // ── Money ────────────────────────────────────────────────────────────────
    const paymentRows = installments ?? []
    const byLabel = Object.fromEntries(PAYMENT_KINDS.map(k => [k, 0])) as Record<PaymentKind, number>
    let totalBill = 0

    for (const row of paymentRows) {
      const amount = num(row.amount)
      const kind: PaymentKind = (PAYMENT_KINDS as readonly string[]).includes(row.kind)
        ? row.kind
        : 'regular'
      totalBill += amount
      byLabel[kind] += amount
    }

    /**
     * Every payment is the hospital's now. "Passed on" is gone with the lab and
     * medicine labels: an amount the patient paid the lab directly is not
     * recorded at all, so there is nothing here to hand back (Q-82, revised
     * 2026-09-24). What the hospital owes the lab is an expense below instead.
     */
    const hospitalIncome = totalBill

    const doctorFees = (settlements ?? []).reduce(
      (acc, s: any) => {
        const priced = num(s.total_amount)
        acc.total += priced
        if (s.settled) acc.paid += num(s.settlement_amount ?? s.total_amount)
        else acc.pending += priced
        return acc
      },
      { total: 0, paid: 0, pending: 0 }
    )

    const commissionAmount = num(billing.referral_commission_amount)
    const commission = {
      amount: commissionAmount,
      paid: billing.referral_settled ? commissionAmount : 0,
      pending: billing.referral_settled ? 0 : commissionAmount,
    }

    // ── Lab & medicine, and the services used ────────────────────────────────
    //
    // `included` is what the hospital carries for this patient and owes the lab
    // or pharmacy — an expense, counted below (Q-83, revised 2026-09-24).
    // `undecided` is a charge nobody has answered for yet: it is not an expense
    // until someone says it is, and it is shown so a person resolves it.
    const labMedicine = {
      included: 0,
      undecided: 0,
      rows: [] as any[],
    }
    const byCategory = new Map<string, { category: string; total: number; count: number }>()
    let servicesUsed = 0

    const feeItem = await getRegistrationFeeItem(supabase)
    let registrationFeeAmount = 0

    for (const charge of charges ?? []) {
      const item = one<any>(charge.charge_item)
      const category = item?.category ?? 'other'
      const total = lineTotal(charge)

      servicesUsed += total
      const bucket = byCategory.get(category) ?? { category, total: 0, count: 0 }
      bucket.total += total
      bucket.count += 1
      byCategory.set(category, bucket)

      if (feeItem && item?.id === feeItem.id) registrationFeeAmount += total

      const kind = labMedicineKind(category)
      if (!kind) continue

      if (charge.lab_medicine_status === 'included') labMedicine.included += total
      else labMedicine.undecided += total

      labMedicine.rows.push({
        id: charge.id,
        charge_type: charge.charge_type,
        charge_date: charge.charge_date,
        kind,
        amount: total,
        status: charge.lab_medicine_status === 'included' ? 'included' : null,
      })
    }

    /**
     * Counted as soon as they are priced or set, paid or not (Q-81) — and the
     * lab/medicine the hospital carries, from the day the charge is dated.
     */
    const expensesTotal = doctorFees.total + commission.amount + labMedicine.included

    // ── Activity ─────────────────────────────────────────────────────────────
    const [visits, labOrders, pharmacyBills] = await Promise.all([
      countRows(supabase, 'patient_consultations', 'patient_id', patientId),
      countRows(supabase, 'lab_orders', 'patient_id', patientId),
      countRows(supabase, 'pharmacy_bills', 'patient_id', patientId),
    ])

    const { data: caseSheets } = await supabase
      .from('patient_case_sheets')
      .select('id, status, discharge_date')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })

    const caseSheet = (caseSheets ?? [])[0] ?? null

    let referral: { name: string; phone: string | null } | null = null
    if (patient.referred_by) {
      const { data } = await supabase
        .from('referrals')
        .select('name, phone')
        .eq('id', patient.referred_by)
        .maybeSingle()
      referral = data ?? null
    }

    const joinedDate = String(billing.joined_date || patient.date_of_join || '').slice(0, 10) || null
    const dischargedOn = patient.status === 'Discharged' ? (caseSheet?.discharge_date ?? null) : null

    return NextResponse.json({
      stay: {
        billing_id: billing.id,
        joined_date: joinedDate,
        discharged_on: dischargedOn ? String(dischargedOn).slice(0, 10) : null,
        days: daysBetween(joinedDate, dischargedOn ? String(dischargedOn).slice(0, 10) : istToday()),
        patient: {
          id: patient.id,
          patient_id: patient.patient_id,
          name: patient.name,
          gender: patient.gender,
          phone: patient.phone,
          age_years: patient.age_years,
          date_of_birth: patient.date_of_birth,
          status: patient.status,
        },
        referral,
        registration_fee: {
          status: billing.registration_fee_status ?? null,
          amount: registrationFeeAmount,
        },
      },
      money: {
        total_bill: totalBill,
        by_label: byLabel,
        hospital_income: hospitalIncome,
        expenses: {
          doctor_fees: doctorFees,
          referral_commission: commission,
          lab_medicine: labMedicine.included,
          total: expensesTotal,
        },
        // What the hospital keeps. Admin only — reception sees the rest (Q-66).
        net: user.role === 'ADMIN' ? hospitalIncome - expensesTotal : null,
      },
      lab_medicine: labMedicine,
      services_used: {
        total: servicesUsed,
        by_category: [...byCategory.values()].sort((a, b) => b.total - a.total),
      },
      doctor_fees: (settlements ?? []).map((s: any) => ({
        id: s.id,
        doctor: one<any>(s.doctor)?.name ?? null,
        total: num(s.total_amount),
        settled: Boolean(s.settled),
      })),
      activity: {
        visits,
        charges: (charges ?? []).length,
        payments: paymentRows.length,
        lab_orders: labOrders,
        pharmacy_bills: pharmacyBills,
        case_sheet_status: caseSheet?.status ?? null,
        last_payment_date: paymentRows.length
          ? paymentRows.map((r: any) => r.payment_date).sort().slice(-1)[0]
          : null,
      },
    })
  } catch (error: any) {
    console.error('Error building the patient overview:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to load the overview' },
      { status: 500 }
    )
  }
}
