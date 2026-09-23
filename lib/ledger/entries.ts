/**
 * The ledger log: one list, one set of filters, one close (PRD v2, CR-05 & CR-06).
 *
 * The client asked for two things that turn out to be the same thing:
 *   *"The ledger currently shows only the logged-in user's entries. It should
 *   show all entries, so others don't have to guess whether a payment was
 *   received. The current ledger data fetching and UX are too complex."*
 *   *"Remove the per-user, per-day day close. List all rows, select in bulk and
 *   mark them closed. Add a separate tab showing rows not yet closed."*
 *
 * So: everyone with ledger access sees every row, and closing is a property of
 * the row rather than of the date or of whoever happened to be on shift.
 *
 * What the log holds (Q-07 = A): patient payments with their label, OPD
 * receipts, and the doctor / referral payouts. Desk spending lives in the petty
 * cash log instead, and never appears here.
 */

import { canEditRow, type Actor } from '@/lib/authz/ownership'
import { paymentLinks } from '@/lib/billing/payments'
import { istToday } from '@/lib/dates/ist'
import { PAYMENT_MODES, type PaymentMode } from '@/lib/ledger/transactions'

type Db = { from: (table: string) => any }

export type LedgerStatus = 'open' | 'closed'

export const LEDGER_STATUSES: LedgerStatus[] = ['open', 'closed']

/** Q-22: the current month, newest first, 50 rows a page. */
export const PAGE_SIZE = 50

export interface EntryFilters {
  from?: string | null
  to?: string | null
  direction?: 'credit' | 'debit' | null
  source?: string | null
  mode?: string | null
  added_by?: string | null
  status?: LedgerStatus | null
  patient?: string | null
  search?: string | null
  page?: number
}

export interface EntryTotals {
  in: number
  out: number
  net: number
  cash_in: number
  cash_out: number
  count: number
}

const num = (v: unknown) => Number(v) || 0

const SELECT_ROW = `
  id, transaction_date, transaction_type, source, amount, payment_mode,
  reference_number, description, notes, status, created_at, created_by,
  closed_at, closed_by, close_batch_id, reopened_at, reopen_reason,
  expense_category, expense_category_detail, patient_id,
  created_by_user:users!created_by(id, username),
  closed_by_user:users!closed_by(id, username),
  patient:patients(id, patient_id, name)
`

/** The first and last day of the IST month a date falls in. */
export function currentMonthRange(today = istToday()): { from: string; to: string } {
  const [year, month] = today.split('-').map(Number)
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` }
}

/**
 * Reads the filters off a request's query string, falling back to the current
 * month. An unknown value is dropped rather than refused: a stale bookmark
 * should show the ledger, not an error.
 */
export function parseFilters(params: URLSearchParams): EntryFilters {
  const month = currentMonthRange()
  const pick = <T extends string>(key: string, allowed: readonly T[]): T | null => {
    const value = params.get(key)
    return value && (allowed as readonly string[]).includes(value) ? (value as T) : null
  }

  const page = Number(params.get('page'))

  return {
    from: params.get('from') || month.from,
    to: params.get('to') || month.to,
    direction: pick('direction', ['credit', 'debit'] as const),
    source: params.get('source') || null,
    mode: pick('mode', PAYMENT_MODES as readonly PaymentMode[]),
    added_by: params.get('added_by') || null,
    status: pick('status', LEDGER_STATUSES),
    patient: params.get('patient') || null,
    search: (params.get('search') || '').trim() || null,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
  }
}

function applyFilters(query: any, filters: EntryFilters) {
  if (filters.from) query = query.gte('transaction_date', filters.from)
  if (filters.to) query = query.lte('transaction_date', filters.to)
  if (filters.direction) query = query.eq('transaction_type', filters.direction)
  if (filters.source) query = query.eq('source', filters.source)
  if (filters.mode) query = query.eq('payment_mode', filters.mode)
  if (filters.added_by) query = query.eq('created_by', filters.added_by)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.patient) query = query.eq('patient_id', filters.patient)
  if (filters.search) query = query.ilike('description', `%${filters.search}%`)
  return query
}

/**
 * The totals follow the filter, not the page (Q-22), so they are summed over
 * every matching row rather than the 50 on screen.
 */
export async function entryTotals(db: Db, filters: EntryFilters): Promise<EntryTotals> {
  let query = db.from('daily_ledger_transactions').select('transaction_type, amount, payment_mode')
  query = applyFilters(query, filters)

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).reduce(
    (totals: EntryTotals, row: any) => {
      const amount = num(row.amount)
      const cash = row.payment_mode === 'cash'
      if (row.transaction_type === 'credit') {
        totals.in += amount
        if (cash) totals.cash_in += amount
      } else {
        totals.out += amount
        if (cash) totals.cash_out += amount
      }
      totals.net = totals.in - totals.out
      totals.count += 1
      return totals
    },
    { in: 0, out: 0, net: 0, cash_in: 0, cash_out: 0, count: 0 },
  )
}

/**
 * One page of the log.
 *
 * Every user with ledger access sees every row (Q-05, Q-06) — the old
 * `created_by = me` filter is gone, which is the whole point of CR-05. What
 * differs by user is `can_edit`, so the UI offers an action only where it would
 * succeed.
 *
 * A row that belongs to a patient payment carries `payment_installment_id`: it
 * is edited on the patient's Payments tab, never here, because a payment and
 * its ledger entry are one record (CR-12).
 */
export async function listEntries(
  db: Db,
  actor: Actor,
  filters: EntryFilters,
): Promise<{ rows: any[]; totals: EntryTotals; page: number; page_size: number }> {
  const page = filters.page && filters.page > 0 ? filters.page : 1
  const offset = (page - 1) * PAGE_SIZE

  let query = db.from('daily_ledger_transactions').select(SELECT_ROW)
  query = applyFilters(query, filters)

  const { data, error } = await query
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (error) throw error

  const rows = data ?? []
  const links = rows.length ? await paymentLinks(db, rows.map((r: any) => r.id)) : new Map()

  const decorated = rows.map((row: any) => {
    const installmentId = links.get(row.id) ?? null
    return {
      ...row,
      payment_installment_id: installmentId,
      // A closed row is nobody's to change until an admin reopens it.
      can_edit:
        !installmentId &&
        canEditRow(actor, {
          created_by: row.created_by,
          locked: row.status === 'closed',
        }),
      can_close: actor.role === 'ADMIN' && row.status === 'open',
    }
  })

  return { rows: decorated, totals: await entryTotals(db, filters), page, page_size: PAGE_SIZE }
}

export type CloseResult =
  | { ok: true; batch: any; closed: number; skipped: number }
  | { ok: false; status: number; error: string; code?: string }

/**
 * Close a set of rows in one action (CR-06).
 *
 * Only rows that are still Open are touched, so closing a list someone else has
 * just closed is not an error — it reports how many it skipped. The batch keeps
 * the admin's note and the amount they counted (Q-27 = B).
 */
export async function closeEntries(
  db: Db,
  actor: Actor,
  args: { ids: string[]; note?: string | null; amount_received?: number | string | null },
): Promise<CloseResult> {
  if (actor.role !== 'ADMIN') {
    return { ok: false, status: 403, error: 'Only an admin can close ledger entries', code: 'ADMIN_ONLY' }
  }

  const ids = [...new Set((args.ids ?? []).filter(Boolean))]
  if (ids.length === 0) {
    return { ok: false, status: 400, error: 'Select at least one entry to close' }
  }

  let amountReceived: number | null = null
  if (args.amount_received !== undefined && args.amount_received !== null && args.amount_received !== '') {
    amountReceived = Number(args.amount_received)
    if (!Number.isFinite(amountReceived) || amountReceived < 0) {
      return { ok: false, status: 400, error: 'Amount received must be a number' }
    }
  }

  const { data: open, error: readError } = await db
    .from('daily_ledger_transactions')
    .select('id')
    .in('id', ids)
    .eq('status', 'open')

  if (readError) throw readError

  const openIds = (open ?? []).map((r: any) => r.id)
  if (openIds.length === 0) {
    return { ok: false, status: 409, error: 'Those entries are already closed', code: 'ALREADY_CLOSED' }
  }

  const closedAt = new Date().toISOString()

  const { data: batchRows, error: batchError } = await db
    .from('ledger_close_batches')
    .insert({
      note: args.note?.trim() || null,
      amount_received: amountReceived,
      row_count: openIds.length,
      closed_at: closedAt,
      closed_by: actor.id,
    })
    .select('*')

  if (batchError) throw batchError
  const batch = (batchRows ?? [])[0]

  const { error: updateError } = await db
    .from('daily_ledger_transactions')
    .update({
      status: 'closed',
      closed_at: closedAt,
      closed_by: actor.id,
      close_batch_id: batch?.id ?? null,
      reopen_reason: null,
    })
    .in('id', openIds)

  // The batch would otherwise claim a close that never happened.
  if (updateError) {
    if (batch?.id) await db.from('ledger_close_batches').delete().eq('id', batch.id)
    throw updateError
  }

  return { ok: true, batch, closed: openIds.length, skipped: ids.length - openIds.length }
}

/**
 * Reopen closed rows (Q-04 = B). Admin only, and the reason is required: it is
 * the only record of why a counted day was opened again.
 */
export async function reopenEntries(
  db: Db,
  actor: Actor,
  args: { ids: string[]; reason?: string | null },
): Promise<{ ok: true; reopened: number } | { ok: false; status: number; error: string; code?: string }> {
  if (actor.role !== 'ADMIN') {
    return { ok: false, status: 403, error: 'Only an admin can reopen ledger entries', code: 'ADMIN_ONLY' }
  }

  const ids = [...new Set((args.ids ?? []).filter(Boolean))]
  if (ids.length === 0) {
    return { ok: false, status: 400, error: 'Select at least one entry to reopen' }
  }

  const reason = (args.reason ?? '').trim()
  if (!reason) {
    return { ok: false, status: 400, error: 'Give a reason for reopening these entries' }
  }

  const { data: closed, error: readError } = await db
    .from('daily_ledger_transactions')
    .select('id')
    .in('id', ids)
    .eq('status', 'closed')

  if (readError) throw readError

  const closedIds = (closed ?? []).map((r: any) => r.id)
  if (closedIds.length === 0) {
    return { ok: false, status: 409, error: 'Those entries are already open', code: 'ALREADY_OPEN' }
  }

  const { error } = await db
    .from('daily_ledger_transactions')
    .update({
      status: 'open',
      closed_at: null,
      closed_by: null,
      close_batch_id: null,
      reopened_at: new Date().toISOString(),
      reopened_by: actor.id,
      reopen_reason: reason,
    })
    .in('id', closedIds)

  if (error) throw error

  return { ok: true, reopened: closedIds.length }
}

/**
 * Is this ledger row closed? Asked by the routes that edit a payment, because a
 * payment locks when its ledger entry does (§3.2 row 9).
 */
export async function isEntryClosed(db: Db, entryId: string): Promise<boolean> {
  const { data } = await db
    .from('daily_ledger_transactions')
    .select('status')
    .eq('id', entryId)
    .maybeSingle()
  return data?.status === 'closed'
}
