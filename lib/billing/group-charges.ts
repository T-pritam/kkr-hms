/**
 * Collapsing a list of charges into readable blocks.
 *
 * A per-day service is stored as one row per day, so a long stay reads as a
 * wall of near-identical lines. Both surfaces that show charges — the patient
 * Charges tab and the charge sheet details view — offer the same two ways out
 * of that: group by the day it happened, or by what was charged.
 *
 * The grouping is here rather than in either component because the two hold
 * different rows (a patient charge has `charge_date`/`amount`, a sheet line has
 * `service_date`/`unit_price`) but need identical behaviour. Each caller maps
 * its rows onto `GroupableCharge` and gets the same blocks back.
 */

export interface GroupableCharge {
  /** `YYYY-MM-DD`. */
  date: string
  /** What to call it — the snapshotted charge name. */
  label: string
  /** Rows produced by one date-range entry share this. */
  groupId?: string | null
  /** The catalogue entry, when the charge came from one. */
  itemId?: string | null
  category?: string | null
  total: number
}

export interface DayGroup<T> {
  key: string
  date: string
  rows: T[]
  total: number
}

export interface ChargeGroup<T> {
  key: string
  label: string
  category: string | null
  rows: T[]
  total: number
  /** A real date-range block, as opposed to unrelated rows sharing a name. */
  isBlock: boolean
}

/**
 * One block per calendar day, newest first.
 *
 * Newest first because the desk is usually looking at what was added today; the
 * printed statement runs the other way, oldest first, because a bill reads
 * forwards through the stay.
 */
export function groupByDate<T>(
  rows: T[],
  read: (row: T) => GroupableCharge,
): DayGroup<T>[] {
  const byDay = new Map<string, DayGroup<T>>()

  for (const row of rows) {
    const { date, total } = read(row)
    const day = String(date || '').slice(0, 10)

    let bucket = byDay.get(day)
    if (!bucket) {
      bucket = { key: `d:${day}`, date: day, rows: [], total: 0 }
      byDay.set(day, bucket)
    }

    bucket.rows.push(row)
    bucket.total += total
  }

  return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * One block per thing charged.
 *
 * Rows a single date-range entry produced group on their shared group id.
 * Everything else groups on the catalogue entry, falling back to the stored
 * name so ad-hoc charges still collect together.
 */
export function groupByCharge<T>(
  rows: T[],
  read: (row: T) => GroupableCharge,
): ChargeGroup<T>[] {
  const byKey = new Map<string, ChargeGroup<T>>()

  for (const row of rows) {
    const { label, groupId, itemId, category, total } = read(row)
    const isBlock = Boolean(groupId)
    const key = isBlock ? `g:${groupId}` : `i:${itemId || label}`

    let bucket = byKey.get(key)
    if (!bucket) {
      bucket = { key, label, category: category ?? null, rows: [], total: 0, isBlock }
      byKey.set(key, bucket)
    }

    bucket.rows.push(row)
    bucket.total += total
  }

  return [...byKey.values()]
}
