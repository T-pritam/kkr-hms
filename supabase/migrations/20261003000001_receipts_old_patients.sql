-- Receipts for old patients (client, 3 Oct).
--
-- The desk needs the same "Cash Receipt" for people who were treated before
-- the app, or were never registered, without registering them. Everything on
-- such a receipt is typed in — including each row's amount, since there is no
-- payment in the app to read it from. It is print only: nothing reaches the
-- Ledger, Payments, Overview or Finances.
--
--   payment_receipts.subject_type      'patient' (as before) or 'old'
--   payment_receipt_lines.amount       an old patient's row only
--
-- A patient receipt keeps both its patient and bill, and every row keeps its
-- payment and no amount — the amount stays the payment's own. An old patient's
-- receipt has neither, and every row has a typed amount instead.
--
-- Additive: the live code writes only patient receipts, which satisfy every
-- check below.
--
-- NOT applied to production until the client releases it.

alter table public.payment_receipts
  add column if not exists subject_type text not null default 'patient';
alter table public.payment_receipts drop constraint if exists payment_receipts_subject_type_check;
alter table public.payment_receipts add constraint payment_receipts_subject_type_check
  check (subject_type in ('patient', 'old'));

alter table public.payment_receipts alter column patient_id drop not null;
alter table public.payment_receipts alter column patient_billing_id drop not null;
alter table public.payment_receipts drop constraint if exists payment_receipts_subject_check;
alter table public.payment_receipts add constraint payment_receipts_subject_check
  check (
    (subject_type = 'patient' and patient_id is not null and patient_billing_id is not null)
    or (subject_type = 'old' and patient_id is null and patient_billing_id is null)
  );

create index if not exists payment_receipts_created_idx
  on public.payment_receipts (created_at desc);

alter table public.payment_receipt_lines alter column installment_id drop not null;
alter table public.payment_receipt_lines
  add column if not exists amount numeric(12, 2);
alter table public.payment_receipt_lines drop constraint if exists payment_receipt_lines_amount_check;
alter table public.payment_receipt_lines add constraint payment_receipt_lines_amount_check
  check (
    (installment_id is not null and amount is null)
    or (installment_id is null and amount is not null and amount > 0)
  );

comment on column public.payment_receipts.subject_type is
  '''patient'': a registered patient''s receipt, its rows read from their payments. ''old'': a patient not in the app, everything typed in; print only.';
comment on column public.payment_receipt_lines.amount is
  'An old patient''s row only: the amount as typed. A patient receipt''s row has none — it is the payment''s own.';
