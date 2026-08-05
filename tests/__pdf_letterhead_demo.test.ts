/**
 * Dry-run generator, not a real test suite — renders 'digital' (letterhead
 * background baked in, for sharing) and 'print' (no background, for the
 * pre-printed paper stock) variants of three sample documents on the
 * rebuilt letterhead (lib/pdf/letterhead.ts), so config tweaks in
 * lib/pdf/letterhead-config.ts can be reviewed without touching the real
 * lab-report-pdf.ts / discharge-summary-pdf.ts / charge-sheet-pdf.ts yet.
 *
 * Run via `npm run pdf:demo`; output lands in tmp/pdf-demo/ (gitignored).
 *
 * Content is real data pulled from the production DB for patient
 * 624e115a-ca90-4bd2-9ca2-fae62f04e91f ("Chiru"), not placeholders.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { M, C, fmt, fmtDate } from '../lib/pdf/base'
import {
  mkLetterheadDoc, minimalPatientBlock, letterheadSectionTitle, letterheadTable, autoPrint,
} from '../lib/pdf/letterhead'
import { LETTERHEAD_CONFIG } from '../lib/pdf/letterhead-config'
import type { H } from '../lib/pdf/base'
import type { LetterheadMode } from '../lib/pdf/letterhead'

const OUT_DIR = `${process.cwd()}/tmp/pdf-demo`
fs.mkdirSync(OUT_DIR, { recursive: true })

const PATIENT = {
  name: 'Chiru',
  ageSex: '31 Y / Male',
  idNo: '5/26',
}

const BLACK: [number, number, number] = [0, 0, 0]
const ABNORMAL_COLOR = (): [number, number, number] => (LETTERHEAD_CONFIG.useColor ? C.red : BLACK)

function save(h: H, filename: string) {
  const bytes = h.doc.output('arraybuffer') as ArrayBuffer
  const outPath = `${OUT_DIR}/${filename}`
  fs.writeFileSync(outPath, Buffer.from(bytes))
  return outPath
}

// ── 1. Lab report ────────────────────────────────────────────────────────────
function renderLabReport(mode: LetterheadMode): H {
  const h = mkLetterheadDoc(mode)
  minimalPatientBlock(h, { ...PATIENT, date: '04/08/2026' })
  letterheadSectionTitle(h, 'COMPLETE BLOOD COUNT')

  const COL = { name: M, result: M + 78, mark: M + 106, unit: M + 114, ref: M + 146 }

  h.bold(8)
  h.doc.setTextColor(...BLACK)
  h.doc.text('Investigation', COL.name, h.y)
  h.doc.text('Result', COL.result, h.y)
  h.doc.text('Unit', COL.unit, h.y)
  h.doc.text('Biological Ref. Interval', COL.ref, h.y)
  h.y += 2
  h.doc.setDrawColor(...BLACK)
  h.doc.setLineWidth(0.3)
  h.doc.line(M, h.y, h.re, h.y)
  h.y += 5.5

  const rows = [
    { name: 'Hemoglobin', result: '12', mark: 'L', unit: 'g/dL', ref: '13.5 - 17.5' },
    { name: 'WBC Count', result: '44', mark: 'L', unit: 'cells/mm³', ref: '4000 - 11000' },
    { name: 'RBC Count', result: '1212', mark: 'H', unit: 'million/mm³', ref: '4.5 - 5.9' },
  ]

  for (const r of rows) {
    h.checkPage(6)
    h.doc.setFont('helvetica', 'bold')
    h.doc.setFontSize(8)
    h.doc.setTextColor(...ABNORMAL_COLOR())
    h.doc.text(r.result, COL.result, h.y)
    h.doc.text(r.mark, COL.mark, h.y)
    h.doc.setFont('helvetica', 'normal')
    h.doc.setTextColor(...BLACK)
    h.doc.text(r.name, COL.name, h.y)
    h.doc.text(r.unit, COL.unit, h.y)
    h.doc.text(r.ref, COL.ref, h.y)
    h.y += 6
  }

  h.y += 3
  h.normal(7)
  h.doc.setTextColor(...BLACK)
  h.doc.text('H = above reference interval          L = below reference interval', COL.name, h.y)
  h.y += 14

  h.normal(9.5)
  h.doc.text('Authorised Signatory', h.re, h.y, { align: 'right' })

  return h
}

// ── 2. Charges (bordered table) ────────────────────────────────────────────
function renderCharges(mode: LetterheadMode): H {
  const h = mkLetterheadDoc(mode)
  minimalPatientBlock(h, { ...PATIENT, date: '05/08/2026' })
  letterheadSectionTitle(h, 'PATIENT CHARGES')

  const charges = [
    { date: '2026-08-01', desc: 'Room Charges', qty: 1, rate: 3000 },
    { date: '2026-08-02', desc: 'Room Charges', qty: 1, rate: 3000 },
    { date: '2026-08-03', desc: 'Room Charges', qty: 1, rate: 3000 },
    { date: '2026-08-04', desc: 'Room Charges', qty: 1, rate: 3000 },
    { date: '2026-08-04', desc: 'Consultation Fee', qty: 1, rate: 300 },
    { date: '2026-08-04', desc: 'Room Charges', qty: 1, rate: 2000 },
    { date: '2026-08-04', desc: 'ICU Charges', qty: 1, rate: 5000 },
    { date: '2026-08-05', desc: 'Room Charges', qty: 1, rate: 3000 },
  ]
  const total = charges.reduce((sum, c) => sum + c.rate * c.qty, 0)

  letterheadTable(
    h,
    [
      { label: 'Date', width: 22 },
      { label: 'Description', width: 40 },
      { label: 'Qty', width: 15, align: 'right' },
      { label: 'Rate', width: 22, align: 'right' },
      { label: 'Amount', width: 22, align: 'right' },
    ],
    charges.map(c => [fmtDate(c.date), c.desc, String(c.qty), fmt(c.rate), fmt(c.rate * c.qty)]),
    { totalLabel: 'TOTAL', totalValue: fmt(total) },
  )

  return h
}

// ── 3. Discharge summary (real case sheet, patient 624e115a) ─────────────
function renderDischargeSummary(mode: LetterheadMode): H {
  const h = mkLetterheadDoc(mode)
  minimalPatientBlock(h, { ...PATIENT, date: '04/08/2026' })
  letterheadSectionTitle(h, 'DISCHARGE SUMMARY')

  const meta = (label: string, value: string, x: number) => {
    h.doc.setFont('helvetica', 'bold')
    h.doc.setFontSize(8.5)
    h.doc.setTextColor(...BLACK)
    h.doc.text(label, x, h.y)
    h.doc.setFont('helvetica', 'normal')
    h.doc.text(value, x + 26, h.y)
  }

  meta('Summary No', 'DS/2026/00002', M)
  meta('Admission', '03/08/2026', M + 100)
  h.y += 5.5
  meta('Condition', 'Improved', M)
  meta('Discharge', '04/08/2026', M + 100)
  h.y += 5.5
  meta('Vitals', 'BP 120/80  Pulse 77/min  Temp 98.6 F  SpO2 98%', M)
  h.y += 5.5
  meta('Doctors', 'Dr. Amit Patel (Orthopedics), Dr. Neha Verma (Pediatrics)', M)
  h.y += 9

  h.doc.setDrawColor(...BLACK)
  h.doc.setLineWidth(0.3)
  h.doc.line(M, h.y, h.re, h.y)
  h.y += 7

  const heading = (title: string) => {
    h.checkPage(14)
    h.doc.setFont('helvetica', 'bold')
    h.doc.setFontSize(9.5)
    h.doc.setTextColor(...BLACK)
    h.doc.text(title.toUpperCase(), M, h.y)
    h.y += 5
  }

  const body = (text: string) => {
    h.doc.setFont('helvetica', 'normal')
    h.doc.setFontSize(9)
    h.doc.setTextColor(...BLACK)
    const lines: string[] = h.doc.splitTextToSize(text, h.cw)
    for (const line of lines) {
      h.checkPage(6)
      h.doc.text(line, M, h.y)
      h.y += 4.6
    }
    h.y += 5
  }

  heading('Chief Complaints')
  body('Fever with chills for 4 days, generalised weakness, and 2 episodes of loose stools yesterday.')

  heading('History of Present Illness')
  body(
    'Patient was apparently well till 4 days ago, when he developed high-grade fever associated with ' +
    'chills, more in the evenings. Associated with generalised body ache and loss of appetite. Loose ' +
    'stools since yesterday, 2 episodes, watery, no blood/mucus. No vomiting. No urinary complaints.'
  )

  heading('Past History')
  body('Known diabetic since 2018, on Tab. Metformin 500mg. No history of hypertension, TB, or previous hospitalisation.')

  heading('Diagnosis')
  body('Acute gastroenteritis with mild dehydration; underlying Type 2 Diabetes Mellitus.')

  heading('Investigations')
  body(
    'CBC — Hb 12.8 g/dL, TLC 11,200/cumm, Platelets 2.1 lakh/cumm.\n' +
    'RBS 168 mg/dL.\nSerum electrolytes — Na 136, K 3.8, Cl 98.\n' +
    'Stool routine — no ova/cysts, no occult blood.\nUrine routine — normal.'
  )

  heading('Clinical Summary')
  body(
    'Patient admitted with acute gastroenteritis and mild dehydration. Started on IV fluids (RL), ' +
    'antiemetics, and antibiotics. Blood sugars monitored and controlled with existing oral hypoglycaemic. ' +
    'Symptoms improved by day 3; tolerating oral feeds well by day 5. Vitals stable throughout the stay. ' +
    'Discharged in stable condition.'
  )

  heading('Medications on Discharge')
  letterheadTable(
    h,
    [
      { label: 'Medicine', width: 40 },
      { label: 'Dosage', width: 20 },
      { label: 'Qty', width: 15, align: 'right' },
      { label: 'Usage', width: 30 },
    ],
    [['Tab. Metformin', '500 mg', '30', '1-0-1 after food']],
  )

  heading('Advice on Discharge')
  body(
    'Plenty of oral fluids, ORS as needed. Avoid outside/spicy food for two weeks. Continue diabetes ' +
    'medication as prescribed. Monitor blood sugar at home. Return immediately if fever recurs or loose stools worsen.'
  )

  heading('Follow-up')
  body('15/08/2026 — Review in OPD with a repeat CBC and RBS. Bring home glucose log.')

  h.checkPage(20)
  h.y += 8
  h.normal(9.5)
  h.doc.setTextColor(...BLACK)
  h.doc.text('Authorised Signatory', h.re, h.y, { align: 'right' })

  return h
}

// ── Render + save both modes for all three ─────────────────────────────────
describe('pdf letterhead demo (manual dry run, not a real test)', () => {
  const documents: [string, (mode: LetterheadMode) => H][] = [
    ['lab-report', renderLabReport],
    ['charges-table', renderCharges],
    ['discharge-summary', renderDischargeSummary],
  ]

  for (const [name, render] of documents) {
    it(`renders ${name} (digital + print)`, () => {
      const digitalPath = save(render('digital'), `demo-${name}-digital.pdf`)
      const printPath = save(render('print'), `demo-${name}-print.pdf`)
      expect(fs.existsSync(digitalPath)).toBe(true)
      expect(fs.existsSync(printPath)).toBe(true)
    })
  }

  it('exposes autoPrint for wiring into a Print button later', () => {
    expect(typeof autoPrint).toBe('function')
  })
})
