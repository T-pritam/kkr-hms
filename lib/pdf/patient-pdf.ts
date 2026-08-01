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
export function generatePatientPDF(data: PatientPDFData) {
  const { patient, billing, charges, installments, settlements, referral } = data
  const h = mkDoc()

  const totalCharges = Number(billing?.total_charges || 0)
  const totalPaid    = Number(billing?.patient_paid_amount || 0)
  const balance      = totalCharges - totalPaid

  // ── Header ─────────────────────────────────────────────────────────────────
  hdr(h,
    'Patient Billing Report',
    `${patient?.name || '—'}  •  ID: ${patient?.patient_id || '—'}  •  Joined: ${fmtDate(patient?.date_of_join)}`
  )

  // ── KPI boxes ──────────────────────────────────────────────────────────────
  boxRow(h, [
    { label: 'Total Charges',  value: fmt(totalCharges),                      accent: C.blue },
    { label: 'Total Paid',     value: fmt(totalPaid),                         accent: C.green },
    { label: 'Balance Due',    value: fmt(balance),                           accent: balance > 0 ? C.red : C.teal },
    { label: 'Doctor Fees',    value: fmt(billing?.total_doctor_fees || 0),   accent: C.purple },
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
    ['Base Charge (Package)',  fmt(billing?.base_charge || 0)],
    ['Other Charges',          fmt(billing?.patient_charges_total || 0)],
    ['Doctor Fees',            fmt(billing?.total_doctor_fees || 0)],
    ['Dr. Fees in Package',    billing?.doctor_fees_included_in_package ? 'Yes' : 'No'],
    ['Referral Commission',    fmt(billing?.referral_commission_amount || 0)],
    ['Commission in Package',  billing?.referral_commission_included_in_package ? 'Yes' : 'No'],
    ['Total Charges',          fmt(totalCharges)],
    ['Total Paid',             fmt(totalPaid)],
    ['Balance Due',            fmt(balance)],
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

  // ── Referral info ──────────────────────────────────────────────────────────
  if (referral || billing?.referral_commission_amount > 0) {
    sec(h, 'REFERRAL INFORMATION', C.teal)
    const refInfo: [string, string][] = [
      ['Name',        referral?.name || '—'],
      ['Phone',       referral?.phone || '—'],
      ['Commission',  fmt(billing?.referral_commission_amount || 0)],
      ['In Package',  billing?.referral_commission_included_in_package ? 'Yes' : 'No'],
      ['Settlement',  billing?.referral_settled ? 'Settled' : 'Pending'],
    ]
    refInfo.forEach(([lbl, val], i) => {
      if (i % 2 === 0) {
        h.doc.setFillColor(...C.tblAlt)
        h.doc.rect(M, h.y, h.cw, ROW_H, 'F')
      }
      h.bold(7.5); h.doc.setTextColor(...C.muted)
      h.doc.text(lbl, M + 3, h.y + 5)
      h.normal(7.5); h.doc.setTextColor(...C.dark)
      h.doc.text(val, M + 48, h.y + 5)
      h.doc.setDrawColor(...C.border); h.doc.setLineWidth(0.2)
      h.doc.line(M, h.y + ROW_H, M + h.cw, h.y + ROW_H)
      h.y += ROW_H
    })
    h.y += 4
  }

  // ── Doctor visits table ────────────────────────────────────────────────────
  sec(h, 'DOCTOR VISITS & SETTLEMENTS', C.purple)

  if (settlements.length > 0) {
    thead(h, [
      { label: '#',        x: M + 2 },
      { label: 'Doctor',   x: M + 11 },
      { label: 'Specialty',x: M + 82 },
      { label: 'Visits',   x: M + 148, align: 'center' },
      { label: 'Per Visit',x: M + 170, align: 'right' },
      { label: 'Total',    x: M + 205, align: 'right' },
      { label: 'Status',   x: M + 228 },
    ])
    let drTotal = 0
    settlements.forEach((s: any, i: number) => {
      drTotal += Number(s.total_amount || 0)
      trow(h, [
        { text: String(i + 1),                                   x: M + 2 },
        { text: (s.doctor?.name || '—').substring(0, 30),        x: M + 11 },
        { text: (s.doctor?.specialist || '—').substring(0, 26),  x: M + 82 },
        { text: String(s.visit_count || 0),                      x: M + 148, align: 'center' },
        { text: fmt(s.amount_per_visit),                         x: M + 170, align: 'right' },
        { text: fmt(s.total_amount),                             x: M + 205, align: 'right' },
        { text: s.settled ? 'Settled' : 'Pending',               x: M + 228 },
      ], i)
    })
    ttotal(h, [
      { text: 'TOTAL DOCTOR FEES', x: M + 11 },
      { text: fmt(drTotal),        x: M + 205, align: 'right' },
    ])
  } else {
    h.normal(8); h.doc.setTextColor(...C.muted)
    h.doc.text('No doctor visits recorded.', M + 4, h.y + 5)
    h.doc.setTextColor(...C.dark); h.y += 10
  }

  // ── Charges table ──────────────────────────────────────────────────────────
  sec(h, 'CHARGES', C.orange)

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
      { text: 'TOTAL CHARGES',  x: M + 11 },
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
      { label: 'Method',     x: M + 90 },
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
        { text: (inst.payment_method || 'cash').replace('_', ' '), x: M + 90 },
        { text: (inst.transaction_reference || '—').substring(0, 28), x: M + 140 },
        { text: (inst.remarks || '—').substring(0, 28),             x: M + 210 },
      ], i)
    })
    ttotal(h, [
      { text: 'TOTAL PAID', x: M + 11 },
      { text: fmt(payTotal), x: M + 60, align: 'right' },
    ])
  } else {
    h.normal(8); h.doc.setTextColor(...C.muted)
    h.doc.text('No payments recorded.', M + 4, h.y + 5)
    h.doc.setTextColor(...C.dark); h.y += 10
  }

  // ── Summary banner ─────────────────────────────────────────────────────────
  h.checkPage(20)
  const bw3 = (h.cw - 8) / 3
  const sumY = h.y
  // Charges
  h.doc.setFillColor(...C.blue)
  h.doc.rect(M, sumY, bw3, 14, 'F')
  h.bold(7); h.doc.setTextColor(186, 211, 245)
  h.doc.text('TOTAL CHARGES', M + bw3 / 2, sumY + 5, { align: 'center' })
  h.bold(10.5); h.doc.setTextColor(...C.white)
  h.doc.text(fmt(totalCharges), M + bw3 / 2, sumY + 11, { align: 'center' })
  // Paid
  h.doc.setFillColor(...C.green)
  h.doc.rect(M + bw3 + 4, sumY, bw3, 14, 'F')
  h.bold(7); h.doc.setTextColor(186, 211, 245)
  h.doc.text('TOTAL PAID', M + bw3 + 4 + bw3 / 2, sumY + 5, { align: 'center' })
  h.bold(10.5); h.doc.setTextColor(...C.white)
  h.doc.text(fmt(totalPaid), M + bw3 + 4 + bw3 / 2, sumY + 11, { align: 'center' })
  // Balance
  h.doc.setFillColor(...(balance > 0 ? C.red : C.teal))
  h.doc.rect(M + (bw3 + 4) * 2, sumY, bw3, 14, 'F')
  h.bold(7); h.doc.setTextColor(186, 211, 245)
  h.doc.text('BALANCE DUE', M + (bw3 + 4) * 2 + bw3 / 2, sumY + 5, { align: 'center' })
  h.bold(10.5); h.doc.setTextColor(...C.white)
  h.doc.text(fmt(balance), M + (bw3 + 4) * 2 + bw3 / 2, sumY + 11, { align: 'center' })
  h.doc.setTextColor(...C.dark)
  h.y = sumY + 18

  footers(h)

  const safeName = (patient?.name || 'patient').replace(/[^a-z0-9]/gi, '_')
  h.doc.save(`Patient_Report_${safeName}_${patient?.patient_id || ''}.pdf`)
}
