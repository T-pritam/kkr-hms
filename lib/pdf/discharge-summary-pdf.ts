/**
 * Discharge summary PDF.
 *
 * A4 **portrait**, laid out to the client's template:
 *
 *   Page 1  — hospital branding and the patient's details, and nothing else.
 *             It is the cover the patient's family looks at first, and it is
 *             what a receiving hospital reads before anything clinical.
 *   Page 2+ — plain content, one section after another.
 *
 * Styled to match `lab-report-pdf.ts` — borderless, navy section headings, the
 * shared footer band — so the two clinical documents a patient goes home with
 * look like they came from the same hospital.
 *
 * As with the lab report: no ✓ / ⚠ / ↑ / ↓ and no ₹. jsPDF's built-in Helvetica
 * is WinAnsi-encoded and renders them as substitute characters.
 */

import { C, M, fmtDate, fmtDateTime, mkDoc, footers } from './base'
import { BRANDING } from './branding'
import { resolveAge } from '@/lib/patients/age'
import type { H } from './base'

// ── Geometry (portrait: pw 210, cw 182, right edge 196) ──────────────────────
const LINE_H = 4.6
const MED = {
  name: M,
  dosage: M + 74,
  qty: M + 110,
  usage: M + 138,
}

// ── Public types ─────────────────────────────────────────────────────────────

export interface DischargePatient {
  name: string
  patient_id: string | null
  age: number | null
  /** True when the age was stated by the patient rather than derived from a DOB. */
  age_approx?: boolean
  gender: string | null
  phone: string | null
  address: string | null
  blood_group?: string | null
}

export interface DischargeDoctor {
  doctor_name: string
  doctor_specialist: string | null
}

export interface DischargeMedication {
  medicine_name: string
  dosage: string | null
  quantity: string | null
  usage: string | null
}

export interface DischargeSummaryData {
  summary_no: string | null
  status: 'draft' | 'final'

  patient: DischargePatient

  admission_date: string | null
  discharge_date: string | null
  ward: string | null
  bed: string | null

  chief_complaints: string | null
  history_present_illness: string | null
  past_history: string | null
  diagnosis: string | null
  investigations: string | null
  clinical_summary: string | null

  condition_on_discharge: string | null
  vitals_bp: string | null
  vitals_pulse: string | null
  vitals_temp: string | null
  vitals_spo2: string | null

  advice_notes: string | null
  follow_up_date: string | null
  follow_up_instructions: string | null

  doctors: DischargeDoctor[]
  medications: DischargeMedication[]

  created_by_name: string | null
  finalised_by_name: string | null
  finalised_at: string | null
}

/** Fetches everything the summary needs. Split out so the renderer is testable. */
export async function fetchDischargeSummaryData(
  patientId: string,
  caseSheetId: string,
): Promise<DischargeSummaryData> {
  const [sheetRes, patientRes] = await Promise.all([
    fetch(`/api/patients/${patientId}/case-sheets/${caseSheetId}`),
    fetch(`/api/patients/${patientId}`),
  ])

  const sheetJson = await sheetRes.json()
  if (!sheetRes.ok || !sheetJson.success) {
    throw new Error(sheetJson.error || 'Failed to load the case sheet')
  }

  // The summary is still worth printing if the patient lookup fails; the cover
  // falls back to placeholders rather than throwing.
  const patientJson = await patientRes.json().catch(() => null)
  const raw = patientJson?.patient ?? null
  const sheet = sheetJson.data
  const age = resolveAge(raw)

  return {
    ...sheet,
    patient: {
      name: raw?.name || 'Patient',
      patient_id: raw?.patient_id ?? null,
      // Age used to be derived from the date of birth alone, so any patient who
      // gave their age at the desk rather than a birth date printed a blank one.
      // resolveAge covers both, and flags the approximate case so the cover can
      // say so rather than passing an estimate off as exact.
      age: age?.years ?? null,
      age_approx: age?.source === 'stated',
      gender: raw?.gender ?? null,
      phone: raw?.phone ?? null,
      address: raw?.address ?? null,
      blood_group: raw?.blood_group ?? null,
    },
  } as DischargeSummaryData
}

// ── Primitives ───────────────────────────────────────────────────────────────

function rule(h: H, weight = 0.3, colour: [number, number, number] = C.border): void {
  h.doc.setDrawColor(...colour)
  h.doc.setLineWidth(weight)
  h.doc.line(M, h.y, h.re, h.y)
}

const has = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

/** Section heading in the lab report's style: small navy caps over a hairline. */
function heading(h: H, title: string): void {
  h.checkPage(18)
  h.bold(8.5)
  h.doc.setTextColor(...C.navy)
  h.doc.text(title.toUpperCase(), M, h.y)
  h.doc.setTextColor(...C.dark)
  h.y += 2
  rule(h, 0.4, C.navy)
  h.y += 5
}

/** Wrapped body text that breaks across pages without losing a line. */
function body(h: H, text: string, size = 8.5): void {
  h.normal(size)
  h.doc.setTextColor(...C.dark)
  const lines: string[] = h.doc.splitTextToSize(text.trim(), h.cw)
  for (const line of lines) {
    if (h.y + LINE_H > h.ph - 20) {
      h.doc.addPage()
      h.y = M
    }
    h.doc.text(line, M, h.y)
    h.y += LINE_H
  }
  h.y += 3
}

/** A section that prints only when it has something to say. */
function textSection(h: H, title: string, value: string | null | undefined): void {
  if (!has(value)) return
  heading(h, title)
  body(h, value)
}

// ── Page 1: cover ────────────────────────────────────────────────────────────

function coverHeader(h: H): void {
  const logo = BRANDING.logo
  let textLeft = M
  let centre = h.pw / 2

  if (logo) {
    try {
      h.doc.addImage(logo.dataUri, logo.format, M, h.y, logo.widthMm, logo.heightMm)
      textLeft = M + logo.widthMm + 4
      centre = textLeft + (h.re - textLeft) / 2
    } catch {
      // A bad data URI must not stop a discharge summary printing.
    }
  }

  const top = h.y
  h.bold(17)
  h.doc.setTextColor(...C.navy)
  h.doc.text(BRANDING.name, centre, top + 7, { align: 'center' })

  h.normal(8.5)
  h.doc.setTextColor(...C.muted)
  h.doc.text(BRANDING.address, centre, top + 13.5, { align: 'center' })
  h.doc.text(
    [BRANDING.phone && `Ph: ${BRANDING.phone}`, BRANDING.email].filter(Boolean).join('   |   '),
    centre, top + 18.5, { align: 'center' },
  )

  h.doc.setTextColor(...C.dark)
  h.y = Math.max(top + 23, logo ? top + logo.heightMm + 3 : 0)
  rule(h, 0.8, C.navy)
  h.y += 14
}

function coverTitle(h: H, data: DischargeSummaryData): void {
  h.bold(15)
  h.doc.setTextColor(...C.navy)
  h.doc.text('DISCHARGE SUMMARY', h.pw / 2, h.y, { align: 'center' })
  h.y += 7

  h.normal(8.5)
  h.doc.setTextColor(...C.muted)
  const meta = [
    data.summary_no && `No: ${data.summary_no}`,
    data.discharge_date && `Date: ${fmtDate(data.discharge_date)}`,
  ].filter(Boolean).join('        ')
  if (meta) h.doc.text(meta, h.pw / 2, h.y, { align: 'center' })

  h.doc.setTextColor(...C.dark)
  h.y += 16
}

/** Two-column label/value block, borderless, matching the lab report. */
function detailColumns(h: H, left: [string, string][], right: [string, string][]): void {
  const top = h.y
  const rightX = M + 96

  const column = (rows: [string, string][], labelX: number, valueX: number, wrapTo: number) => {
    let y = top
    for (const [label, value] of rows) {
      h.normal(8.5)
      h.doc.setTextColor(...C.muted)
      h.doc.text(label, labelX, y)
      h.doc.text(':', valueX - 3, y)

      h.bold(8.5)
      h.doc.setTextColor(...C.dark)
      const lines: string[] = h.doc.splitTextToSize(String(value), wrapTo)
      for (const line of lines) {
        h.doc.text(line, valueX, y)
        y += 5.4
      }
    }
    return y
  }

  const leftEnd = column(left, M, M + 30, 60)
  const rightEnd = column(right, rightX, rightX + 30, 66)

  h.doc.setTextColor(...C.dark)
  h.y = Math.max(leftEnd, rightEnd)
}

function coverDetails(h: H, data: DischargeSummaryData): void {
  const { patient } = data

  // "~45 Y" when the patient stated an age rather than a birth date. The tilde
  // is deliberate: a treating doctor reading this later should be able to tell
  // a verified age from one somebody gave at the desk.
  const age =
    patient.age !== null && patient.age !== undefined
      ? `${patient.age_approx ? '~' : ''}${patient.age} Y`
      : null

  const ageSex = [age, patient.gender || null].filter(Boolean).join(' / ') || '—'

  const left: [string, string][] = [
    ['Name', patient.name || '—'],
    ['Age / Sex', ageSex],
    ['Patient ID', patient.patient_id || '—'],
    ['Phone', patient.phone || '—'],
  ]

  if (patient.blood_group) left.push(['Blood group', patient.blood_group])
  left.push(['Address', patient.address || '—'])

  const right: [string, string][] = [
    ['Admitted', fmtDate(data.admission_date)],
    ['Discharged', fmtDate(data.discharge_date)],
  ]

  const place = [data.ward, data.bed && `Bed ${data.bed}`].filter(Boolean).join(' / ')
  if (place) right.push(['Ward / Bed', place])
  if (has(data.condition_on_discharge)) right.push(['Condition', data.condition_on_discharge])

  const doctors = data.doctors || []
  if (doctors.length > 0) {
    right.push([
      doctors.length > 1 ? 'Consultants' : 'Consultant',
      doctors.map(d => d.doctor_name).join(', '),
    ])
  }

  rule(h, 0.4)
  h.y += 8
  detailColumns(h, left, right)
  h.y += 6
  rule(h, 0.4)
}

// ── Page 2+: content ─────────────────────────────────────────────────────────

function vitalsSection(h: H, data: DischargeSummaryData): void {
  const vitals = [
    data.vitals_bp && `BP ${data.vitals_bp}`,
    data.vitals_pulse && `Pulse ${data.vitals_pulse}`,
    data.vitals_temp && `Temp ${data.vitals_temp}`,
    data.vitals_spo2 && `SpO2 ${data.vitals_spo2}`,
  ].filter(Boolean) as string[]

  if (vitals.length === 0 && !has(data.condition_on_discharge)) return

  heading(h, 'Condition on Discharge')
  if (has(data.condition_on_discharge)) body(h, data.condition_on_discharge)
  if (vitals.length > 0) body(h, vitals.join('        '), 8)
}

function medicationHeadings(h: H): void {
  h.bold(8)
  h.doc.setTextColor(...C.navy)
  h.doc.text('Medicine', MED.name, h.y)
  h.doc.text('Dosage', MED.dosage, h.y)
  h.doc.text('Qty', MED.qty, h.y)
  h.doc.text('Usage', MED.usage, h.y)
  h.doc.setTextColor(...C.dark)
  h.y += 2
  rule(h, 0.3)
  h.y += 4.5
}

function medicationSection(h: H, medications: DischargeMedication[]): void {
  if (!medications || medications.length === 0) return

  heading(h, 'Discharge Advice — Medication')
  medicationHeadings(h)

  for (const med of medications) {
    // Repeat the column headings after a page break — the same fix the lab
    // report needed, where page two arrived as an unlabelled list.
    if (h.y + 6 > h.ph - 22) {
      h.doc.addPage()
      h.y = M
      medicationHeadings(h)
    }

    h.normal(8.5)
    h.doc.setTextColor(...C.dark)
    const nameLines: string[] = h.doc.splitTextToSize(med.medicine_name, MED.dosage - MED.name - 4)
    const usageLines: string[] = h.doc.splitTextToSize(med.usage || '—', h.re - MED.usage)

    h.doc.text(nameLines[0], MED.name, h.y)
    h.doc.setTextColor(...C.muted)
    h.doc.text(med.dosage || '—', MED.dosage, h.y)
    h.doc.text(med.quantity || '—', MED.qty, h.y)
    h.doc.text(usageLines[0], MED.usage, h.y)
    h.doc.setTextColor(...C.dark)

    // Wrapped remainders of either column, so a long name never overruns the
    // dosage and a long usage note never runs off the page.
    const extra = Math.max(nameLines.length, usageLines.length)
    for (let i = 1; i < extra; i++) {
      h.y += LINE_H
      h.normal(8.5)
      if (nameLines[i]) {
        h.doc.setTextColor(...C.dark)
        h.doc.text(nameLines[i], MED.name, h.y)
      }
      if (usageLines[i]) {
        h.doc.setTextColor(...C.muted)
        h.doc.text(usageLines[i], MED.usage, h.y)
      }
      h.doc.setTextColor(...C.dark)
    }

    h.y += 5.8
  }

  h.y += 1
  rule(h, 0.3)
  h.y += 6
}

function followUpSection(h: H, data: DischargeSummaryData): void {
  if (!has(data.follow_up_instructions) && !data.follow_up_date) return

  heading(h, 'Follow-up')
  if (data.follow_up_date) {
    h.bold(9)
    h.doc.setTextColor(...C.navy)
    h.doc.text(`Review on ${fmtDate(data.follow_up_date)}`, M, h.y)
    h.doc.setTextColor(...C.dark)
    h.y += 6
  }
  if (has(data.follow_up_instructions)) body(h, data.follow_up_instructions)
}

function signOff(h: H, data: DischargeSummaryData): void {
  h.checkPage(46)
  h.y += 6

  h.normal(8.5)
  h.doc.setTextColor(...C.muted)
  h.doc.text('- -   End of Summary   - -', h.pw / 2, h.y, { align: 'center' })
  h.doc.setTextColor(...C.dark)
  h.y += 16

  // A signature rule per consulting doctor, up to three across the page —
  // beyond that they are simply listed, which is what a wide consultant panel
  // looks like on a real summary.
  const doctors = (data.doctors || []).slice(0, 3)

  if (doctors.length > 0) {
    const slotWidth = h.cw / doctors.length
    const lineY = h.y

    doctors.forEach((doctor, i) => {
      const left = M + i * slotWidth
      const right = left + slotWidth - 8

      h.doc.setDrawColor(...C.muted)
      h.doc.setLineWidth(0.3)
      h.doc.line(left, lineY, right, lineY)

      h.bold(8)
      h.doc.setTextColor(...C.dark)
      h.doc.text(doctor.doctor_name, left, lineY + 4.5)

      if (doctor.doctor_specialist) {
        h.normal(7)
        h.doc.setTextColor(...C.muted)
        h.doc.text(doctor.doctor_specialist, left, lineY + 8.5)
      }
    })

    h.doc.setTextColor(...C.dark)
    h.y = lineY + 14
  }

  const attribution = [
    data.created_by_name && `Prepared by: ${data.created_by_name}`,
    data.finalised_by_name && `Finalised by: ${data.finalised_by_name}`,
    data.finalised_at && `on ${fmtDateTime(data.finalised_at)}`,
  ].filter(Boolean).join('        ')

  if (attribution) {
    h.normal(7)
    h.doc.setTextColor(...C.muted)
    h.doc.text(attribution, M, h.y)
    h.doc.setTextColor(...C.dark)
    h.y += 5
  }
}

/**
 * Diagonal DRAFT watermark on every page.
 *
 * Drawn after the content, in light grey, so an unfinished summary can never be
 * printed and handed over as the real thing. Removed the moment it is
 * finalised.
 */
function draftWatermark(h: H): void {
  const total = h.doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    h.doc.setPage(i)
    h.doc.setFont('helvetica', 'bold')
    h.doc.setFontSize(64)
    h.doc.setTextColor(225, 229, 235)
    h.doc.text('DRAFT', h.pw / 2, h.ph / 2, { align: 'center', angle: 32 })
  }
  h.doc.setTextColor(...C.dark)
}

// ── Entry points ─────────────────────────────────────────────────────────────

export function dischargeSummaryFilename(data: DischargeSummaryData): string {
  const safeName = (data.patient?.name || 'patient').replace(/[^a-z0-9]/gi, '_')
  const safeNo = (data.summary_no || 'summary').replace(/[^a-z0-9]/gi, '_')
  return `Discharge_Summary_${safeName}_${safeNo}.pdf`
}

/**
 * Renders the summary and hands back the document without saving it.
 *
 * Split out because the download can append lab reports and scanned sheets:
 * merging needs the bytes, and `save()` would download the summary on its own
 * as a side effect of assembling the combined file.
 */
export function renderDischargeSummary(data: DischargeSummaryData) {
  const h = mkDoc('portrait')

  // ── Page 1: branding and patient details, nothing else ───────────────────
  coverHeader(h)
  coverTitle(h, data)
  coverDetails(h, data)

  // ── Page 2 onwards: the content ──────────────────────────────────────────
  h.doc.addPage()
  h.y = M

  textSection(h, 'Chief Complaints', data.chief_complaints)
  textSection(h, 'History of Present Illness', data.history_present_illness)
  textSection(h, 'Past History', data.past_history)
  textSection(h, 'Diagnosis', data.diagnosis)
  textSection(h, 'Investigations', data.investigations)
  textSection(h, 'Summary / Course in Hospital', data.clinical_summary)
  vitalsSection(h, data)
  medicationSection(h, data.medications || [])
  textSection(h, 'Discharge Advice', data.advice_notes)
  followUpSection(h, data)

  signOff(h, data)
  footers(h)

  if (data.status !== 'final') draftWatermark(h)

  return h.doc
}

export function generateDischargeSummaryPDF(data: DischargeSummaryData): void {
  renderDischargeSummary(data).save(dischargeSummaryFilename(data))
}
