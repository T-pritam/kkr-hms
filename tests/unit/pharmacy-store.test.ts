/**
 * lib/pharmacy/store.ts — mapping a SmartPharma360 payload onto our columns.
 *
 * This is the seam where somebody else's field names become ours, and it runs
 * once per bill with no chance to re-fetch afterwards. Getting a number wrong
 * here bills a patient wrongly and the only fix is deleting the bill and
 * fetching it again, so the mapping is worth pinning down.
 *
 * The sample values are the real ones from bill SI-KK-26-001558.
 */

import { describe, it, expect } from 'vitest'
import { billColumns, billItemRows, billLabel } from '@/lib/pharmacy/store'

const details = {
  head: {
    entry_number: 'SI-KK-26-001558',
    entry_date: '2026-08-05',
    invoice_number: '',
    invoice_url: 'https://url.smartpharma360.in/pjAud',
    patient_name: 'T. SUGUNA',
    doctor_name: 'KKR HOSPITAL',
    net_amount: 13,
    gross_total: 13.39,
    total_gst_value: 0.64,
    total_disc: 0,
    rounding: '-0.39',
  },
  items: [
    {
      product_name: 'LASIX 4ML INJ',
      batch_number: '2125221',
      packing: '1S',
      sale_quantity: 1,
      mrp: '13.39',
      gst: 5,
      gst_value: 0.64,
      net_amount: 13.39,
      hsn_code: '30049099',
      mfg: 'SON',
      expiry: '2028-10',
      schedule_type: 'H',
    },
  ],
} as any

describe('billColumns', () => {
  it('maps the header onto our column names', () => {
    expect(billColumns(34069611, details)).toMatchObject({
      external_bill_id: 34069611,
      entry_number: 'SI-KK-26-001558',
      entry_date: '2026-08-05',
      bill_patient_name: 'T. SUGUNA',
      doctor_name: 'KKR HOSPITAL',
      net_amount: 13,
      gross_total: 13.39,
    })
  })

  it('blanks an empty invoice number rather than storing an empty string', () => {
    expect(billColumns(1, details).invoice_number).toBeNull()
  })

  /** A bill with no date would break the charge it becomes, which needs one. */
  it('falls back to today when the bill carries no entry date', () => {
    const undated = { ...details, head: { ...details.head, entry_date: null } }
    expect(billColumns(1, undated).entry_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('keeps the whole payload for later, so no field needs re-fetching', () => {
    expect(billColumns(1, details).raw_response).toBe(details)
  })
})

describe('billLabel', () => {
  it('names the charge after the bill number', () => {
    expect(billLabel(34069611, details)).toBe('Pharmacy — SI-KK-26-001558')
  })

  it('falls back to the numeric id when there is no bill number', () => {
    const unnumbered = { ...details, head: { ...details.head, entry_number: null } }
    expect(billLabel(34069611, unnumbered)).toBe('Pharmacy — 34069611')
  })
})

describe('billItemRows', () => {
  it('maps a medicine line, renaming gst to gst_percent', () => {
    expect(billItemRows('b1', details.items)[0]).toEqual({
      pharmacy_bill_id: 'b1',
      product_name: 'LASIX 4ML INJ',
      batch_number: '2125221',
      packing: '1S',
      sale_quantity: 1,
      mrp: 13.39,
      gst_percent: 5,
      gst_value: 0.64,
      net_amount: 13.39,
      hsn_code: '30049099',
      mfg: 'SON',
      expiry: '2028-10',
      schedule_type: 'H',
    })
  })

  /** Only the expiry is printed, but all four arrive in the same payload and
   * re-fetching a bill to get them later would be a call we are avoiding. */
  it('keeps the fields the bill carries but does not print', () => {
    const row = billItemRows('b1', details.items)[0]
    expect(row.hsn_code).toBe('30049099')
    expect(row.mfg).toBe('SON')
    expect(row.schedule_type).toBe('H')
  })

  it('stores a blank schedule as null, not an empty string', () => {
    const unscheduled = [{ ...details.items[0], schedule_type: '' }]
    expect(billItemRows('b1', unscheduled as any)[0].schedule_type).toBeNull()
  })

  /** MRP arrives as a string; storing it as one would break every sum. */
  it('coerces numeric strings to numbers', () => {
    const row = billItemRows('b1', details.items)[0]
    expect(typeof row.mrp).toBe('number')
    expect(typeof row.net_amount).toBe('number')
  })

  it('keeps a missing optional as null rather than NaN', () => {
    const sparse = [{ ...details.items[0], mrp: null, gst: undefined, gst_value: null }]
    const row = billItemRows('b1', sparse as any)[0]
    expect(row.mrp).toBeNull()
    expect(row.gst_percent).toBeNull()
    expect(row.gst_value).toBeNull()
  })
})
