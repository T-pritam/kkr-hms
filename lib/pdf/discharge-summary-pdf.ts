/**
 * Discharge summary PDF.
 *
 * A4 **portrait**, laid out to the client's template. The hospital branding,
 * title, and the patient's admission/discharge details sit at the top of
 * page 1; the clinical content — complaints, history, diagnosis,
 * investigations, summary, medication, advice and follow-up — continues
 * immediately after on the same page, spilling onto further pages only when
 * a section actually runs out of room. It used to force a page break right
 * after the patient details regardless of how much of page 1 was still
 * blank, which is why a summary with little to say could leave more than
 * half a page empty before the content resumed on page 2.
 *
 * All heading and body text is set at 2x its original size for readability.
 * The patient/admission detail block used to be a two-column grid — at this
 * size two columns of label+value text no longer fit side by side on an A4
 * portrait page, so it is now a single stacked column instead.
 *
 * Styled to match `lab-report-pdf.ts` — borderless, navy section headings —
 * so the two clinical documents a patient goes home with look like they came
 * from the same hospital. Unlike the shared footer used elsewhere, this one
 * omits the "Generated: ..." timestamp entirely — a discharge summary is
 * dated by its own discharge date, not by when someone happened to print it.
 *
 * As with the lab report: no ✓ / ⚠ / ↑ / ↓ and no ₹. jsPDF's built-in
 * Helvetica is WinAnsi-encoded and renders them as substitute characters.
 */

import { C, M, fmtDate, fmtDateTime, mkDoc, footers } from './base'
import { BRANDING } from './branding'
import { resolveAge } from '@/lib/patients/age'
import type { H } from './base'

// ── Geometry (portrait: pw 210, cw 182, right edge 196) ──────────────────────
const LINE_H = 9.2
const MED = {
  name: M,
  dosage: M + 80,
  qty: M + 120,
  usage: M + 152,
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
  h.checkPage(30)
  h.bold(17)
  h.doc.setTextColor(...C.navy)
  h.doc.text(title.toUpperCase(), M, h.y)
  h.doc.setTextColor(...C.dark)
  h.y += 4
  rule(h, 0.4, C.navy)
  h.y += 10
}

/** Wrapped body text that breaks across pages without losing a line. */
function body(h: H, text: string, size = 17): void {
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
  h.y += 6
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
  h.bold(34)
  h.doc.setTextColor(...C.navy)
  h.doc.text(BRANDING.name, centre, top + 14, { align: 'center' })

  h.normal(17)
  h.doc.setTextColor(...C.muted)
  h.doc.text(BRANDING.address, centre, top + 27, { align: 'center' })
  h.doc.text(
    [BRANDING.phone && `Ph: ${BRANDING.phone}`, BRANDING.email].filter(Boolean).join('   |   '),
    centre, top + 37, { align: 'center' },
  )

  h.doc.setTextColor(...C.dark)
  h.y = Math.max(top + 46, logo ? top + logo.heightMm + 3 : 0)
  rule(h, 0.8, C.navy)
  h.y += 28
}

function coverTitle(h: H, data: DischargeSummaryData): void {
  h.bold(30)
  h.doc.setTextColor(...C.navy)
  h.doc.text('DISCHARGE SUMMARY', h.pw / 2, h.y, { align: 'center' })
  h.y += 14

  h.normal(17)
  h.doc.setTextColor(...C.muted)
  const meta = [
    data.summary_no && `No: ${data.summary_no}`,
    data.discharge_date && `Date: ${fmtDate(data.discharge_date)}`,
  ].filter(Boolean).join('        ')
  if (meta) h.doc.text(meta, h.pw / 2, h.y, { align: 'center' })

  h.doc.setTextColor(...C.dark)
  h.y += 32
}

/**
 * One label/value row, stacked full-width.
 *
 * Replaces the old side-by-side two-column grid — two columns of label and
 * value text no longer both fit across an A4 portrait page's content width
 * once the font doubled, so each field gets its own line instead.
 */
function detailLine(h: H, label: string, value: string): void {
  const labelW = 46

  h.normal(17)
  h.doc.setTextColor(...C.muted)
  h.doc.text(label, M, h.y)
  h.doc.text(':', M + labelW - 5, h.y)

  h.bold(17)
  h.doc.setTextColor(...C.dark)
  const lines: string[] = h.doc.splitTextToSize(value, h.cw - labelW)
  lines.forEach((line, i) => {
    if (i > 0) h.y += LINE_H
    h.doc.text(line, M + labelW, h.y)
  })

  h.doc.setTextColor(...C.dark)
  h.y += LINE_H
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

  const fields: [string, string][] = [
    ['Name', patient.name || '—'],
    ['Age / Sex', ageSex],
    ['Patient ID', patient.patient_id || '—'],
    ['Phone', patient.phone || '—'],
  ]

  if (patient.blood_group) fields.push(['Blood group', patient.blood_group])
  fields.push(['Address', patient.address || '—'])

  fields.push(['Admitted', fmtDate(data.admission_date)])
  fields.push(['Discharged', fmtDate(data.discharge_date)])

  const place = [data.ward, data.bed && `Bed ${data.bed}`].filter(Boolean).join(' / ')
  if (place) fields.push(['Ward / Bed', place])
  if (has(data.condition_on_discharge)) fields.push(['Condition', data.condition_on_discharge])

  const doctors = data.doctors || []
  if (doctors.length > 0) {
    fields.push([
      doctors.length > 1 ? 'Consultants' : 'Consultant',
      doctors.map(d => d.doctor_name).join(', '),
    ])
  }

  rule(h, 0.4)
  h.y += 10
  for (const [label, value] of fields) detailLine(h, label, value)
  h.y += 6
  rule(h, 0.4)
}

// ── Content ──────────────────────────────────────────────────────────────────

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
  if (vitals.length > 0) body(h, vitals.join('        '), 16)
}

function medicationHeadings(h: H): void {
  h.bold(16)
  h.doc.setTextColor(...C.navy)
  h.doc.text('Medicine', MED.name, h.y)
  h.doc.text('Dosage', MED.dosage, h.y)
  h.doc.text('Qty', MED.qty, h.y)
  h.doc.text('Usage', MED.usage, h.y)
  h.doc.setTextColor(...C.dark)
  h.y += 4
  rule(h, 0.3)
  h.y += 9
}

function medicationSection(h: H, medications: DischargeMedication[]): void {
  if (!medications || medications.length === 0) return

  heading(h, 'Discharge Advice — Medication')
  medicationHeadings(h)

  for (const med of medications) {
    // Repeat the column headings after a page break — the same fix the lab
    // report needed, where page two arrived as an unlabelled list.
    if (h.y + 12 > h.ph - 30) {
      h.doc.addPage()
      h.y = M
      medicationHeadings(h)
    }

    h.normal(17)
    h.doc.setTextColor(...C.dark)
    const nameLines: string[] = h.doc.splitTextToSize(med.medicine_name, MED.dosage - MED.name - 4)
    const dosageLines: string[] = h.doc.splitTextToSize(med.dosage || '—', MED.qty - MED.dosage - 4)
    const qtyLines: string[] = h.doc.splitTextToSize(med.quantity || '—', MED.usage - MED.qty - 4)
    const usageLines: string[] = h.doc.splitTextToSize(med.usage || '—', h.re - MED.usage)

    h.doc.text(nameLines[0], MED.name, h.y)
    h.doc.setTextColor(...C.muted)
    h.doc.text(dosageLines[0], MED.dosage, h.y)
    h.doc.text(qtyLines[0], MED.qty, h.y)
    h.doc.text(usageLines[0], MED.usage, h.y)
    h.doc.setTextColor(...C.dark)

    // Wrapped remainders of any column, so a long name, dosage or usage note
    // never overruns its neighbour or runs off the page.
    const extra = Math.max(nameLines.length, dosageLines.length, qtyLines.length, usageLines.length)
    for (let i = 1; i < extra; i++) {
      h.y += LINE_H
      h.normal(17)
      if (nameLines[i]) {
        h.doc.setTextColor(...C.dark)
        h.doc.text(nameLines[i], MED.name, h.y)
      }
      if (dosageLines[i]) {
        h.doc.setTextColor(...C.muted)
        h.doc.text(dosageLines[i], MED.dosage, h.y)
      }
      if (qtyLines[i]) {
        h.doc.setTextColor(...C.muted)
        h.doc.text(qtyLines[i], MED.qty, h.y)
      }
      if (usageLines[i]) {
        h.doc.setTextColor(...C.muted)
        h.doc.text(usageLines[i], MED.usage, h.y)
      }
      h.doc.setTextColor(...C.dark)
    }

    h.y += 11.6
  }

  h.y += 2
  rule(h, 0.3)
  h.y += 12
}

function followUpSection(h: H, data: DischargeSummaryData): void {
  if (!has(data.follow_up_instructions) && !data.follow_up_date) return

  heading(h, 'Follow-up')
  if (data.follow_up_date) {
    h.bold(18)
    h.doc.setTextColor(...C.navy)
    h.doc.text(`Review on ${fmtDate(data.follow_up_date)}`, M, h.y)
    h.doc.setTextColor(...C.dark)
    h.y += 12
  }
  if (has(data.follow_up_instructions)) body(h, data.follow_up_instructions)
}

function signOff(h: H, data: DischargeSummaryData): void {
  h.checkPage(90)
  h.y += 12

  h.normal(17)
  h.doc.setTextColor(...C.muted)
  h.doc.text('- -   End of Summary   - -', h.pw / 2, h.y, { align: 'center' })
  h.doc.setTextColor(...C.dark)
  h.y += 32

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

      h.bold(16)
      h.doc.setTextColor(...C.dark)
      h.doc.text(doctor.doctor_name, left, lineY + 9)

      if (doctor.doctor_specialist) {
        h.normal(14)
        h.doc.setTextColor(...C.muted)
        h.doc.text(doctor.doctor_specialist, left, lineY + 17)
      }
    })

    h.doc.setTextColor(...C.dark)
    h.y = lineY + 28
  }

  const attribution = [
    data.created_by_name && `Prepared by: ${data.created_by_name}`,
    data.finalised_by_name && `Finalised by: ${data.finalised_by_name}`,
    data.finalised_at && `on ${fmtDateTime(data.finalised_at)}`,
  ].filter(Boolean).join('        ')

  if (attribution) {
    h.normal(14)
    h.doc.setTextColor(...C.muted)
    h.doc.text(attribution, M, h.y)
    h.doc.setTextColor(...C.dark)
    h.y += 10
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

  // Branding, title and the patient's admission/discharge details, then the
  // clinical content continues immediately after on this same page — it only
  // moves to a new page when a section actually runs out of room.
  coverHeader(h)
  coverTitle(h, data)
  coverDetails(h, data)
  h.y += 10

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
  footers(h, { showGenerated: false })

  if (data.status !== 'final') draftWatermark(h)

  return h.doc
}

export function generateDischargeSummaryPDF(data: DischargeSummaryData): void {
  renderDischargeSummary(data).save(dischargeSummaryFilename(data))
}
