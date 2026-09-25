-- Round 8 (additive half) — lab becomes income, recorded like the registration fee.
--
-- A lab test and the registration fee are both taken on the Payments tab, and
-- each writes three lines together: a charge (for reference and dummy bills),
-- a payment and a ledger row (lib/billing/linked-charge.ts).
--
--   * installments may be labelled `lab`
--   * the ledger gets its own `lab` source, next to `registration`
--   * a charge line can point at the payment it mirrors, so editing or deleting
--     the payment finds exactly its line
--
-- Safe for the code live before it: nothing is narrowed or removed.

alter table public.patient_billing_installments drop constraint if exists pbi_kind_check;
alter table public.patient_billing_installments add constraint pbi_kind_check
  check (kind in ('regular', 'advance', 'discharge', 'misc', 'registration', 'lab'));

alter table public.daily_ledger_transactions drop constraint if exists dlt_source_check;
alter table public.daily_ledger_transactions add constraint dlt_source_check
  check (source in ('patient', 'opd', 'expense', 'doctor_settlement', 'referral_commission', 'salary', 'registration', 'lab'));

alter table public.patient_charges
  add column if not exists installment_id uuid
  references public.patient_billing_installments(id) on delete set null;

comment on column public.patient_charges.installment_id is
  'The lab or registration payment this charge line mirrors. Written and kept in step by lib/billing/linked-charge.ts; such a line is read-only in the Charges tab.';

create unique index if not exists patient_charges_one_per_installment
  on public.patient_charges (installment_id) where installment_id is not null;
