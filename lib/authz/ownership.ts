/**
 * Who may change an entry (PRD v2, CR-01 and §3.2).
 *
 * The client's rule, in their words: *"Admin can do everything. Receptionists
 * can view everything the admin adds, but cannot edit entries created by the
 * admin or by other receptionists. Receptionists can edit their own entries,
 * except entries that are status-based and have been marked closed."*
 *
 * Three questions, always in this order:
 *
 *   1. Is the caller an admin?        → yes for everything, but a Closed ledger
 *                                       entry must be reopened first (Q-04 = B).
 *   2. Is this a shared record?       → any receptionist may change a patient, a
 *                                       doctor or a catalogue item — they are not
 *                                       money, and the desk maintains them
 *                                       together (Q-01 = B). The registration fee
 *                                       item is the one exception (Q-40).
 *   3. Did the caller create it?      → no: 403. Yes, but it is locked: 409.
 *
 * "Edit" always includes delete (Q-04 a).
 *
 * The lock itself differs per record — a payment locks when its ledger entry is
 * closed, a visit when its fee is paid, a charge when the patient is discharged
 * — so the caller passes `locked` and the reason, and this file stays the one
 * place that decides *who*, never *when*.
 */

export interface Actor {
  id: string
  role: string
}

/** The row being changed. Only the two fields the rule actually reads. */
export interface OwnedRow {
  created_by?: string | null
  /** Set when the row is closed, paid, forwarded, discharged… */
  locked?: boolean
  /** Shown to the user when `locked` refuses them. */
  lockReason?: string
}

export type ModifyRefusal = {
  ok: false
  status: 403 | 409
  error: string
  code: 'NOT_YOUR_ENTRY' | 'ENTRY_LOCKED' | 'ADMIN_ONLY'
}

export type ModifyResult = { ok: true } | ModifyRefusal

export const NOT_YOUR_ENTRY = 'NOT_YOUR_ENTRY'
export const ENTRY_LOCKED = 'ENTRY_LOCKED'
export const ADMIN_ONLY = 'ADMIN_ONLY'

export const isAdmin = (actor: Actor | null | undefined): boolean => actor?.role === 'ADMIN'

/**
 * May `actor` edit or delete `row`?
 *
 * `shared` marks a record every receptionist maintains (a patient, a doctor, a
 * catalogue item): ownership is not asked, only the lock is.
 */
export function canModify(
  actor: Actor,
  row: OwnedRow,
  options: { shared?: boolean } = {},
): ModifyResult {
  const locked = row.locked === true
  const lockReason = row.lockReason || 'This entry is closed and cannot be changed'

  // Admin may change anything — but a closed entry is reopened first, so that
  // the reopen carries a reason and shows in the entry's history (Q-04 = B).
  if (isAdmin(actor)) {
    return locked ? { ok: false, status: 409, error: lockReason, code: ENTRY_LOCKED } : { ok: true }
  }

  if (!options.shared && row.created_by !== actor.id) {
    return {
      ok: false,
      status: 403,
      error: 'You can only change entries you created',
      code: NOT_YOUR_ENTRY,
    }
  }

  if (locked) {
    return { ok: false, status: 409, error: lockReason, code: ENTRY_LOCKED }
  }

  return { ok: true }
}

/**
 * What a list endpoint puts on each row so the UI shows an action only where it
 * would succeed (AC-01.1, AC-05.2). Same rule, same order, no second opinion.
 */
export function canEditRow(
  actor: Actor,
  row: OwnedRow,
  options: { shared?: boolean } = {},
): boolean {
  return canModify(actor, row, options).ok
}

/**
 * Charges lock for reception once the patient is Discharged (Q-03 = B, §3.2 row
 * 7). Admin may still correct them — the stay is over, not the record.
 */
export async function dischargeLock(
  db: { from: (table: string) => any },
  patientId: string,
): Promise<{ locked: boolean; lockReason?: string }> {
  const { data } = await db.from('patients').select('status').eq('id', patientId).maybeSingle()
  return data?.status === 'Discharged'
    ? { locked: true, lockReason: 'This patient is discharged, so their charges can no longer be changed' }
    : { locked: false }
}
