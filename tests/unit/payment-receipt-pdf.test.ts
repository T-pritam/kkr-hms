import { describe, it, expect } from 'vitest'
import {
  paymentReceiptFilename, receiptAmount, receiptDate, receiptTotal, renderPaymentReceipt,
  type PaymentReceiptData,
} from '@/lib/pdf/payment-receipt-pdf'

/** The printed "Cash Receipt" (client, 1 Oct) — a half sheet in the desk's own format. */
const text = (data: PaymentReceiptData) => {
  const doc = renderPaymentReceipt(data)
  return {
    pages: doc.getNumberOfPages(),
    size: [Math.round(doc.internal.pageSize.getWidth()), Math.round(doc.internal.pageSize.getHeight())],
    body: Buffer.from(new Uint8Array(doc.output('arraybuffer') as ArrayBuffer)).toString('latin1'),
  }
}

const receipt: PaymentReceiptData = {
  receipt_no: '287(A)', heading: 'Cash Receipt', patient_name: 'Mr. Chandan Nikshith Sai', age_sex: '11yrs/Male',
  mobile: '7997116180', address: 'Chalam Naidu Valasa Village', ip_no: '214/26',
  doctors: ['Dr Ramesh Naidu', 'Dr Krishna Chaitanya'], department: 'General Medicine', created_by_label: 'Madhu.P',
  lines: [{ line_date: '2026-07-13', payment_mode: 'Phone pay', transaction_type: 'transfer', remarks: 'advance', amount: 8000 }],
}

describe('payment receipt PDF', () => {
  it('formats amounts and dates as the desk writes them', () => {
    expect(receiptAmount(8000)).toBe('8,000')
    expect(receiptAmount(112007)).toBe('1,12,007')
    expect(receiptAmount(1500.5)).toBe('1,500.50')
    expect(receiptDate('2026-07-13')).toBe('13.07.26')
    expect(receiptDate(null)).toBe('')
  })

  it('prints the client\'s receipt on one half sheet', () => {
    const { pages, size, body } = text(receipt)
    expect(pages).toBe(1)
    expect(size).toEqual([210, 148]) // A5 landscape
    for (const expected of [
      'KKR Hospital', 'Cash Receipt', 'Bill To:', 'Receipt No: 287\\(A\\)', 'Mr. Chandan Nikshith Sai 11yrs/Male',
      'Mobile no: 7997116180', 'Ip no: 214/26', 'Consultant doctor: ', 'Dr Krishna Chaitanya',
      'Department : General Medicine', 'Transaction Amount', '13.07.26', 'Phone pay', 'transfer', 'advance',
      'Total Amount : 8,000/-', 'Rupees: eight thousand only.', 'Authorized Signature', 'Created by: Madhu.P',
    ]) {
      expect(body).toContain(expected)
    }
  })

  it('totals the rows it prints', () => {
    const lines = [8000, 2500.5, 1000].map(amount => ({ ...receipt.lines[0], amount }))
    expect(receiptTotal(lines)).toBe(11500.5)
    expect(text({ ...receipt, lines }).body).toContain('Total Amount : 11,500.50/-')
  })

  it('leaves out the lines the desk left empty', () => {
    const { body } = text({ ...receipt, mobile: '', address: '', doctors: [], department: '', created_by_label: '' })
    for (const absent of ['Mobile no', 'Consultant doctor', 'Department', 'Created by']) {
      expect(body).not.toContain(absent)
    }
    expect(body).toContain('Ip no: 214/26')
  })

  it('carries many payments on to a second half sheet, total at the end', () => {
    const lines = Array.from({ length: 14 }, (_, i) => ({ ...receipt.lines[0], line_date: `2026-07-${10 + i}`, amount: 1000 }))
    const { pages, body } = text({ ...receipt, lines })
    expect(pages).toBe(2)
    // the header row is repeated; the total is printed once
    expect(body.split('Transaction Amount').length - 1).toBe(2)
    expect(body.split('Total Amount').length - 1).toBe(1)
    expect(body).toContain('Total Amount : 14,000/-')
  })

  it('names the file after the receipt and the patient', () => {
    expect(paymentReceiptFilename(receipt)).toBe('Receipt_287_A_Mr_Chandan_Nikshith_Sai.pdf')
  })
})
