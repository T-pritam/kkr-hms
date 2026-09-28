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
import { combineCharges } from '@/lib/billing/group-charges'

/** Every line as it was entered, by date — or one line per charge. */
export type ChargesLayout = 'separate' | 'combined'

export interface PatientChargesRow {
  charge_date: string
  charge_type: string
  description?: string | null
  qty: number
  /** Decides whether the quantity is a count, an hours figure, or nothing. */
  billing_mode?: string | null
  /** The line total (rate × qty). */
  amount: number
  charge_item_id?: string | null
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

/**
 * What the Qty column says for a line.
 *
 * A quantity only means something on a one-off charge. A per-day row is one
 * unit of one day, so "1" there is noise; a per-hour row's quantity is really
 * its hours, and saying so is what stops a ₹1,200 oxygen line looking arbitrary.
 */
export function qtyCell(qty: number | null | undefined, billingMode?: string | null): string {
  const n = Number(qty) || 1
  if (billingMode === 'per_hour') return `${n} hrs`
  if (billingMode === 'per_day') return ''
  return String(n)
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
      qtyCell(c.qty, c.billing_mode),
      fmt(c.amount),
    ]),
  )
}

/**
 * The combined statement (client, 28 Sep): one line per charge — rate ×
 * days/qty = amount — instead of every day of a stay on its own line.
 */
export function combinedChargeRows(charges: PatientChargesRow[]): string[][] {
  return combineCharges(charges, c => {
    const qty = Number(c.qty) || 1
    const perDay = c.billing_mode === 'per_day'
    return {
      label: c.charge_type,
      itemId: c.charge_item_id,
      rate: perDay ? Number(c.amount) || 0 : (Number(c.amount) || 0) / qty,
      qty,
      billingMode: c.billing_mode,
    }
  }).map(line => [
    line.label,
    fmt(line.rate),
    line.unit ? `${line.quantity} ${line.unit === 'days' && line.quantity === 1 ? 'day' : line.unit}` : String(line.quantity),
    fmt(line.total),
  ])
}

export function renderPatientCharges(
  data: PatientChargesData,
  mode: LetterheadMode = 'digital',
  layout: ChargesLayout = 'separate',
) {
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

  if (layout === 'combined') {
    letterheadTable(
      h,
      [
        { label: 'Charge', width: 62 },
        { label: 'Rate', width: 22, align: 'right' },
        { label: 'Days / Qty', width: 20, align: 'right' },
        { label: 'Amount', width: 22, align: 'right' },
      ],
      combinedChargeRows(charges),
      { totalLabel: 'TOTAL', totalValue: fmt(total(charges)) },
    )
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

export function generatePatientChargesPDF(data: PatientChargesData, layout: ChargesLayout = 'separate'): void {
  renderPatientCharges(data, 'digital', layout).save(patientChargesFilename(data))
}

/** Renders the print (no-background) copy and sends it straight to the
 * browser's print dialog, for the pre-printed letterhead paper. */
export function printPatientCharges(data: PatientChargesData, layout: ChargesLayout = 'separate'): void {
  autoPrint(renderPatientCharges(data, 'print', layout))
}
