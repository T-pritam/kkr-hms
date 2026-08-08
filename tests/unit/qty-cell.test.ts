/**
 * lib/pdf/patient-charges-pdf.ts — what the Qty column says.
 *
 * The three billing modes mean three different things by "quantity", and the
 * printed bill is where that gets read by someone who was not there when it was
 * entered. A per-hour line showing a bare "6" beside ₹1,200 invites the reader
 * to treat six as units; a per-day line showing "1" says nothing at all.
 */

import { describe, it, expect } from 'vitest'
import { qtyCell } from '@/lib/pdf/patient-charges-pdf'

describe('qtyCell', () => {
  it('prints the count for a one-off charge', () => {
    expect(qtyCell(2, 'one_time')).toBe('2')
    expect(qtyCell(1, 'one_time')).toBe('1')
  })

  it('says nothing for a per-day charge — a day is one unit of itself', () => {
    expect(qtyCell(1, 'per_day')).toBe('')
    // Even a stale figure from an older row stays out of the column.
    expect(qtyCell(3, 'per_day')).toBe('')
  })

  it('marks a per-hour charge as hours, so the total explains itself', () => {
    expect(qtyCell(6, 'per_hour')).toBe('6 hrs')
    expect(qtyCell(1, 'per_hour')).toBe('1 hrs')
  })

  it('falls back to a plain count when the mode is unknown', () => {
    // Rows written before billing_mode existed, and anything the API omits.
    expect(qtyCell(2, null)).toBe('2')
    expect(qtyCell(2, undefined)).toBe('2')
  })

  it('treats a missing or zero quantity as one', () => {
    expect(qtyCell(null, 'one_time')).toBe('1')
    expect(qtyCell(0, 'one_time')).toBe('1')
  })
})
