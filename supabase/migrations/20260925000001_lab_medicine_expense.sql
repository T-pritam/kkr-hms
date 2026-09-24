-- Lab & medicine become an expense; payouts leave the ledger (PRD v2, round 5)
--
-- Two rules the client reversed on 2026-09-24, after using the app:
--
--   Q-83 → an *Included* lab or medicine amount is the hospital's **expense**,
--          not its income. The patient's regular payments already covered it and
--          the lab bills us, so the money is ours to pay out.
--   Q-82 → an *Excluded* one is not recorded **at all**. The patient dealt with
--          the lab directly; no charge, no payment, no ledger row.
--   Q-37 → a doctor fee or a referral commission writes **no ledger entry**.
--          In the client's words: *"they take money directly from the admin and
--          handover to the concerned person directly, so there is no ledger
--          entry required (so ledger has no out payment)."*
--
-- The expense is **derived, never stored**: no row in `expenses`, no patient
-- column. The charge is the record — `lab_medicine_status = 'included'` on a
-- charge whose catalogue item is `lab` or `pharmacy`, counted in the month of
-- its `charge_date`.
--
-- This file is the additive and data half, safe to apply **before** the code
-- deploys. The narrowing CHECKs and the column drops are in the next migration,
-- which must wait until after it.
--
-- Everything here is set-based: production is in use, so nothing assumes a row
-- count taken earlier.

-- ── 1. Who changed what, on a payout ────────────────────────────────────────
--
-- The ledger is no longer where a payout is proved, so the settlement row has
-- to carry the whole story. The client asked for the name against each of the
-- three fields that matter — the amount, the status, and who handed the money
-- over — rather than one vague "last edited by".
--
-- `given_by_user_id` is a real user; the older free-text `given_by` stays for
-- someone with no login, and reads as a claim rather than a record.

ALTER TABLE public.doctor_visit_settlements
  ADD COLUMN IF NOT EXISTS given_by_user_id uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS given_by_set_by  uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS given_by_set_at  timestamptz,
  ADD COLUMN IF NOT EXISTS amount_set_at    timestamptz,
  ADD COLUMN IF NOT EXISTS status_set_by    uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS status_set_at    timestamptz;

ALTER TABLE public.patient_billing
  ADD COLUMN IF NOT EXISTS referral_given_by_user_id  uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS referral_given_by_set_by   uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS referral_given_by_set_at   timestamptz,
  ADD COLUMN IF NOT EXISTS referral_commission_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS referral_status_set_by     uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS referral_status_set_at     timestamptz;

COMMENT ON COLUMN public.doctor_visit_settlements.given_by_user_id IS
  'Who physically handed the cash over, as a real user. Defaults to whoever marks the fee paid, and is changed when someone else carried it. The older free-text given_by is kept for a person with no login.';
COMMENT ON COLUMN public.doctor_visit_settlements.status_set_by IS
  'Who last changed paid/unpaid. Unlike settled_by this survives a reversal, so "who un-paid this?" has an answer.';
COMMENT ON COLUMN public.patient_billing.referral_status_set_by IS
  'Who last changed the commission between paid and unpaid. There was no record of this at all before.';

-- What we can recover of the three stamps for rows that already exist.
UPDATE public.doctor_visit_settlements
   SET status_set_by = settled_by,
       status_set_at = settlement_date
 WHERE settled IS TRUE AND status_set_at IS NULL;

UPDATE public.doctor_visit_settlements
   SET amount_set_at = updated_at
 WHERE amount_set_by IS NOT NULL AND amount_set_at IS NULL;

UPDATE public.patient_billing
   SET referral_status_set_by = updated_by,
       referral_status_set_at = referral_settlement_date
 WHERE referral_settled IS TRUE AND referral_status_set_at IS NULL;

-- ── 2. A paid fee must say when, and how much ───────────────────────────────
--
-- Money out reads the settlement rows now, so a settled fee with no
-- `settlement_date` would be counted in no month at all — money that left,
-- invisible on every screen. And the two amount columns disagree on live rows:
-- one fee has total_amount 0 with settlement_amount 1000 (it is the August
-- payout), another has total_amount 2000 with settlement_amount NULL. Reading
-- either column alone loses one of them, so they are made to agree here and
-- the code reads `settlement_amount` with `total_amount` as its fallback.

UPDATE public.doctor_visit_settlements
   SET settlement_date = COALESCE(settlement_date, updated_at, created_at)
 WHERE settled IS TRUE AND settlement_date IS NULL;

UPDATE public.doctor_visit_settlements
   SET total_amount      = COALESCE(settlement_amount, total_amount),
       settlement_amount = COALESCE(settlement_amount, total_amount)
 WHERE settled IS TRUE
   AND (settlement_amount IS DISTINCT FROM total_amount OR settlement_amount IS NULL);

UPDATE public.patient_billing
   SET referral_settlement_date = COALESCE(referral_settlement_date, updated_at, created_at)
 WHERE referral_settled IS TRUE AND referral_settlement_date IS NULL;

-- ── 3. The payout debits go ─────────────────────────────────────────────────
--
-- 4 rows, ₹16,000: two doctor fees (₹1,000 on 08 Aug, ₹8,000 on 24 Sep) and two
-- commissions (₹5,000 on 23 Sep, ₹2,000 on 24 Sep). Checked read-only first —
-- every one has `close_batch_id` NULL, no *active* `daily_ledger_closures` row
-- on its date and no live `daily_ledger_shift_settlements` row, so removing
-- them invalidates no stored total anywhere. The three marked closed were
-- closed by the go-live conversion, not by an admin's batch.
--
-- Matched by source rather than by id: the app is in use and this count has
-- moved twice while the migration was being written.
--
-- The settlements stay marked paid — money out reads them from the rows now —
-- and both link columns are ON DELETE SET NULL, so they null themselves.

DELETE FROM public.daily_ledger_transactions
 WHERE transaction_type = 'debit'
   AND source IN ('doctor_settlement', 'referral_commission');

-- ── 4. Lab and medicine stop being a payment ────────────────────────────────
--
-- One charge in production was collected separately (₹800, against a ₹800
-- `lab` installment) and no charge is `to_collect`. The collected one becomes
-- Included: the patient did pay that money to the desk, so the payment stays
-- and becomes an ordinary one, and the ₹800 is now the hospital's expense.
-- Both columns move in a single statement so `pc_collected_has_payment_check`
-- never sees a half-written row.

UPDATE public.patient_charges pc
   SET lab_medicine_status = 'included',
       collected_installment_id = NULL
  FROM public.patient_billing_installments i
 WHERE pc.collected_installment_id = i.id
   AND i.kind IN ('lab', 'medicine');

UPDATE public.patient_billing_installments
   SET kind = 'regular'
 WHERE kind IN ('lab', 'medicine');

-- "Excluded, waiting to be collected" has no meaning now: an excluded charge is
-- not recorded at all. These go back to undecided rather than being deleted —
-- a human decides whether the hospital owes for them.
UPDATE public.patient_charges
   SET lab_medicine_status = NULL
 WHERE lab_medicine_status = 'to_collect';
