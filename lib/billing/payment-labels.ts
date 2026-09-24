/**
 * A payment's label (PRD v2 CR-15, the client's point 5), shown with the patient
 * in the Payments tab and the Ledger: "12/26 Ramesh Kumar (Advance)".
 *
 *   regular · advance · discharge · misc   picked by the desk
 *   registration                           the registration fee (CR-11)
 *
 * `lab` and `medicine` were here too, for a lab or medicine charge collected as
 * its own payment. That is gone (client revision, 2026-09-24): an *Included*
 * amount is the hospital's expense and an excluded one is not recorded at all,
 * so no payment is ever labelled either. The one live `lab` payment was
 * relabelled `regular` by 20260925000001 — the patient did hand that money to
 * the desk, so the payment itself is real.
 */
export const PAYMENT_KINDS = [
  'regular',
  'advance',
  'discharge',
  'misc',
  'registration',
] as const
export type PaymentKind = (typeof PAYMENT_KINDS)[number]

/** The labels the desk chooses from. The rest are set by the app. */
export const DESK_PAYMENT_KINDS = ['regular', 'advance', 'discharge', 'misc'] as const
export type DeskPaymentKind = (typeof DESK_PAYMENT_KINDS)[number]

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  regular: 'Regular',
  advance: 'Advance',
  discharge: 'Discharge',
  misc: 'Misc',
  registration: 'Registration',
}

export const isDeskPaymentKind = (kind: unknown): kind is DeskPaymentKind =>
  (DESK_PAYMENT_KINDS as readonly unknown[]).includes(kind)
