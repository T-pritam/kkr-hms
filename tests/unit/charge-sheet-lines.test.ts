import { describe, it, expect } from 'vitest'
import { BLANK_LINE, expandLine, foldSheetItems } from '@/components/charges/charge-sheet-modal'
import { rangeDays } from '@/lib/billing/validate'

/**
 * Round 10 (client, 28 Sep): a saved per-day charge reopens as one line with
 * its dates, saves back onto its own rows, and a range can leave out its last
 * date.
 */

const room = (id: string, day: string, extra = {}) => ({
  id, charge_item_id: 'room', charge_name: 'Room', description: null, unit_price: 2000, qty: 1,
  billing_mode: 'per_day', service_date: day, ...extra,
})

describe('rangeDays', () => {
  it('bills every date by default, and all but the last when asked', () => {
    expect(rangeDays('2026-09-21', '2026-09-25')).toHaveLength(5)
    expect(rangeDays('2026-09-21', '2026-09-25', false)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24'])
    expect(rangeDays('2026-09-21', '2026-09-21', false)).toEqual([])
  })
})

describe('folding saved sheet rows', () => {
  it('turns consecutive days of one charge into one ranged line', () => {
    const lines = foldSheetItems([
      room('r3', '2026-09-23'), room('r1', '2026-09-21'), room('r2', '2026-09-22'),
      { id: 'x', charge_item_id: 'xray', charge_name: 'X-ray', unit_price: 1200, qty: 1, billing_mode: 'one_time', service_date: '2026-09-21' },
    ])

    expect(lines).toHaveLength(2)
    const folded = lines.find(l => l.charge_name === 'Room')!
    expect(folded).toMatchObject({ id: null, from_date: '2026-09-21', to_date: '2026-09-23', include_last: true })
    expect(folded.row_ids).toEqual({ '2026-09-21': 'r1', '2026-09-22': 'r2', '2026-09-23': 'r3' })
  })

  it('starts a new line at a gap, a different rate, or a pharmacy bill', () => {
    const lines = foldSheetItems([
      room('a', '2026-09-21'), room('b', '2026-09-23'),
      room('c', '2026-09-24', { unit_price: 2500 }),
      room('d', '2026-09-25', { pharmacy_bill: [{ id: 'pb' }] }),
    ])
    expect(lines).toHaveLength(4)
  })

  it('saves a folded line back onto its own rows, and only the days still in range', () => {
    const [folded] = foldSheetItems([room('r1', '2026-09-21'), room('r2', '2026-09-22'), room('r3', '2026-09-23')])

    // Shortened by a day, and extended by one at the start.
    const edited = { ...folded, from_date: '2026-09-20', to_date: '2026-09-22' }
    const rows = expandLine(edited, '2026-09-20')

    expect(rows.map(r => [r.service_date, r.id])).toEqual([
      ['2026-09-20', null],
      ['2026-09-21', 'r1'],
      ['2026-09-22', 'r2'],
    ])
    // r3 is no longer listed, so the sheet API deletes it.
  })

  it('leaves out the last date of a new range unless ticked', () => {
    const line = { ...BLANK_LINE, charge_name: 'Room', unit_price: '2000', billing_mode: 'per_day' as const, from_date: '2026-09-21', to_date: '2026-09-25' }
    expect(expandLine(line, '2026-09-21')).toHaveLength(4)
    expect(expandLine({ ...line, include_last: true }, '2026-09-21')).toHaveLength(5)
  })
})
