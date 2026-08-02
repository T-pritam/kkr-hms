/**
 * Append-only change log.
 *
 * Nothing in this system recorded who changed what. Several tables carry
 * `created_by` / `updated_by`, but those hold only the *last* writer and
 * discard the previous value — and on case sheets `updated_by` was never
 * written at all, because the PATCH handler ignored it.
 *
 * Two rules govern everything here:
 *
 *   1. **A failed audit write must never fail the clinical write.** If logging
 *      throws, the discharge summary still saves. Losing an audit row is bad;
 *      losing a doctor's work because the log table was unreachable is worse.
 *   2. **Only real changes are recorded.** Opening a form and pressing Save
 *      without touching anything produces no row, so the log stays readable.
 */

import type { AuditAction } from '@/lib/case-sheet/types'

/**
 * Minimal shape of the Supabase client used here, matching
 * `lib/lab/order-detail.ts`. Spelling out the builder chain instead makes
 * TypeScript walk the full PostgREST generic tree and give up with
 * "type instantiation is excessively deep".
 */
type Db = { from: (table: string) => any }

export type FieldChanges = Record<string, { from: unknown; to: unknown }>

export interface AuditActor {
  id: string
  role?: string | null
  /** Skips a lookup when the caller already knows it. */
  name?: string | null
}

export interface AuditInput {
  entityType: string
  entityId: string
  patientId?: string | null
  action: AuditAction
  changes?: FieldChanges | null
  summary?: string | null
  actor: AuditActor
}

/**
 * Blank-ish values are all the same thing to a human: the field is empty.
 * Without this, clearing an already-empty box (`null` → `''`) would log a
 * change, and every save would produce noise.
 */
function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

function normalise(value: unknown): unknown {
  if (isBlank(value)) return null
  if (typeof value === 'string') return value.trim()
  if (value instanceof Date) return value.toISOString()
  return value
}

/**
 * Compares two versions of a record over the given fields.
 *
 * Returns `null` when nothing changed, so callers can skip writing entirely:
 *
 *   const changes = diffFields(before, after, TRACKED_FIELDS)
 *   if (changes) await recordAudit(supabase, { ..., changes })
 */
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields: readonly string[],
): FieldChanges | null {
  const changes: FieldChanges = {}

  for (const field of fields) {
    // A field the caller did not submit is untouched, not cleared.
    if (!after || !(field in after)) continue

    const from = normalise(before?.[field])
    const to = normalise(after[field])

    if (JSON.stringify(from) === JSON.stringify(to)) continue
    changes[field] = { from, to }
  }

  return Object.keys(changes).length > 0 ? changes : null
}

/**
 * Renders a list of child rows as a stable, comparable array of strings, so
 * "which doctors changed" can be logged the same way a text field is.
 */
export function summariseList<T>(rows: T[] | null | undefined, describe: (row: T) => string): string[] {
  return (rows || []).map(describe).map(s => s.trim()).filter(Boolean)
}

/** Adds a list field to a change set when its contents actually differ. */
export function diffList(
  changes: FieldChanges | null,
  field: string,
  before: string[],
  after: string[],
): FieldChanges | null {
  if (JSON.stringify(before) === JSON.stringify(after)) return changes
  return { ...(changes || {}), [field]: { from: before, to: after } }
}

/**
 * Writes one audit row. Never throws — see rule 1 in the file header.
 *
 * The actor's name and role are snapshotted onto the row so the entry still
 * reads correctly after that user is renamed or deleted.
 */
export async function recordAudit(supabase: Db, input: AuditInput): Promise<void> {
  try {
    let actorName = input.actor.name ?? null

    if (!actorName && input.actor.id) {
      const { data } = await supabase
        .from('users')
        .select('username, email')
        .eq('id', input.actor.id)
        .maybeSingle()

      actorName = (data?.username as string) || (data?.email as string) || null
    }

    const { error } = await supabase.from('record_audit_log').insert({
      entity_type: input.entityType,
      entity_id:   input.entityId,
      patient_id:  input.patientId ?? null,
      action:      input.action,
      changes:     input.changes ?? null,
      summary:     input.summary ?? null,
      actor_id:    input.actor.id ?? null,
      actor_name:  actorName,
      actor_role:  input.actor.role ?? null,
    })

    if (error) {
      console.error('[audit] failed to record change:', error)
    }
  } catch (error) {
    console.error('[audit] failed to record change:', error)
  }
}
