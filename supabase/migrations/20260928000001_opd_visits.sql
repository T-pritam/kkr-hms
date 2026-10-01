-- Round 10 — an OPD walk-in can be seen by one or more doctors, whose fees are
-- paid like any other visit's, and can carry a medicine amount that is the
-- hospital's expense (client, 28 Sep).
--
-- An OPD receipt is a ledger row, not a registered patient. Its doctor visits
-- and fee rows hang off that row instead of a patient and a bill:
--
--   patient_consultations.opd_ledger_transaction_id   (exactly one of patient_id / this)
--   doctor_visit_settlements.opd_ledger_transaction_id (a bill, or this)
--   daily_ledger_transactions.medicine_expense        (OPD rows only)
--
-- Additive for the code live before it: two columns become nullable (every
-- existing row still has them), and the rest are new and optional. Deleting an
-- OPD receipt takes its visits and unpaid fees with it (on delete cascade); the
-- app refuses to delete one whose fee is already paid.
--
-- Applied to production on 2026-10-01 (as `opd_visits`), before the round 10 deploy.

alter table public.daily_ledger_transactions
  add column if not exists medicine_expense numeric(12, 2);
alter table public.daily_ledger_transactions drop constraint if exists dlt_medicine_expense_check;
alter table public.daily_ledger_transactions add constraint dlt_medicine_expense_check
  check (medicine_expense is null or (medicine_expense >= 0 and source = 'opd'));

alter table public.patient_consultations alter column patient_id drop not null;
alter table public.patient_consultations
  add column if not exists opd_ledger_transaction_id uuid
  references public.daily_ledger_transactions(id) on delete cascade;
alter table public.patient_consultations drop constraint if exists pc_patient_or_opd_check;
alter table public.patient_consultations add constraint pc_patient_or_opd_check
  check ((patient_id is not null) <> (opd_ledger_transaction_id is not null));
create index if not exists patient_consultations_opd_idx
  on public.patient_consultations (opd_ledger_transaction_id) where opd_ledger_transaction_id is not null;

alter table public.doctor_visit_settlements alter column patient_billing_id drop not null;
alter table public.doctor_visit_settlements alter column patient_id drop not null;
alter table public.doctor_visit_settlements
  add column if not exists opd_ledger_transaction_id uuid
  references public.daily_ledger_transactions(id) on delete cascade;
alter table public.doctor_visit_settlements drop constraint if exists dvs_bill_or_opd_check;
alter table public.doctor_visit_settlements add constraint dvs_bill_or_opd_check
  check ((patient_billing_id is not null) or (opd_ledger_transaction_id is not null));
create index if not exists doctor_visit_settlements_opd_idx
  on public.doctor_visit_settlements (opd_ledger_transaction_id) where opd_ledger_transaction_id is not null;
