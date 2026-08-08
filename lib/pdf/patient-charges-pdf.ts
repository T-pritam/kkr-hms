/**
 * Patient charges statement PDF.
 *
 * A4 **portrait**, on the KKR Diagnostic Centre letterhead (see
 * `letterhead.ts`) — the same treatment as the lab report, discharge summary
 * and charge sheet: a minimal Name/Age-Sex/Date/Id-No block, a centred
 * title, and a bordered black-and-white table (no colour fills — the
 * clinic's printer is black-and-white).
 *
 * This is the patient Charges tab's own export — distinct from
 * `patient-pdf.ts`'s landscape "Patient Billing Report" (KPIs, doctor
 * visits, payments, the works). This one is scoped to exactly what that tab
 * shows: the itemised charges list and its total.
 */

import { M, fmt, fmtDate } from './base'
import { formatAgeSex } from '@/lib/patients/age'
import type { AgeSubject } from '@/lib/patients/age'
import {
  mkLetterheadDoc, minimalPatientBlock, letterheadSectionTitle, letterheadTable, autoPrint,
} from './letterhead'
import type { LetterheadMode } from './letterhead'

export interface PatientChargesRow {
  charge_date: string
  charge_type: string
  description?: string | null
  qty: number
  amount: number
}

export interface PatientChargesPatient extends AgeSubject {
  name: string
  patient_id: string | null
  gender?: string | null
}

export interface PatientChargesData {
  patient: PatientChargesPatient
  charges: PatientChargesRow[]
}

function total(charges: PatientChargesRow[]): number {
  return charges.reduce((sum, c) => sum + Number(c.amount || 0), 0)
}

/**
 * Charges in date order, with the date said once per day.
 *
 * A twelve-day stay repeated the date on every single line, which is what made
 * the statement hard to read. Banding each day with its own subtotal fixed the
 * repetition but replaced it with a page of running totals nobody asked for, so
 * this is the middle ground: an ordinary Date column, filled on the first charge
 * of a day and left blank for the rest, and one total at the very bottom.
 *
 * Oldest day first — a bill reads forwards through the stay.
 */
export function chargeRowsByDate(charges: PatientChargesRow[]): string[][] {
  const days = new Map<string, PatientChargesRow[]>()

  for (const charge of charges) {
    const day = String(charge.charge_date || '').slice(0, 10)
    const bucket = days.get(day)
    if (bucket) bucket.push(charge)
    else days.set(day, [charge])
  }

  const sorted = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return sorted.flatMap(([day, rows]) =>
    rows.map((c, index) => [
      index === 0 ? fmtDate(day) : '',
      c.charge_type,
      c.description || '—',
      String(c.qty || 1),
      fmt(c.amount),
    ]),
  )
}

export function renderPatientCharges(data: PatientChargesData, mode: LetterheadMode = 'digital') {
  const h = mkLetterheadDoc(mode)
  const { patient, charges } = data

  minimalPatientBlock(h, {
    name: patient.name || 'Patient',
    ageSex: formatAgeSex(patient) || '—',
    date: fmtDate(new Date().toISOString()),
    idNo: patient.patient_id || '—',
  })

  letterheadSectionTitle(h, 'PATIENT CHARGES')

  if (charges.length === 0) {
    h.doc.setFont('helvetica', 'normal')
    h.doc.setFontSize(9)
    h.doc.setTextColor(0, 0, 0)
    h.doc.text('No charges recorded yet.', M, h.y)
    return h.doc
  }

  letterheadTable(
    h,
    [
      { label: 'Date', width: 22 },
      { label: 'Charge', width: 34 },
      { label: 'Description', width: 38 },
      { label: 'Qty', width: 10, align: 'right' },
      { label: 'Amount', width: 22, align: 'right' },
    ],
    chargeRowsByDate(charges),
    { totalLabel: 'TOTAL', totalValue: fmt(total(charges)) },
  )

  return h.doc
}

export function patientChargesFilename(data: PatientChargesData): string {
  const safeName = (data.patient?.name || 'patient').replace(/[^a-z0-9]/gi, '_')
  return `Patient_Charges_${safeName}.pdf`
}

export function generatePatientChargesPDF(data: PatientChargesData): void {
  renderPatientCharges(data, 'digital').save(patientChargesFilename(data))
}

/** Renders the print (no-background) copy and sends it straight to the
 * browser's print dialog, for the pre-printed letterhead paper. */
export function printPatientCharges(data: PatientChargesData): void {
  autoPrint(renderPatientCharges(data, 'print'))
}
