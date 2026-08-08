/**
 * lib/billing/group-charges.ts — the collapsing both charge views share.
 *
 * Worth testing directly because a per-day service is stored as one row per
 * day: getting the grouping wrong either hides charges from a bill or shows
 * unrelated ones as a single block, and both are visible to the hospital as a
 * wrong-looking total.
 */

import { describe, it, expect } from 'vitest'
import { groupByCharge, groupByDate, type GroupableCharge } from '@/lib/billing/group-charges'

interface Row {
  id: string
  date: string
  label: string
  groupId?: string | null
  itemId?: string | null
  amount: number
}

const read = (r: Row): GroupableCharge => ({
  date: r.date,
  label: r.label,
  groupId: r.groupId,
  itemId: r.itemId,
  total: r.amount,
})

// A four-night stay plus two one-offs, the shape the Charges tab actually holds.
const rows: Row[] = [
  { id: '1', date: '2026-08-01', label: 'Room Charges', groupId: 'g1', itemId: 'room', amount: 3000 },
  { id: '2', date: '2026-08-02', label: 'Room Charges', groupId: 'g1', itemId: 'room', amount: 3000 },
  { id: '3', date: '2026-08-02', label: 'Oxygen', itemId: 'o2', amount: 200 },
  { id: '4', date: '2026-08-03', label: 'Consultation Fee', itemId: 'cons', amount: 300 },
]

describe('groupByDate', () => {
  it('gathers a day’s charges under it, newest day first', () => {
    const days = groupByDate(rows, read)

    expect(days.map(d => d.date)).toEqual(['2026-08-03', '2026-08-02', '2026-08-01'])
    expect(days[1].rows.map(r => r.id)).toEqual(['2', '3'])
  })

  it('subtotals each day', () => {
    const days = groupByDate(rows, read)
    expect(days.find(d => d.date === '2026-08-02')!.total).toBe(3200)
  })

  it('tolerates a timestamp where a date is expected', () => {
    const stamped = [{ ...rows[0], date: '2026-08-01T00:00:00Z' }]
    expect(groupByDate(stamped, read)[0].date).toBe('2026-08-01')
  })

  it('returns nothing for no charges', () => {
    expect(groupByDate([], read)).toEqual([])
  })
})

describe('groupByCharge', () => {
  it('collects the rows one date range produced into a single block', () => {
    const groups = groupByCharge(rows, read)
    const room = groups.find(g => g.label === 'Room Charges')!

    expect(room.rows.map(r => r.id)).toEqual(['1', '2'])
    expect(room.total).toBe(6000)
    expect(room.isBlock).toBe(true)
  })

  it('does not merge unrelated rows that merely share a name', () => {
    // Same name, no shared group id, different catalogue entries.
    const unrelated: Row[] = [
      { id: 'a', date: '2026-08-01', label: 'Procedure', itemId: 'p1', amount: 500 },
      { id: 'b', date: '2026-08-02', label: 'Procedure', itemId: 'p2', amount: 700 },
    ]
    expect(groupByCharge(unrelated, read)).toHaveLength(2)
  })

  it('still collects ad-hoc charges that share a typed name', () => {
    const adhoc: Row[] = [
      { id: 'a', date: '2026-08-01', label: 'Dressing', amount: 100 },
      { id: 'b', date: '2026-08-02', label: 'Dressing', amount: 100 },
    ]
    const groups = groupByCharge(adhoc, read)
    expect(groups).toHaveLength(1)
    expect(groups[0].isBlock).toBe(false)
  })

  it('marks a single one-off as not a block, so it offers no "delete all"', () => {
    expect(groupByCharge(rows, read).find(g => g.label === 'Oxygen')!.isBlock).toBe(false)
  })
})

describe('both groupings', () => {
  it('account for every charge exactly once', () => {
    const byDate = groupByDate(rows, read).flatMap(d => d.rows)
    const byCharge = groupByCharge(rows, read).flatMap(g => g.rows)

    expect(byDate).toHaveLength(rows.length)
    expect(byCharge).toHaveLength(rows.length)
    // Same money either way — the view must never change the total.
    const sum = (rs: Row[]) => rs.reduce((t, r) => t + r.amount, 0)
    expect(sum(byDate)).toBe(6500)
    expect(sum(byCharge)).toBe(6500)
  })
})
