import { describe, it, expect } from 'vitest'
import { combineCharges } from '@/lib/billing/group-charges'

const read = (r: any) => ({ label: r.name, itemId: r.item, rate: r.rate, qty: r.qty, billingMode: r.mode })

/** The client's combined statement (28 Sep): one line per charge. */
describe('combineCharges', () => {
  it('turns a stay into one line per charge', () => {
    const rows = [
      ...['21', '22', '23', '24', '25'].map(() => ({ name: 'Room (General)', item: 'room', rate: 2000, qty: 1, mode: 'per_day' })),
      ...['21', '22', '23', '24', '25'].map(() => ({ name: 'Nursing care', item: 'nurse', rate: 500, qty: 1, mode: 'per_day' })),
      { name: 'Oxygen', item: 'o2', rate: 150, qty: 4, mode: 'per_hour' },
      { name: 'Oxygen', item: 'o2', rate: 150, qty: 2, mode: 'per_hour' },
      { name: 'X-ray', item: 'xray', rate: 1200, qty: 1, mode: 'one_time' },
    ]

    expect(combineCharges(rows, read).map(l => [l.label, l.rate, l.quantity, l.unit, l.total])).toEqual([
      ['Room (General)', 2000, 5, 'days', 10000],
      ['Nursing care', 500, 5, 'days', 2500],
      ['Oxygen', 150, 6, 'hrs', 900],
      ['X-ray', 1200, 1, '', 1200],
    ])
  })

  it('keeps a different rate as its own line', () => {
    const rows = [
      { name: 'Room', item: 'room', rate: 2000, qty: 1, mode: 'per_day' },
      { name: 'Room', item: 'room', rate: 2500, qty: 1, mode: 'per_day' },
    ]
    expect(combineCharges(rows, read)).toHaveLength(2)
  })

  it('merges typed charges by name', () => {
    const rows = [
      { name: 'Dressing', item: null, rate: 300, qty: 2, mode: 'one_time' },
      { name: 'Dressing', item: null, rate: 300, qty: 1, mode: 'one_time' },
    ]
    expect(combineCharges(rows, read)).toEqual([expect.objectContaining({ quantity: 3, total: 900 })])
  })
})
