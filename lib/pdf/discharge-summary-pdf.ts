/**
 * Discharge summary PDF.
 *
 * A4 **portrait**, on the KKR Diagnostic Centre letterhead (see
 * `letterhead.ts`) — `renderDischargeSummary` takes a `mode` so callers can
 * render either the self-contained 'digital' copy (letterhead background
 * baked in) or the 'print' copy (no background, same coordinates) meant to
 * go onto the pre-printed paper.
 *
 * Styled to match `lab-report-pdf.ts`: a centred document title, then
 * left-aligned black section headings for the clinical content — no colour
 * fills or red/navy accents, since the clinic's printer is black-and-white
 * (`LETTERHEAD_CONFIG.useColor`). The patient identification block at the
 * top is deliberately minimal (Name / Age-Sex / Date / Id No, matching the
 * client's sample reports); everything else the old cover page carried
 * (phone, blood group, address, admission/discharge, condition, vitals,
 * consultants) moved into a compact meta block under the title instead.
 */

import { M, fmtDate, fmtDateTime } from './base'
import { resolveAge } from '@/lib/patients/age'
import type { H } from './base'
import {
  mkLetterheadDoc, minimalPatientBlock, letterheadSectionTitle, letterheadTable, autoPrint,
} from './letterhead'
import type { LetterheadMode } from './letterhead'

const has = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

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
  discharge_time: string | null
  discharge_received_by: string | null

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

function rule(h: H, weight = 0.3): void {
  h.doc.setDrawColor(0, 0, 0)
  h.doc.setLineWidth(weight)
  h.doc.line(M, h.y, h.re, h.y)
}

/** Left-aligned, bold, black — the clinical-content heading style shared
 * with the lab report's per-test headings, distinct from the one centred
 * document title at the very top. */
function heading(h: H, title: string): void {
  h.checkPage(14)
  h.doc.setFont('helvetica', 'bold')
  h.doc.setFontSize(9.5)
  h.doc.setTextColor(0, 0, 0)
  h.doc.text(title.toUpperCase(), M, h.y)
  h.y += 5
}

/** Wrapped body text that breaks across pages without losing a line. */
function body(h: H, text: string): void {
  h.doc.setFont('helvetica', 'normal')
  h.doc.setFontSize(9)
  h.doc.setTextColor(0, 0, 0)
  const lines: string[] = h.doc.splitTextToSize(text.trim(), h.cw)
  for (const line of lines) {
    h.checkPage(6)
    h.doc.text(line, M, h.y)
    h.y += 4.6
  }
  h.y += 5
}

/** A section that prints only when it has something to say. */
function textSection(h: H, title: string, value: string | null | undefined): void {
  if (!has(value)) return
  heading(h, title)
  body(h, value)
}

// ── Meta block: everything besides Name/Age-Sex/Date/Id No ────────────────────

function metaLine(h: H, label: string, value: string, x: number): void {
  h.doc.setFont('helvetica', 'bold')
  h.doc.setFontSize(8.5)
  h.doc.setTextColor(0, 0, 0)
  h.doc.text(label, x, h.y)
  h.doc.setFont('helvetica', 'normal')
  h.doc.text(value, x + 26, h.y)
}

function metaBlock(h: H, data: DischargeSummaryData): void {
  const { patient } = data
  const col2 = M + 100

  h.doc.setFont('helvetica', 'normal')
  h.doc.setFontSize(8.5)

  metaLine(h, 'Summary No', data.summary_no || '—', M)
  metaLine(h, 'Admission', fmtDate(data.admission_date), col2)
  h.y += 5.5

  const discharge = [
    fmtDate(data.discharge_date),
    data.discharge_time && data.discharge_time.slice(0, 5),
  ].filter(Boolean).join(' at ')
  metaLine(h, 'Discharge', discharge || '—', col2)
  if (has(data.condition_on_discharge)) metaLine(h, 'Condition', data.condition_on_discharge, M)
  h.y += 5.5

  const vitals = [
    data.vitals_bp && `BP ${data.vitals_bp}`,
    data.vitals_pulse && `Pulse ${data.vitals_pulse}`,
    data.vitals_temp && `Temp ${data.vitals_temp}`,
    data.vitals_spo2 && `SpO2 ${data.vitals_spo2}`,
  ].filter(Boolean).join('   ')
  if (vitals) {
    metaLine(h, 'Vitals', vitals, M)
    h.y += 5.5
  }

  const doctors = data.doctors || []
  if (doctors.length > 0) {
    metaLine(
      h,
      doctors.length > 1 ? 'Doctors' : 'Doctor',
      doctors.map(d => d.doctor_name + (d.doctor_specialist ? ` (${d.doctor_specialist})` : '')).join(', '),
      M,
    )
    h.y += 5.5
  }

  const extras: [string, string][] = []
  if (patient.phone) extras.push(['Phone', patient.phone])
  if (patient.blood_group) extras.push(['Blood group', patient.blood_group])
  if (has(patient.address)) extras.push(['Address', patient.address as string])

  for (const [label, value] of extras) {
    h.checkPage(6)
    metaLine(h, label, value, M)
    h.y += 5.5
  }

  h.y += 4
  rule(h, 0.3)
  h.y += 7
}

// ── Medications ─────────────────────────────────────────────────────────────

function medicationSection(h: H, medications: DischargeMedication[]): void {
  if (!medications || medications.length === 0) return

  heading(h, 'Discharge Advice — Medication')
  letterheadTable(
    h,
    [
      { label: 'Medicine', width: 34 },
      { label: 'Dosage', width: 18 },
      { label: 'Qty', width: 12, align: 'right' },
      { label: 'Usage', width: 26 },
    ],
    medications.map(med => [
      med.medicine_name,
      med.dosage || '—',
      med.quantity || '—',
      med.usage || '—',
    ]),
  )
}

// ── Follow-up and sign-off ──────────────────────────────────────────────────

function followUpSection(h: H, data: DischargeSummaryData): void {
  if (!has(data.follow_up_instructions) && !data.follow_up_date) return

  heading(h, 'Follow-up')
  if (data.follow_up_date) {
    h.doc.setFont('helvetica', 'bold')
    h.doc.setFontSize(9.5)
    h.doc.text(`Review on ${fmtDate(data.follow_up_date)}`, M, h.y)
    h.y += 6.5
  }
  if (has(data.follow_up_instructions)) body(h, data.follow_up_instructions)
}

function signOff(h: H, data: DischargeSummaryData): void {
  h.checkPage(40)
  h.y += 5

  h.doc.setFont('helvetica', 'normal')
  h.doc.setFontSize(8)
  h.doc.setTextColor(0, 0, 0)
  h.doc.text('- -   End of Summary   - -', h.pw / 2, h.y, { align: 'center' })
  h.y += 14

  // A signature rule per consulting doctor, up to three across the page —
  // beyond that they are simply listed in the meta block above.
  const doctors = (data.doctors || []).slice(0, 3)

  if (doctors.length > 0) {
    const slotWidth = h.cw / doctors.length
    const lineY = h.y

    doctors.forEach((doctor, i) => {
      const left = M + i * slotWidth
      const right = left + slotWidth - 8

      h.doc.setDrawColor(0, 0, 0)
      h.doc.setLineWidth(0.3)
      h.doc.line(left, lineY, right, lineY)

      h.doc.setFont('helvetica', 'bold')
      h.doc.setFontSize(8.5)
      h.doc.text(doctor.doctor_name, left, lineY + 4.5)

      if (doctor.doctor_specialist) {
        h.doc.setFont('helvetica', 'normal')
        h.doc.setFontSize(7.5)
        h.doc.text(doctor.doctor_specialist, left, lineY + 9)
      }
    })

    h.y = lineY + 15
  }

  const attribution = [
    data.created_by_name && `Prepared by: ${data.created_by_name}`,
    data.finalised_by_name && `Finalised by: ${data.finalised_by_name}`,
    data.finalised_at && `on ${fmtDateTime(data.finalised_at)}`,
    data.discharge_received_by && `Received by: ${data.discharge_received_by}`,
  ].filter(Boolean).join('        ')

  if (attribution) {
    h.doc.setFont('helvetica', 'normal')
    h.doc.setFontSize(7)
    h.doc.text(attribution, M, h.y)
    h.y += 6
  }
}

/**
 * Diagonal DRAFT watermark on every page.
 *
 * Drawn after the content, in light grey, so an unfinished summary can never be
 * printed and handed over as the real thing. Removed the moment it is
 * finalised. Always this exact light grey regardless of `useColor` — it's a
 * pale tint, not a saturated colour, and a B&W printer renders it fine; going
 * through `ink()` would flatten it to solid black and bury the text under it.
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
  h.doc.setTextColor(0, 0, 0)
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
 * as a side effect of assembling the combined file. `mode` defaults to
 * 'digital' since that's what a merged discharge pack always wants.
 */
export function renderDischargeSummary(data: DischargeSummaryData, mode: LetterheadMode = 'digital') {
  const h = mkLetterheadDoc(mode)
  const { patient } = data

  // "~45 Y" when the patient stated an age rather than a birth date.
  const age = patient.age !== null && patient.age !== undefined
    ? `${patient.age_approx ? '~' : ''}${patient.age} Y`
    : null
  const ageSex = [age, patient.gender || null].filter(Boolean).join(' / ') || '—'

  minimalPatientBlock(h, {
    name: patient.name || 'Patient',
    ageSex,
    date: fmtDate(data.discharge_date || data.admission_date),
    idNo: patient.patient_id || '—',
  })

  letterheadSectionTitle(h, 'DISCHARGE SUMMARY')
  metaBlock(h, data)

  textSection(h, 'Chief Complaints', data.chief_complaints)
  textSection(h, 'History of Present Illness', data.history_present_illness)
  textSection(h, 'Past History', data.past_history)
  textSection(h, 'Diagnosis', data.diagnosis)
  textSection(h, 'Investigations', data.investigations)
  textSection(h, 'Summary / Course in Hospital', data.clinical_summary)
  medicationSection(h, data.medications || [])
  textSection(h, 'Discharge Advice', data.advice_notes)
  followUpSection(h, data)

  signOff(h, data)

  if (data.status !== 'final') draftWatermark(h)

  return h.doc
}

export function generateDischargeSummaryPDF(data: DischargeSummaryData): void {
  renderDischargeSummary(data, 'digital').save(dischargeSummaryFilename(data))
}

/** Renders the print (no-background) copy and sends it straight to the
 * browser's print dialog, for the pre-printed letterhead paper. */
export function printDischargeSummary(data: DischargeSummaryData): void {
  autoPrint(renderDischargeSummary(data, 'print'))
}
