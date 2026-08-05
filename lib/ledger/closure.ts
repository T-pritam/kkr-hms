import { NextResponse } from 'next/server'

/**
 * The one place that answers "is this ledger date closed?".
 *
 * It used to be answered four different ways, and all four asked the wrong
 * table. `POST /api/ledger/transactions` looked for any transaction on the date
 * carrying status = 'day_closed'; the edit, delete and verify routes each
 * checked that status on the single row they had in hand. Since
 * `close-employee-day` set that same status when one operator settled their
 * shift, a receptionist going home locked the date for every colleague — and
 * `daily_ledger_closures`, the table that was supposed to record the lock, sat
 * empty.
 *
 * Closing is a property of the date, not of each entry. So there is exactly one
 * question and one place to ask it: is there an active row in
 * `daily_ledger_closures` for this date. A partial unique index guarantees at
 * most one, which makes the lookup a single index hit.
 */

type Db = {
  from: (table: string) => any
}

export interface LedgerClosure {
  id: string
  closure_date: string
  status: 'active' | 'superseded'
  version: number
  supersedes_id: string | null
  closed_at: string
  closed_by: string | null
  notes: string | null
  reopened_at: string | null
  reopened_by: string | null
  reopen_reason: string | null
  unverified_count: number
  opening_balance: number
  closing_balance: number
  closing_cash_balance: number
  total_credits: number
  total_debits: number
  net_balance: number
  total_credits_cash: number
  total_credits_upi: number
  total_credits_card: number
  total_credits_bank_transfer: number
  total_credits_cheque: number
  total_credits_other: number
  total_debits_cash: number
  transaction_count: number
  credit_count: number
  debit_count: number
  closed_by_user?: { id: string; username: string } | null
}

/** What a caller is trying to do, purely so the refusal reads naturally. */
export type LedgerAction = 'create' | 'update' | 'delete' | 'verify' | 'settle'

const ACTION_VERB: Record<LedgerAction, string> = {
  create: 'create an entry for',
  update: 'update an entry on',
  delete: 'delete an entry on',
  verify: 'verify an entry on',
  settle: 'post a settlement to',
}

/** The code clients branch on, so nothing has to match against message text. */
export const LEDGER_DAY_CLOSED = 'LEDGER_DAY_CLOSED'

const CLOSURE_COLUMNS = `
  *,
  closed_by_user:users!closed_by(id, username)
`

/**
 * One indexed lookup against idx_dlc_active_date.
 *
 * Superseded closures are history and are deliberately excluded: a date that was
 * reopened is open, no matter how many times it was closed before.
 */
export async function getActiveClosure(db: Db, date: string): Promise<LedgerClosure | null> {
  const { data } = await db
    .from('daily_ledger_closures')
    .select(CLOSURE_COLUMNS)
    .eq('closure_date', date)
    .eq('status', 'active')
    .maybeSingle()

  return (data as LedgerClosure) ?? null
}

/**
 * The active closures across a date range, keyed by date.
 *
 * One query for a whole result set, so a list of transactions can be decorated
 * with a lock flag without asking per row.
 */
export async function getActiveClosures(
  db: Db,
  startDate: string,
  endDate: string
): Promise<Map<string, LedgerClosure>> {
  const { data } = await db
    .from('daily_ledger_closures')
    .select(CLOSURE_COLUMNS)
    .eq('status', 'active')
    .gte('closure_date', startDate)
    .lte('closure_date', endDate)

  const byDate = new Map<string, LedgerClosure>()
  for (const row of (data ?? []) as LedgerClosure[]) {
    byDate.set(row.closure_date, row)
  }
  return byDate
}

/** Plain predicate, for callers that want to shape their own response. */
export async function isLedgerDateClosed(db: Db, date: string): Promise<boolean> {
  return (await getActiveClosure(db, date)) !== null
}

/** One wording, so every refusal in the app reads identically. */
export function ledgerDateClosedMessage(date: string, action: LedgerAction): string {
  return (
    `Cannot ${ACTION_VERB[action]} ${date} — that day has been closed. ` +
    `An administrator must reopen it first.`
  )
}

/**
 * The guard every write path calls.
 *
 * Returns a ready-to-return 409 when the date is locked, or null when the write
 * may proceed:
 *
 *   const locked = await assertLedgerDateOpen(supabase, transaction_date, 'create')
 *   if (locked) return locked
 *
 * 409 rather than 400 throughout: the request is well-formed, it conflicts with
 * the state of the period.
 */
export async function assertLedgerDateOpen(
  db: Db,
  date: string,
  action: LedgerAction = 'create'
): Promise<NextResponse | null> {
  const closure = await getActiveClosure(db, date)
  if (!closure) return null

  return NextResponse.json(
    {
      error: ledgerDateClosedMessage(date, action),
      code: LEDGER_DAY_CLOSED,
      closure: {
        closure_date: closure.closure_date,
        version: closure.version,
        closed_at: closure.closed_at,
        closed_by_name: closure.closed_by_user?.username ?? null,
      },
    },
    { status: 409 }
  )
}
