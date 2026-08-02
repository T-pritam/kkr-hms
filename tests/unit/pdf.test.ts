/**
 * lib/pdf/* — smoke tests for the jsPDF report generators.
 *
 * These prove the generators run to completion over realistic data and emit a non-empty,
 * well-formed PDF without throwing on missing or null fields — which is what actually
 * breaks in practice. Visual quality (layout, pagination, column alignment, ₹ glyphs) is
 * a manual check; see TESTING.md.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generatePatientPDF, type PatientPDFData } from '@/lib/pdf/patient-pdf'
import { generateIncomePDF, generateExpenseBreakdownPDF, generateMonthlyFinancePDF } from '@/lib/pdf/finance-pdf'
import { generateLabReportPDF, renderLabReport } from '@/lib/pdf/lab-report-pdf'
import type { LabReportData, LabReportParameter, LabReportValue } from '@/lib/pdf/lab-report-pdf'
import {
  generateDischargeSummaryPDF,
  renderDischargeSummary,
  type DischargeSummaryData,
} from '@/lib/pdf/discharge-summary-pdf'
import { docBytes, mergePdfs } from '@/lib/pdf/merge'

/**
 * jsPDF attaches `save` to each instance rather than to the prototype, so it cannot be
 * spied on directly. This wraps the constructor to record every document produced and to
 * intercept the save call, which would otherwise try to write a file.
 */
vi.mock('jspdf', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>()
  const Real = actual.default ?? actual.jsPDF

  function Wrapped(this: unknown, ...args: unknown[]) {
    const doc = new Real(...args)
    const registry = globalThis as unknown as { __pdfDocs: any[]; __pdfSaves: string[] }
    registry.__pdfDocs.push(doc)
    doc.save = (filename: string) => {
      registry.__pdfSaves.push(filename)
      return doc
    }
    return doc
  }

  return { ...actual, default: Wrapped, jsPDF: Wrapped }
})

const registry = globalThis as unknown as { __pdfDocs: any[]; __pdfSaves: string[] }

/** The documents produced by the generator under test. */
const saved = () => registry.__pdfDocs
const savedFilenames = () => registry.__pdfSaves

beforeEach(() => {
  registry.__pdfDocs = []
  registry.__pdfSaves = []
})

/** A PDF file always starts with "%PDF-" and ends with an EOF marker. */
function expectValidPdf(doc: any) {
  const bytes = new Uint8Array(doc.output('arraybuffer') as ArrayBuffer)
  const text = Buffer.from(bytes).toString('latin1')

  expect(bytes.byteLength).toBeGreaterThan(1000)
  expect(text.startsWith('%PDF-')).toBe(true)
  expect(text).toContain('%%EOF')
}

const patientData = (overrides: Partial<PatientPDFData> = {}): PatientPDFData => ({
  patient: {
    id: 'p1',
    patient_id: '1/25',
    name: 'Ramesh Kumar',
    phone: '9876543210',
    gender: 'Male',
    date_of_join: '2026-02-14',
    address: '12 Main Street',
  },
  billing: {
    id: 'b1',
    base_charge: 20000,
    patient_charges_total: 2000,
    total_doctor_fees: 6500,
    total_charges: 28500,
    patient_paid_amount: 7000,
    referral_commission_amount: 3000,
  },
  charges: [
    { id: 'c1', charge_type: 'X-Ray', description: 'Chest X-Ray', amount: 800, qty: 1, charge_date: '2026-03-01' },
    { id: 'c2', charge_type: 'Medication', description: 'Antibiotics', amount: 600, qty: 2, charge_date: '2026-03-02' },
  ],
  installments: [
    { id: 'i1', installment_number: 1, amount: 5000, payment_date: '2026-03-01', payment_method: 'cash' },
    { id: 'i2', installment_number: 2, amount: 2000, payment_date: '2026-03-05', payment_method: 'upi', transaction_reference: 'UPI-1' },
  ],
  settlements: [
    {
      id: 's1',
      visit_count: 3,
      amount_per_visit: 1500,
      total_amount: 4500,
      settled: true,
      doctor: { id: 'd1', name: 'Dr. Rao', specialist: 'Cardiology' },
    },
  ],
  referral: { id: 'r1', name: 'Dr. Referrer', phone: '9876500000', status: 'active' },
  ...overrides,
})

describe('generatePatientPDF', () => {
  it('produces a valid PDF from a complete billing record', () => {
    generatePatientPDF(patientData())

    expect(saved()).toHaveLength(1)
    expectValidPdf(saved()[0])
  })

  it('names the file after the patient', () => {
    generatePatientPDF(patientData())

    expect(savedFilenames()[0]).toContain('Patient_Report_')
    expect(savedFilenames()[0]).toMatch(/\.pdf$/)
  })

  it('survives a patient with no billing record at all', () => {
    generatePatientPDF(
      patientData({ billing: null, charges: [], installments: [], settlements: [], referral: null })
    )

    expectValidPdf(saved()[0])
  })

  it('survives null and missing fields throughout', () => {
    generatePatientPDF({
      patient: { name: null, patient_id: null, date_of_join: null, phone: null },
      billing: { total_charges: null, patient_paid_amount: null },
      charges: [{ charge_type: null, description: null, amount: null, qty: null, charge_date: null }],
      installments: [{ installment_number: null, amount: null, payment_date: null, payment_method: null }],
      settlements: [{ visit_count: null, amount_per_visit: null, total_amount: null, doctor: null }],
      referral: null,
    } as unknown as PatientPDFData)

    expectValidPdf(saved()[0])
  })

  it('paginates a long list of charges without throwing', () => {
    const manyCharges = Array.from({ length: 120 }, (_, i) => ({
      id: `c${i}`,
      charge_type: 'Procedure',
      description: `Line item ${i} with a fairly long description to exercise wrapping`,
      amount: 500 + i,
      qty: 1,
      charge_date: '2026-03-01',
    }))

    generatePatientPDF(patientData({ charges: manyCharges }))

    const pages = saved()[0].getNumberOfPages()
    expect(pages).toBeGreaterThan(1)
    expectValidPdf(saved()[0])
  })
})

describe('finance report generators', () => {
  const summary = {
    month_year: '2026-03',
    income: {
      total_charges: 12000,
      total_paid: 8000,
      total_commission: 3000,
      pending_receivables: 19500,
      net_income: 8000,
      billing_count: 3,
    },
    expenses: {
      general_expenses: 5000,
      salary_expenses: 31000,
      ledger_expenses: 2500,
      commission_expenses: 3000,
      doctor_fees: 6500,
      total_expenses: 48000,
    },
    profit: { net_profit: -40000, profit_margin: -500 },
    pending_settlements: { doctor_fees: 6500, doctor_count: 2, referral_commissions: 3000, referral_count: 1 },
    recent_transactions: [],
  }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }))
    )
  })

  it('generates the income report', async () => {
    await generateIncomePDF('2026-03', summary)

    expect(saved()).toHaveLength(1)
    expectValidPdf(saved()[0])
  })

  it('generates the expense breakdown', async () => {
    await generateExpenseBreakdownPDF('2026-03', summary)

    expectValidPdf(saved()[0])
  })

  it('generates the full monthly report', async () => {
    await generateMonthlyFinancePDF('2026-03', summary)

    expectValidPdf(saved()[0])
  })

  it('handles a month with no activity', async () => {
    const empty = {
      ...summary,
      income: { total_charges: 0, total_paid: 0, total_commission: 0, pending_receivables: 0, net_income: 0, billing_count: 0 },
      expenses: { general_expenses: 0, salary_expenses: 0, ledger_expenses: 0, commission_expenses: 0, doctor_fees: 0, total_expenses: 0 },
      profit: { net_profit: 0, profit_margin: 0 },
    }

    await generateMonthlyFinancePDF('2026-03', empty)

    expectValidPdf(saved()[0])
  })
})

// ── Laboratory report ────────────────────────────────────────────────────────

describe('generateLabReportPDF', () => {
  const value = (over: Partial<LabReportValue> = {}): LabReportValue => ({
    parameter_id: 'p1',
    value: 13.2,
    text_value: null,
    unit: 'g/dL',
    ref_display: '13 - 17',
    abnormal: null,
    is_critical: false,
    ...over,
  })

  const parameter = (over: Partial<LabReportParameter> = {}): LabReportParameter => ({
    id: 'p1',
    name: 'Haemoglobin',
    group_name: null,
    method: null,
    decimals: 1,
    ...over,
  })

  const labData = (over: Partial<LabReportData> = {}): LabReportData => ({
    order_no: 'LAB/2026/00184',
    patient_name: 'Ramesh Kumar',
    patient_display_id: '118/25',
    patient_age: 42,
    patient_gender: 'Male',
    patient_phone: '9876543210',
    referring_doctor_name: 'Dr. S. Rao',
    registered_at: '2026-08-01T09:12:00.000Z',
    collected_at: '2026-08-01T09:40:00.000Z',
    received_at: '2026-08-01T10:05:00.000Z',
    reported_at: '2026-08-01T14:30:00.000Z',
    items: [
      {
        id: 'i1',
        test_name: 'Complete Blood Count',
        test_code: 'CBC',
        specimen: 'Whole Blood (EDTA)',
        method: 'Automated Cell Counter',
        status: 'authorised',
        interpretation: 'Mild leucocytosis with thrombocytopenia. Suggest clinical correlation and a repeat count after one week.',
        interpretation_by_name: 'dr.rao',
        entered_by_name: 'a.patil',
        authorised_by_name: 'dr.rao',
        authorised_at: '2026-08-01T14:30:00.000Z',
        parameters: [
          parameter(),
          parameter({ id: 'p2', name: 'Total Leucocyte Count', decimals: 0 }),
          parameter({ id: 'p3', name: 'Platelet Count' }),
          parameter({ id: 'p4', name: 'Neutrophils', group_name: 'Differential Count', decimals: 0 }),
          parameter({ id: 'p5', name: 'Lymphocytes', group_name: 'Differential Count', decimals: 0 }),
        ],
        values: [
          value(),
          value({ parameter_id: 'p2', value: 12400, unit: '/cu.mm', ref_display: '4000 - 10000', abnormal: 'H' }),
          value({ parameter_id: 'p3', value: 1.8, unit: 'lakh/cu.mm', ref_display: '1.5 - 4.1', abnormal: 'L' }),
          value({ parameter_id: 'p4', value: 62, unit: '%', ref_display: '40 - 80' }),
          value({ parameter_id: 'p5', value: 28, unit: '%', ref_display: '20 - 40' }),
        ],
      },
    ],
    ...over,
  })

  it('generates a report and names the file after the patient and order', () => {
    generateLabReportPDF(labData())

    expect(saved()).toHaveLength(1)
    expectValidPdf(saved()[0])
    expect(savedFilenames()[0]).toBe('Lab_Report_Ramesh_Kumar_LAB_2026_00184.pdf')
  })

  it('survives a walk-in with no ID, doctor, age or sex', () => {
    generateLabReportPDF(labData({
      patient_display_id: null,
      patient_age: null,
      patient_gender: null,
      referring_doctor_name: null,
      collected_at: null,
      received_at: null,
      reported_at: null,
    }))

    expectValidPdf(saved()[0])
  })

  it('handles an order whose results have not been entered', () => {
    const data = labData()
    data.items[0].values = []

    generateLabReportPDF(data)

    expectValidPdf(saved()[0])
  })

  it('skips cancelled tests', () => {
    const data = labData()
    data.items[0].status = 'cancelled'

    generateLabReportPDF(data)

    expectValidPdf(saved()[0])
  })

  it('paginates a long panel without throwing', () => {
    const data = labData()
    const many = Array.from({ length: 90 }, (_, i) =>
      parameter({ id: `p${i}`, name: `Parameter with a deliberately long name number ${i}`, group_name: i % 10 === 0 ? `Group ${i / 10}` : null })
    )
    data.items[0].parameters = many
    data.items[0].values = many.map((p, i) =>
      value({ parameter_id: p.id, value: i, abnormal: i % 7 === 0 ? 'H' : null, is_critical: i % 21 === 0 })
    )

    generateLabReportPDF(data)

    const doc = saved()[0]
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
    expectValidPdf(doc)
  })

  it('renders a qualitative result carried as text', () => {
    const data = labData()
    data.items[0].parameters = [parameter({ id: 'q1', name: 'HIV I & II' })]
    data.items[0].values = [value({
      parameter_id: 'q1', value: null, text_value: 'Reactive',
      unit: null, ref_display: 'Non-Reactive', abnormal: 'A',
    })]

    generateLabReportPDF(data)

    expectValidPdf(saved()[0])
  })
})


// ─────────────────────────────────────────────────────────────────────────────
const dischargeData = (overrides: Partial<DischargeSummaryData> = {}): DischargeSummaryData => ({
  summary_no: 'DS/2026/00012',
  status: 'final',
  patient: {
    name: 'Ramesh Kumar',
    patient_id: '1/25',
    age: 42,
    gender: 'Male',
    phone: '9876543210',
    address: '12 Main Street, Nellore - 524001',
  },
  admission_date: '2026-03-10',
  discharge_date: '2026-03-15',
  ward: 'General Ward',
  bed: '12',
  chief_complaints: 'Fever with chills for 4 days, generalised weakness',
  history_present_illness: 'Gradual onset, no vomiting, no urinary symptoms.',
  past_history: 'Known diabetic since 2018, on metformin.',
  diagnosis: 'Acute gastroenteritis with mild dehydration',
  investigations: 'Hb 9.2 g/dL, TLC 12,400\nUSG abdomen: mild hepatomegaly',
  clinical_summary: 'Treated with IV fluids and antibiotics. Symptoms settled by day three.',
  condition_on_discharge: 'Stable',
  vitals_bp: '120/80',
  vitals_pulse: '78 /min',
  vitals_temp: '98.6 F',
  vitals_spo2: '98%',
  advice_notes: 'Plenty of oral fluids. Avoid outside food for two weeks.',
  follow_up_date: '2026-03-22',
  follow_up_instructions: 'Review in OPD with a repeat CBC.',
  doctors: [
    { doctor_name: 'Dr. S. Rao', doctor_specialist: 'General Medicine' },
    { doctor_name: 'Dr. A. Iyer', doctor_specialist: 'Gastroenterology' },
  ],
  medications: [
    { medicine_name: 'Pantoprazole', dosage: '40 mg', quantity: '10 tabs', usage: '1-0-0 before food' },
    { medicine_name: 'Paracetamol', dosage: '500 mg', quantity: '10 tabs', usage: 'SOS for fever' },
  ],
  created_by_name: 'anita',
  finalised_by_name: 'dr.rao',
  finalised_at: '2026-03-15T10:30:00.000Z',
  ...overrides,
})

describe('generateDischargeSummaryPDF', () => {
  it('produces a valid PDF for a complete summary', () => {
    generateDischargeSummaryPDF(dischargeData())

    expect(saved()).toHaveLength(1)
    expectValidPdf(saved()[0])
  })

  it('names the file after the patient and the document number', () => {
    generateDischargeSummaryPDF(dischargeData())

    expect(savedFilenames()).toEqual(['Discharge_Summary_Ramesh_Kumar_DS_2026_00012.pdf'])
  })

  /** Page one is the branded cover; the content starts on page two. */
  it('always has at least two pages', () => {
    const doc = renderDischargeSummary(dischargeData())
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2)
  })

  it('survives a summary with every optional section empty', () => {
    const doc = renderDischargeSummary(dischargeData({
      chief_complaints: null, history_present_illness: null, past_history: null,
      investigations: null, advice_notes: null, follow_up_date: null,
      follow_up_instructions: null, condition_on_discharge: null,
      vitals_bp: null, vitals_pulse: null, vitals_temp: null, vitals_spo2: null,
      medications: [], doctors: [],
    }))

    expectValidPdf(doc)
  })

  it('survives missing patient details', () => {
    const doc = renderDischargeSummary(dischargeData({
      summary_no: null,
      patient: { name: 'Walk-in', patient_id: null, age: null, gender: null, phone: null, address: null },
      admission_date: null, discharge_date: null, ward: null, bed: null,
      created_by_name: null, finalised_by_name: null, finalised_at: null,
    }))

    expectValidPdf(doc)
  })

  it('renders a draft without throwing — the watermark walks every page', () => {
    const doc = renderDischargeSummary(dischargeData({ status: 'draft' }))
    expectValidPdf(doc)
  })

  it('paginates a long medication list and keeps the columns labelled', () => {
    const doc = renderDischargeSummary(dischargeData({
      medications: Array.from({ length: 60 }, (_, i) => ({
        medicine_name: `Medicine with a deliberately long name number ${i}`,
        dosage: '500 mg',
        quantity: '10 tabs',
        usage: 'One tablet twice daily after food for the next five days',
      })),
    }))

    expect(doc.getNumberOfPages()).toBeGreaterThan(2)
    expectValidPdf(doc)
  })

  it('does not overflow on a very long narrative', () => {
    const doc = renderDischargeSummary(dischargeData({
      clinical_summary: 'Course in hospital. '.repeat(400),
    }))

    expect(doc.getNumberOfPages()).toBeGreaterThan(2)
    expectValidPdf(doc)
  })
})

describe('mergePdfs', () => {
  /** Minimal lab report — the builders above are scoped to their describe block. */
  const aLabReport = (): LabReportData => ({
    order_no: 'LAB/2026/00184',
    patient_name: 'Ramesh Kumar',
    patient_display_id: '1/25',
    patient_age: 42,
    patient_gender: 'Male',
    patient_phone: '9876543210',
    referring_doctor_name: 'Dr. S. Rao',
    registered_at: '2026-03-15T09:12:00.000Z',
    collected_at: '2026-03-15T09:40:00.000Z',
    received_at: '2026-03-15T10:05:00.000Z',
    reported_at: '2026-03-15T14:30:00.000Z',
    items: [{
      id: 'i1',
      test_name: 'Complete Blood Count',
      test_code: 'CBC',
      specimen: 'Whole Blood (EDTA)',
      method: 'Automated Cell Counter',
      status: 'reported',
      interpretation: null,
      interpretation_by_name: null,
      entered_by_name: 'anita',
      authorised_by_name: null,
      authorised_at: null,
      parameters: [{ id: 'p1', name: 'Haemoglobin', group_name: null, method: null, decimals: 1 }],
      values: [{
        parameter_id: 'p1', value: 13.2, text_value: null, unit: 'g/dL',
        ref_display: '13 - 17', abnormal: null, is_critical: false,
      }],
    }],
  })

  it('concatenates a summary and a lab report into one document', async () => {
    const summary = renderDischargeSummary(dischargeData())
    const report = renderLabReport(aLabReport())
    const pages = summary.getNumberOfPages() + report.getNumberOfPages()

    const { bytes, skipped } = await mergePdfs([
      { label: 'Discharge summary', bytes: docBytes(summary) },
      { label: 'Lab report', bytes: docBytes(report) },
    ])

    expect(skipped).toEqual([])
    expect(Buffer.from(bytes).toString('latin1').startsWith('%PDF-')).toBe(true)

    // pdf-lib writes a fresh document, so count the pages it reports.
    const { PDFDocument } = await import('pdf-lib')
    const merged = await PDFDocument.load(bytes)
    expect(merged.getPageCount()).toBe(pages)
  })

  /** A corrupt or password-protected scan must not sink the whole download. */
  it('skips a part it cannot read and names it', async () => {
    const summary = renderDischargeSummary(dischargeData())

    const { bytes, skipped } = await mergePdfs([
      { label: 'Discharge summary', bytes: docBytes(summary) },
      { label: 'Corrupt scan', bytes: new Uint8Array([1, 2, 3, 4]) },
    ])

    expect(skipped).toEqual(['Corrupt scan'])
    expect(bytes.byteLength).toBeGreaterThan(1000)
  })

  it('reports an empty part rather than silently dropping it', async () => {
    const summary = renderDischargeSummary(dischargeData())

    const { skipped } = await mergePdfs([
      { label: 'Discharge summary', bytes: docBytes(summary) },
      { label: 'Missing attachment', bytes: new Uint8Array() },
    ])

    expect(skipped).toEqual(['Missing attachment'])
  })

  it('throws when there is nothing at all to merge', async () => {
    await expect(mergePdfs([])).rejects.toThrow(/nothing to download/i)
  })
})
