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
