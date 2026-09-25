/**
 * A payment's label (PRD v2 CR-15, the client's point 5), shown with the patient
 * in the Payments tab and the Ledger: "12/26 Ramesh Kumar (Advance)".
 *
 *   regular · advance · discharge · misc   picked by the desk
 *   registration                           the registration fee (CR-11)
 *   lab                                    an in-house lab test (round 8)
 *
 * Registration and lab are *linked*: each also writes a line in Charges and
 * books to its own ledger source (lib/billing/linked-charge.ts). They are set
 * by the button that opens the form ("Collect now", "Add lab test"), and are
 * never relabelled, so a charge line cannot be left behind.
 *
 * History: `lab` and `medicine` labels existed once for collected lab/medicine
 * charges, and went on 2026-09-24. Lab is back with a different meaning: the
 * hospital's lab is in-house, so a lab test is income (client, 26 Sep).
 * Medicine is always the hospital's expense and never a payment.
 */
export const PAYMENT_KINDS = [
  'regular',
  'advance',
  'discharge',
  'misc',
  'registration',
  'lab',
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
  lab: 'Lab',
}

export const isDeskPaymentKind = (kind: unknown): kind is DeskPaymentKind =>
  (DESK_PAYMENT_KINDS as readonly unknown[]).includes(kind)
