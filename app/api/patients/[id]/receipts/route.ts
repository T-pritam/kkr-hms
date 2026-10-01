import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import {
  createReceipt,
  lineDefaults,
  listReceipts,
  patientPayments,
  receiptDefaults,
  validateReceipt,
} from '@/lib/billing/receipts'

/**
 * A patient's payment receipts (client, 1 Oct): the saved ones, and what a new
 * one starts with — the patient's details, the doctors who visited, and each
 * payment's row. Reception and admin only, reading included.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireBilling(request, 'receipt:write')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const { id: patientId } = await params

    const { data: patient } = await supabase
      .from('patients')
      .select('id, patient_id, name, gender, phone, alternate_phone, address, date_of_birth, age_years, age_recorded_on')
      .eq('id', patientId)
      .maybeSingle()
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

    const { data: visits } = await supabase
      .from('patient_consultations')
      .select('id, consultation_date, doctor:doctors(id, name, department)')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('consultation_date', { ascending: true })

    const { data: me } = await supabase.from('users').select('id, username').eq('id', auth.user.id).maybeSingle()

    const payments = await patientPayments(supabase, patientId)
    const receipts = await listReceipts(supabase, patientId, payments)

    return NextResponse.json({
      defaults: receiptDefaults(patient, (visits ?? []) as any[]),
      me: me?.username ?? '',
      payments: payments.map(payment => {
        const recorder = Array.isArray(payment.users) ? payment.users[0] : payment.users
        return {
          id: payment.id,
          installment_number: payment.installment_number,
          amount: Number(payment.amount) || 0,
          payment_date: payment.payment_date,
          payment_method: payment.payment_method,
          kind: payment.kind,
          recorded_by: recorder?.username ?? '',
          line: lineDefaults(payment),
        }
      }),
      receipts,
    })
  } catch (error) {
    console.error('Error fetching receipts:', error)
    return NextResponse.json({ error: 'Failed to fetch receipts' }, { status: 500 })
  }
}

/** Save a new receipt for one or more of the patient's payments. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireBilling(request, 'receipt:write')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const { id: patientId } = await params
    const body = await request.json().catch(() => ({}))

    const payments = await patientPayments(supabase, patientId)
    const checked = validateReceipt(body, new Set(payments.map(p => p.id)))
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error, fieldErrors: checked.fieldErrors }, { status: checked.status })
    }

    const first = payments.find(p => p.id === checked.value.lines[0].installment_id)
    const saved = await createReceipt(supabase, {
      patientId,
      billingId: first.patient_billing_id,
      fields: checked.value,
      userId: auth.user.id,
    })
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status })

    return NextResponse.json({ id: saved.id }, { status: 201 })
  } catch (error) {
    console.error('Error saving receipt:', error)
    return NextResponse.json({ error: 'Failed to save the receipt' }, { status: 500 })
  }
}
