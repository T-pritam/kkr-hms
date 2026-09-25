/**
 * Lab tests and the registration fee: one payment, three lines (round 8).
 *
 * Both are taken on the Payments tab, and each is written in three places at
 * once:
 *
 *   Charges    a line for reference — so a dummy bill can list it — pointing at
 *              its payment through `patient_charges.installment_id`
 *   Payments   the installment, labelled Lab or Registration
 *   Ledger     its credit, under its own source (`lab` / `registration`)
 *
 * The payment is the record. The charge line follows it: written with it,
 * changed when it changes, removed when it is deleted, and read-only in the
 * Charges tab. That is what keeps "collected" meaning the same thing on every
 * tab — patient 6/26 showed a registration line in Charges while Payments and
 * the Overview still said "collect it" (client report, 26 Sep).
 *
 * Lab is the hospital's income: the lab is in-house (client revision, 26 Sep).
 */

import { recalculatePatientBilling } from '@/lib/recalculate-billing'

// The same loose client every billing helper takes (lib/billing/payments.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** The payment fields a linked charge line is built from. */
export interface LinkedInstallment {
  id: string
  patient_billing_id: string
  kind?: string | null
  amount: number | string
  payment_date: string
  remarks?: string | null
}

export const LINKED_KINDS = ['lab', 'registration'] as const
export type LinkedKind = (typeof LINKED_KINDS)[number]

export const isLinkedKind = (kind: unknown): kind is LinkedKind =>
  (LINKED_KINDS as readonly unknown[]).includes(kind)

/**
 * Is this catalogue item one that only a payment may put on a bill?
 * The registration fee's entry, or any lab entry.
 */
export function isLinkedChargeItem(item: { category?: string | null; is_registration_fee?: boolean | null } | null | undefined): boolean {
  return !!item && (item.is_registration_fee === true || item.category === 'lab')
}

export const LINKED_ITEM_REFUSAL =
  'Lab tests and the registration fee are added on the Payments tab — the charge line is written with the payment.'

export interface LinkedChargeItem {
  id: string
  name: string
  amount: number
}

/**
 * The catalogue entry a lab or registration line is written against.
 * Registration: the entry flagged `is_registration_fee`. Lab: the first active
 * `lab` entry ("Lab Test").
 */
export async function linkedChargeItem(db: Db, kind: LinkedKind): Promise<LinkedChargeItem | null> {
  let query = db.from('charge_items').select('id, name, default_price, is_active, created_at')
  query = kind === 'registration' ? query.eq('is_registration_fee', true) : query.eq('category', 'lab')

  const { data } = await query.order('created_at', { ascending: true })
  const item = ((data ?? []) as { id: string; name: string; default_price: number | string | null; is_active: boolean | null }[])
    .find(row => row.is_active !== false)
  if (!item) return null
  return { id: item.id, name: item.name, amount: Number(item.default_price) || 0 }
}

/** Re-totals "services used" after a line is added, changed or removed. */
async function retotal(db: Db, billingId: string) {
  await recalculatePatientBilling(db as Parameters<typeof recalculatePatientBilling>[0], billingId)
}

/** A lab line carries the notes typed on the payment (which tests). */
const descriptionFor = (kind: LinkedKind, installment: LinkedInstallment): string | null =>
  kind === 'lab' ? (installment.remarks?.trim() || null) : null

/**
 * Write the charge line for a new lab or registration payment.
 * The caller undoes the payment and its ledger entry if this fails.
 */
export async function writeLinkedCharge(
  db: Db,
  args: { kind: LinkedKind; installment: LinkedInstallment; patientId: string; billingId: string; userId: string },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { kind, installment, patientId, billingId, userId } = args

  const item = await linkedChargeItem(db, kind)
  if (!item) {
    return {
      ok: false,
      status: 400,
      error:
        kind === 'lab'
          ? 'There is no active lab entry in the Charge Catalogue. An admin adds one ("Lab Test") first.'
          : 'There is no active registration fee in the Charge Catalogue.',
    }
  }

  const { error } = await db.from('patient_charges').insert({
    patient_billing_id: billingId,
    patient_id: patientId,
    charge_item_id: item.id,
    // Snapshotted, like every charge: a later rename never rewrites an issued bill.
    charge_type: item.name,
    description: descriptionFor(kind, installment),
    amount: Number(installment.amount),
    qty: 1,
    billing_mode: 'one_time',
    charge_date: installment.payment_date,
    installment_id: installment.id,
    created_by: userId,
    updated_by: userId,
  })

  if (error) {
    console.error(`The ${kind} charge line could not be written:`, error)
    return { ok: false, status: 500, error: `The ${kind === 'lab' ? 'lab' : 'registration'} line could not be added to Charges` }
  }

  await retotal(db, billingId)
  return { ok: true }
}

/** Bring a payment's charge line in step after the payment was edited. */
export async function syncLinkedCharge(db: Db, installment: LinkedInstallment, userId: string): Promise<void> {
  const kind = installment.kind
  if (!isLinkedKind(kind)) return

  const { error } = await db
    .from('patient_charges')
    .update({
      amount: Number(installment.amount),
      charge_date: installment.payment_date,
      description: descriptionFor(kind, installment),
      updated_by: userId,
    })
    .eq('installment_id', installment.id)

  if (error) throw error
  await retotal(db, installment.patient_billing_id)
}

/** Remove a payment's charge line; called when the payment is deleted. */
export async function removeLinkedCharge(db: Db, installment: LinkedInstallment): Promise<void> {
  const { error } = await db.from('patient_charges').delete().eq('installment_id', installment.id)
  if (error) throw error
  await retotal(db, installment.patient_billing_id)
}
