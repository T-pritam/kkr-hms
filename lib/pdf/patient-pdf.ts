import { PAYMENT_KIND_LABELS, type PaymentKind } from '@/lib/billing/payment-labels'
import {
  M, ROW_H, C,
  mkDoc, hdr, boxRow, sec, thead, trow, ttotal, footers,
  fmt, fmtDate,
} from './base'

// Landscape geometry: cw = 269, so the content right edge sits at 283.
const RE = M + 269

// ── Public types ───────────────────────────────────────────────────────────────
export interface PatientPDFData {
  patient: any
  billing: any
  charges: any[]
  installments: any[]
  settlements: any[]
  referral: any
}

// ── Fetch helper ───────────────────────────────────────────────────────────────
export async function fetchPatientPDFData(patientId: string, dateFilter?: { start?: string; end?: string }): Promise<PatientPDFData> {
  const patientRes = await fetch(`/api/patients/${patientId}`)
  const patient = await patientRes.json()

  const billingRes = await fetch(`/api/patients/${patientId}/billing`)
  const billingData = await billingRes.json()
  const billing = billingData.billings?.[0] || null
  const referral = billingData.referral || null

  if (!billing) {
    return { patient: patient.patient || patient, billing: null, charges: [], installments: [], settlements: [], referral }
  }

  const [chargesRes, installmentsRes, settlementsRes] = await Promise.all([
    fetch(`/api/patients/${patientId}/charges?billing_id=${billing.id}`),
    fetch(`/api/patients/${patientId}/installments?billing_id=${billing.id}`),
    fetch(`/api/patients/${patientId}/settlements?billing_id=${billing.id}`),
  ])

  let charges     = await chargesRes.json()
  let installments = await installmentsRes.json()
  let settlements = await settlementsRes.json()

  charges      = Array.isArray(charges)      ? charges      : []
  installments = Array.isArray(installments) ? installments : []
  settlements  = Array.isArray(settlements)  ? settlements  : []

  if (dateFilter?.start) {
    charges      = charges.filter((c: any) => c.charge_date   >= dateFilter.start!)
    installments = installments.filter((i: any) => i.payment_date >= dateFilter.start!)
  }
  if (dateFilter?.end) {
    charges      = charges.filter((c: any) => c.charge_date   <= dateFilter.end!)
    installments = installments.filter((i: any) => i.payment_date <= dateFilter.end!)
  }

  return { patient: patient.patient || patient, billing, charges, installments, settlements, referral }
}

// ── Main PDF generator ─────────────────────────────────────────────────────────
/**
 * The patient's billing report.
 *
 * PRD v2 CR-15 / Q-35: this is the document a patient can be given, so it shows
 * the services used and the payments received — and nothing else. Charges are
 * internal knowledge with nothing owed against them, so there is no balance or
 * "due"; the patient's total bill is what they paid. The doctor-fee and
 * referral-commission figures (the hospital's expenses) and the retired base
 * package are left out. What exactly the patient copy shows is still to be
 * settled (Q-67).
 */
export function generatePatientPDF(data: PatientPDFData) {
  const { patient, billing, charges, installments } = data
  const h = mkDoc()

  const servicesUsed = Number(billing?.patient_charges_total ?? billing?.total_charges ?? 0)
  const totalPaid    = Number(billing?.patient_paid_amount || 0)

  // ── Header ─────────────────────────────────────────────────────────────────
  hdr(h,
    'Patient Billing Report',
    `${patient?.name || '—'}  •  ID: ${patient?.patient_id || '—'}  •  Joined: ${fmtDate(patient?.date_of_join)}`
  )

  // ── KPI boxes ──────────────────────────────────────────────────────────────
  boxRow(h, [
    { label: 'Services Used',          value: fmt(servicesUsed), accent: C.blue },
    { label: 'Total Bill (Payments)',  value: fmt(totalPaid),    accent: C.green },
  ])

  // ── Patient info + Billing side by side ────────────────────────────────────
  sec(h, 'PATIENT & BILLING INFORMATION', C.blue)

  const halfW = (h.cw - 8) / 2
  const rx = M + halfW + 8   // right column start

  // Sub-headers
  h.bold(8)
  h.doc.setFillColor(220, 235, 255)
  h.doc.rect(M, h.y, halfW, 7, 'F')
  h.doc.rect(rx, h.y, halfW, 7, 'F')
  h.doc.setTextColor(...C.navy)
  h.doc.text('PATIENT DETAILS', M + 4, h.y + 5)
  h.doc.text('BILLING SUMMARY',  rx + 4, h.y + 5)
  h.doc.setTextColor(...C.dark)
  h.y += 9

  const patientInfo: [string, string][] = [
    ['Name',           patient?.name || '—'],
    ['Patient ID',     patient?.patient_id || '—'],
    ['Phone',          patient?.phone || '—'],
    ['Gender',         patient?.gender || '—'],
    ['Date of Birth',  fmtDate(patient?.date_of_birth)],
    ['Join Date',      fmtDate(patient?.date_of_join)],
    ['Status',         patient?.status || '—'],
    ['Address',        (patient?.address || '—').substring(0, 40)],
  ]

  const billingInfo: [string, string][] = [
    ['Services Used',          fmt(servicesUsed)],
    ['Payments Received',      String(installments.length)],
    ['Total Bill (Payments)',  fmt(totalPaid)],
  ]

  const startY = h.y
  const lw = 36  // label col width (left panel)
  const rw = 42  // label col width (right panel)

  patientInfo.forEach(([lbl, val], i) => {
    if (i % 2 === 0) {
      h.doc.setFillColor(...C.tblAlt)
      h.doc.rect(M, h.y, halfW, ROW_H, 'F')
    }
    h.bold(7.5); h.doc.setTextColor(...C.muted)
    h.doc.text(lbl, M + 3, h.y + 5)
    h.normal(7.5); h.doc.setTextColor(...C.dark)
    h.doc.text(val, M + lw, h.y + 5)
    h.doc.setDrawColor(...C.border); h.doc.setLineWidth(0.2)
    h.doc.line(M, h.y + ROW_H, M + halfW, h.y + ROW_H)
    h.y += ROW_H
  })

  // Reset y to startY for right column
  const leftEndY = h.y
  h.y = startY
  billingInfo.forEach(([lbl, val], i) => {
    if (i % 2 === 0) {
      h.doc.setFillColor(...C.tblAlt)
      h.doc.rect(rx, h.y, halfW, ROW_H, 'F')
    }
    h.bold(7.5); h.doc.setTextColor(...C.muted)
    h.doc.text(lbl, rx + 3, h.y + 5)
    h.normal(7.5); h.doc.setTextColor(...C.dark)
    h.doc.text(val, rx + rw, h.y + 5)
    h.doc.setDrawColor(...C.border); h.doc.setLineWidth(0.2)
    h.doc.line(rx, h.y + ROW_H, rx + halfW, h.y + ROW_H)
    h.y += ROW_H
  })

  h.y = Math.max(leftEndY, h.y) + 4

  // ── Charges table ──────────────────────────────────────────────────────────
  sec(h, 'SERVICES USED', C.orange)

  if (charges.length > 0) {
    thead(h, [
      { label: '#',           x: M + 2 },
      { label: 'Date',        x: M + 11 },
      { label: 'Type',        x: M + 46 },
      { label: 'Description', x: M + 100 },
      { label: 'Qty',         x: M + 190, align: 'center' },
      { label: 'Rate',        x: M + 215, align: 'right' },
      { label: 'Amount',      x: RE,      align: 'right' },
    ])
    let chargesTotal = 0
    charges.forEach((c: any, i: number) => {
      const qty = c.qty || 1
      const amount = Number(c.amount) * qty
      chargesTotal += amount
      trow(h, [
        { text: String(i + 1),                              x: M + 2 },
        { text: fmtDate(c.charge_date),                     x: M + 11 },
        { text: (c.charge_type || '—').substring(0, 24),   x: M + 46 },
        { text: (c.description || '—').substring(0, 44),   x: M + 100 },
        { text: String(qty),                                x: M + 190, align: 'center' },
        { text: fmt(c.amount),                              x: M + 215, align: 'right' },
        { text: fmt(amount),                                x: RE,      align: 'right' },
      ], i)
    })
    ttotal(h, [
      { text: 'TOTAL SERVICES USED', x: M + 11 },
      { text: fmt(chargesTotal), x: RE, align: 'right' },
    ])
  } else {
    h.normal(8); h.doc.setTextColor(...C.muted)
    h.doc.text('No charges recorded.', M + 4, h.y + 5)
    h.doc.setTextColor(...C.dark); h.y += 10
  }

  // ── Payments table ─────────────────────────────────────────────────────────
  sec(h, 'PAYMENTS', C.green)

  if (installments.length > 0) {
    thead(h, [
      { label: '#',          x: M + 2 },
      { label: 'Date',       x: M + 11 },
      { label: 'Amount',     x: M + 60, align: 'right' },
      { label: 'Type',       x: M + 70 },
      { label: 'Method',     x: M + 100 },
      { label: 'Reference',  x: M + 140 },
      { label: 'Remarks',    x: M + 210 },
    ])
    let payTotal = 0
    installments.forEach((inst: any, i: number) => {
      const amount = Number(inst.amount) || 0
      payTotal += amount
      trow(h, [
        { text: String(inst.installment_number || i + 1),           x: M + 2 },
        { text: fmtDate(inst.payment_date),                         x: M + 11 },
        { text: fmt(amount),                                        x: M + 60, align: 'right' },
        { text: PAYMENT_KIND_LABELS[inst.kind as PaymentKind] ?? 'Regular', x: M + 70 },
        { text: (inst.payment_method || 'cash').replace('_', ' '), x: M + 100 },
        { text: (inst.transaction_reference || '—').substring(0, 28), x: M + 140 },
        { text: (inst.remarks || '—').substring(0, 28),             x: M + 210 },
      ], i)
    })
    ttotal(h, [
      { text: 'TOTAL BILL (PAYMENTS)', x: M + 11 },
      { text: fmt(payTotal), x: M + 60, align: 'right' },
    ])
  } else {
    h.normal(8); h.doc.setTextColor(...C.muted)
    h.doc.text('No payments recorded.', M + 4, h.y + 5)
    h.doc.setTextColor(...C.dark); h.y += 10
  }

  // ── Summary banner ─────────────────────────────────────────────────────────
  // No balance: nothing is owed against the services used (PRD v2 CR-15).
  h.checkPage(20)
  const bw2 = (h.cw - 4) / 2
  const sumY = h.y
  h.doc.setFillColor(...C.blue)
  h.doc.rect(M, sumY, bw2, 14, 'F')
  h.bold(7); h.doc.setTextColor(186, 211, 245)
  h.doc.text('SERVICES USED', M + bw2 / 2, sumY + 5, { align: 'center' })
  h.bold(10.5); h.doc.setTextColor(...C.white)
  h.doc.text(fmt(servicesUsed), M + bw2 / 2, sumY + 11, { align: 'center' })
  h.doc.setFillColor(...C.green)
  h.doc.rect(M + bw2 + 4, sumY, bw2, 14, 'F')
  h.bold(7); h.doc.setTextColor(186, 211, 245)
  h.doc.text('TOTAL BILL (PAYMENTS)', M + bw2 + 4 + bw2 / 2, sumY + 5, { align: 'center' })
  h.bold(10.5); h.doc.setTextColor(...C.white)
  h.doc.text(fmt(totalPaid), M + bw2 + 4 + bw2 / 2, sumY + 11, { align: 'center' })
  h.doc.setTextColor(...C.dark)
  h.y = sumY + 18

  footers(h)

  const safeName = (patient?.name || 'patient').replace(/[^a-z0-9]/gi, '_')
  h.doc.save(`Patient_Report_${safeName}_${patient?.patient_id || ''}.pdf`)
}
