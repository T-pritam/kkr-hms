/**
 * Petty cash: the desk's float, as a bank statement (PRD v2, CR-02).
 *
 * The client's words: *"Petty cash is a single shared amount used by all
 * receptionists across shifts… showing both credits (admin giving cash) and
 * debits (receptionist expenses), like a bank statement: credit/debit, date, and
 * reason. This log has no status. It is only a log, visible to both admin and
 * receptionists."*
 *
 * Four rules follow, and they are the whole design:
 *
 *   1. **One pool.** Not per receptionist, not per shift, not per day. The
 *      balance is every credit minus every debit, full stop.
 *   2. **No status, no closing.** Nothing here is ever verified or locked. The
 *      desk may fix its own entry whenever it notices (Q-12 = A) — the admin
 *      checks the balance against the cash in the drawer, and the edit history
 *      answers "what changed?" (Q-70).
 *   3. **Money in is the admin's.** An opening balance at go-live, then
 *      top-ups. Reception only ever spends (Q-13).
 *   4. **Patient money never touches it** (Q-08), and desk spending never
 *      reaches the ledger (Q-07 = A). The two books stay separate.
 *
 * A negative balance is allowed, with a warning: the desk sometimes spends
 * ahead of a top-up, and refusing the entry would only mean it goes unrecorded
 * (Q-10 = B).
 */

import { canModify, type Actor } from '@/lib/authz/ownership'
import { istToday } from '@/lib/dates/ist'
import { PAYMENT_MODES, type PaymentMode } from '@/lib/ledger/transactions'

type Db = { from: (table: string) => any }

export type PettyCashKind = 'opening' | 'topup' | 'expense' | 'advance'
export type PettyCashDirection = 'in' | 'out'

/** What the admin may add. Reception adds expenses only (Q-13). */
export const ADMIN_KINDS: PettyCashKind[] = ['opening', 'topup', 'expense']
export const DESK_KINDS: PettyCashKind[] = ['expense']

export const DIRECTION_BY_KIND: Record<PettyCashKind, PettyCashDirection> = {
  opening: 'in',
  topup: 'in',
  expense: 'out',
  advance: 'out',
}

export const KIND_LABELS: Record<PettyCashKind, string> = {
  opening: 'Opening balance',
  topup: 'Top-up',
  expense: 'Expense',
  advance: 'Employee advance',
}

export interface PettyCashInput {
  entry_date?: string | null
  kind?: unknown
  amount?: unknown
  payment_mode?: unknown
  reason?: unknown
  given_to?: string | null
}

export type Refusal = {
  ok: false
  status: number
  error: string
  code?: string
  fieldErrors?: Record<string, string>
}

export interface PettyCashValues {
  entry_date: string
  kind: PettyCashKind
  direction: PettyCashDirection
  amount: number
  payment_mode: PaymentMode
  reason: string
  given_to: string | null
}

const SELECT_ROW = `
  id, entry_date, direction, kind, amount, payment_mode, reason, given_to,
  advance_id, created_at, created_by, updated_at, updated_by,
  created_by_user:users!created_by(id, username),
  given_to_user:users!given_to(id, username)
`

/**
 * Everything checkable without touching the database, checked before anything
 * is written. `role` decides which kinds are on offer.
 */
export function validateEntry(
  input: PettyCashInput,
  role: string,
): { ok: true; value: PettyCashValues } | Refusal {
  const fieldErrors: Record<string, string> = {}
  const allowed = role === 'ADMIN' ? ADMIN_KINDS : DESK_KINDS

  const kind = input.kind as PettyCashKind
  if (!allowed.includes(kind)) {
    fieldErrors.kind =
      role === 'ADMIN'
        ? 'Choose an opening balance, a top-up or an expense'
        : 'The desk records expenses here; ask an admin for a top-up'
  }

  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    fieldErrors.amount = 'Enter an amount greater than 0'
  }

  // A reason is the whole point of the log: an entry without one tells nobody
  // anything a month later (Q-39).
  const reason = String(input.reason ?? '').trim()
  if (!reason) {
    fieldErrors.reason = 'Say what this was for'
  }

  const mode = (input.payment_mode ?? 'cash') as PaymentMode
  if (!PAYMENT_MODES.includes(mode)) {
    fieldErrors.payment_mode = 'Choose a payment mode'
  }

  const entryDate = String(input.entry_date || istToday()).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    fieldErrors.entry_date = 'Enter a valid date'
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, status: 400, error: 'Check the highlighted fields', fieldErrors }
  }

  return {
    ok: true,
    value: {
      entry_date: entryDate,
      kind,
      direction: DIRECTION_BY_KIND[kind],
      amount,
      payment_mode: mode,
      reason,
      // Only a top-up names who took the cash; on anything else it is noise.
      given_to: kind === 'topup' || kind === 'opening' ? input.given_to || null : null,
    },
  }
}

/** The balance is simply everything in, minus everything out. */
export async function pettyCashBalance(db: Db): Promise<{ in: number; out: number; balance: number }> {
  const { data, error } = await db.from('petty_cash_entries').select('direction, amount')
  if (error) throw error

  return (data ?? []).reduce(
    (totals: { in: number; out: number; balance: number }, row: any) => {
      const amount = Number(row.amount) || 0
      if (row.direction === 'in') totals.in += amount
      else totals.out += amount
      totals.balance = totals.in - totals.out
      return totals
    },
    { in: 0, out: 0, balance: 0 },
  )
}

/**
 * The statement, newest first, with a running balance on each row.
 *
 * The running balance is counted forward from the oldest entry, so a row reads
 * "what the float stood at after this" — which is what a statement means, and
 * what makes it checkable against the drawer.
 */
export async function listEntries(
  db: Db,
  actor: Actor,
  filters: { from?: string | null; to?: string | null; kind?: string | null } = {},
): Promise<{ rows: any[]; totals: { in: number; out: number; balance: number } }> {
  let query = db.from('petty_cash_entries').select(SELECT_ROW)
  if (filters.from) query = query.gte('entry_date', filters.from)
  if (filters.to) query = query.lte('entry_date', filters.to)
  if (filters.kind) query = query.eq('kind', filters.kind)

  const { data, error } = await query
    .order('entry_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error

  let running = 0
  const oldestFirst = (data ?? []).map((row: any) => {
    running += row.direction === 'in' ? Number(row.amount) || 0 : -(Number(row.amount) || 0)
    return {
      ...row,
      running_balance: running,
      // An advance debit belongs to the advance; it is changed there (CR-03).
      can_edit:
        row.kind !== 'advance' &&
        canModify(actor, { created_by: row.created_by }).ok &&
        (actor.role === 'ADMIN' || row.kind === 'expense'),
    }
  })

  return {
    rows: oldestFirst.reverse(),
    totals: await pettyCashBalance(db),
  }
}

async function recordHistory(
  db: Db,
  args: { entryId: string; action: 'create' | 'update' | 'delete'; before?: any; after?: any; userId: string },
): Promise<void> {
  // History is a record, not a gate: if it cannot be written the entry itself
  // still stands, and the log says so rather than losing the money movement.
  const { error } = await db.from('petty_cash_entry_history').insert({
    entry_id: args.entryId,
    action: args.action,
    before: args.before ?? null,
    after: args.after ?? null,
    changed_by: args.userId,
  })
  if (error) console.error('Petty cash history could not be written:', error)
}

/**
 * "Given to" names a receptionist, and only a receptionist (Q-11). The column is
 * a plain FK to `users`, so without this an id typed by hand — or an older
 * client — could record the float as handed to an admin or a lab technician,
 * which is not a thing that happens.
 */
export async function assertRecipient(
  db: Db,
  givenTo: string | null,
): Promise<{ ok: true } | Refusal> {
  if (!givenTo) return { ok: true }

  const { data } = await db
    .from('users')
    .select('role, status')
    .eq('id', givenTo)
    .maybeSingle()

  if (data?.role !== 'RECEPTIONIST' || data?.status !== 'ACTIVE') {
    return {
      ok: false,
      status: 400,
      error: 'Petty cash is handed to a receptionist',
      fieldErrors: { given_to: 'Choose an active receptionist' },
    }
  }

  return { ok: true }
}

export async function createEntry(
  db: Db,
  actor: Actor,
  values: PettyCashValues,
): Promise<{ ok: true; entry: any } | Refusal> {
  const recipient = await assertRecipient(db, values.given_to)
  if (!recipient.ok) return recipient

  if (values.kind === 'opening') {
    const { data: existing } = await db.from('petty_cash_entries').select('id').eq('kind', 'opening')
    if ((existing ?? []).length > 0) {
      return {
        ok: false,
        status: 409,
        error: 'The opening balance has already been entered',
        code: 'OPENING_EXISTS',
      }
    }
  }

  const { data, error } = await db
    .from('petty_cash_entries')
    .insert({ ...values, created_by: actor.id })
    .select(SELECT_ROW)

  if (error) throw error

  const entry = (data ?? [])[0]
  await recordHistory(db, { entryId: entry.id, action: 'create', after: values, userId: actor.id })
  return { ok: true, entry }
}

/**
 * An advance the desk paid, as a petty cash debit (CR-03).
 *
 * Written by the advance route, never by hand: the debit and the advance are
 * one act, and the link is what lets an edit to either follow the other.
 */
export async function recordAdvanceDebit(
  db: Db,
  actor: Actor,
  args: { advanceId: number | string; amount: number; employeeName: string; date: string },
): Promise<{ ok: true; entry: any } | Refusal> {
  const { data, error } = await db
    .from('petty_cash_entries')
    .insert({
      entry_date: args.date,
      direction: 'out',
      kind: 'advance',
      amount: args.amount,
      payment_mode: 'cash',
      reason: `Advance to ${args.employeeName}`,
      advance_id: args.advanceId,
      created_by: actor.id,
    })
    .select(SELECT_ROW)

  if (error) {
    console.error('Petty cash debit for the advance could not be written:', error)
    return { ok: false, status: 500, error: 'The advance could not be paid from petty cash' }
  }

  const entry = (data ?? [])[0]
  await recordHistory(db, { entryId: entry.id, action: 'create', after: { advance: args.advanceId }, userId: actor.id })
  return { ok: true, entry }
}

export async function updateEntry(
  db: Db,
  actor: Actor,
  entry: any,
  values: PettyCashValues,
): Promise<{ ok: true; entry: any } | Refusal> {
  if (entry.kind === 'advance') {
    return {
      ok: false,
      status: 409,
      error: 'This debit belongs to an employee advance. Change the advance, and this follows.',
      code: 'BELONGS_TO_ADVANCE',
    }
  }

  const allowed = canModify(actor, { created_by: entry.created_by })
  if (!allowed.ok) return allowed

  const recipient = await assertRecipient(db, values.given_to)
  if (!recipient.ok) return recipient

  // The kind never changes: a top-up cannot become an expense, or the balance
  // would move by twice the amount with nothing to show for it.
  const { data, error } = await db
    .from('petty_cash_entries')
    .update({
      entry_date: values.entry_date,
      amount: values.amount,
      payment_mode: values.payment_mode,
      reason: values.reason,
      given_to: entry.kind === 'topup' || entry.kind === 'opening' ? values.given_to : null,
      updated_at: new Date().toISOString(),
      updated_by: actor.id,
    })
    .eq('id', entry.id)
    .select(SELECT_ROW)

  if (error) throw error

  await recordHistory(db, {
    entryId: entry.id,
    action: 'update',
    before: { amount: entry.amount, reason: entry.reason, entry_date: entry.entry_date },
    after: { amount: values.amount, reason: values.reason, entry_date: values.entry_date },
    userId: actor.id,
  })

  return { ok: true, entry: (data ?? [])[0] }
}

export async function deleteEntry(
  db: Db,
  actor: Actor,
  entry: any,
): Promise<{ ok: true } | Refusal> {
  if (entry.kind === 'advance') {
    return {
      ok: false,
      status: 409,
      error: 'This debit belongs to an employee advance. Delete the advance, and this goes with it.',
      code: 'BELONGS_TO_ADVANCE',
    }
  }

  const allowed = canModify(actor, { created_by: entry.created_by })
  if (!allowed.ok) return allowed

  await recordHistory(db, {
    entryId: entry.id,
    action: 'delete',
    before: { amount: entry.amount, reason: entry.reason, kind: entry.kind },
    userId: actor.id,
  })

  const { error } = await db.from('petty_cash_entries').delete().eq('id', entry.id)
  if (error) throw error

  return { ok: true }
}
