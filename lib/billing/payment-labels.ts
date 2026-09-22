/**
 * A payment's label (PRD v2 CR-15, the client's point 5), shown with the patient
 * in the Payments tab and the Ledger: "12/26 Ramesh Kumar (Advance)".
 *
 *   regular · advance · discharge · misc   picked by the desk
 *   lab · medicine                         a lab or medicine charge collected
 *                                          separately (lib/billing/lab-medicine.ts)
 *   registration                           the registration fee (CR-11)
 */
export const PAYMENT_KINDS = [
  'regular',
  'advance',
  'discharge',
  'misc',
  'lab',
  'medicine',
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
  lab: 'Lab',
  medicine: 'Medicine',
  registration: 'Registration',
}

export const isDeskPaymentKind = (kind: unknown): kind is DeskPaymentKind =>
  (DESK_PAYMENT_KINDS as readonly unknown[]).includes(kind)
