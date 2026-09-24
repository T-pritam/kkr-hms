-- Narrowing, after the round-5 code is live
--
-- The companion to 20260925000001. That file was additive and data-only, so it
-- was safe while the old code was still serving; this one makes the schema
-- refuse what the old code used to write, so it must not be applied until the
-- new code has deployed.
--
-- Nothing here moves money. It closes the door behind the change.

-- 1. No payment is labelled lab or medicine any more -------------------------
--
-- An *Included* amount is the hospital's expense and an excluded one is not
-- recorded at all (Q-82/Q-83, reversed 2026-09-24), so no payment is ever
-- collected for either. The one that existed became `regular` in the previous
-- migration, because the patient really did hand that money to the desk.

ALTER TABLE public.patient_billing_installments
  DROP CONSTRAINT IF EXISTS pbi_kind_check;

ALTER TABLE public.patient_billing_installments
  ADD CONSTRAINT pbi_kind_check CHECK (
    kind IN ('regular', 'advance', 'discharge', 'misc', 'registration'));

COMMENT ON COLUMN public.patient_billing_installments.kind IS
  'The label the desk picked, plus registration (CR-11). "lab" and "medicine" are gone: a lab or medicine charge is never collected as its own payment (client revision, 2026-09-24).';

-- 2. A lab/medicine charge is included, or nothing has been decided ----------
--
-- `to_collect` and `collected` described a separate payment that no longer
-- exists. `collected_installment_id` and the CHECK that guarded it go with
-- them; both were emptied by the previous migration.

ALTER TABLE public.patient_charges
  DROP CONSTRAINT IF EXISTS pc_collected_has_payment_check;

ALTER TABLE public.patient_charges
  DROP CONSTRAINT IF EXISTS pc_lab_medicine_status_check;

ALTER TABLE public.patient_charges
  ADD CONSTRAINT pc_lab_medicine_status_check CHECK (
    lab_medicine_status IS NULL OR lab_medicine_status = 'included');

ALTER TABLE public.patient_charges
  DROP COLUMN IF EXISTS collected_installment_id;

COMMENT ON COLUMN public.patient_charges.lab_medicine_status IS
  'included = the patient''s payments covered it and the hospital owes the lab, so the amount is one of its expenses (derived, never stored: lib/finances/lab-medicine-expense.ts). NULL = not decided, and nobody''s expense until someone answers.';

-- 3. A settled payout must say when, and for how much -------------------------
--
-- Money out reads these rows now rather than ledger debits, so a settled row
-- with no date would be money that left and appears in no month, and one with
-- no amount would be money that left for nothing. Both were back-filled in the
-- previous migration; these constraints keep them true.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dvs_settled_has_payout_check') THEN
    ALTER TABLE public.doctor_visit_settlements
      ADD CONSTRAINT dvs_settled_has_payout_check CHECK (
        settled IS NOT TRUE
        OR (settlement_date IS NOT NULL
            AND COALESCE(settlement_amount, total_amount) IS NOT NULL));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pb_referral_settled_has_date_check') THEN
    ALTER TABLE public.patient_billing
      ADD CONSTRAINT pb_referral_settled_has_date_check CHECK (
        referral_settled IS NOT TRUE OR referral_settlement_date IS NOT NULL);
  END IF;
END $$;

-- 4. The ledger keeps no payouts ---------------------------------------------
--
-- The ledger is a receipts book now: money in, plus the frozen legacy expense
-- debits. A payout comes straight from the admin and never reaches the desk's
-- cash box (Q-37, reversed). This refuses a new one at the database, so a stray
-- caller cannot quietly reintroduce the disagreement the change removed.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dlt_no_payout_debits_check') THEN
    ALTER TABLE public.daily_ledger_transactions
      ADD CONSTRAINT dlt_no_payout_debits_check CHECK (
        source NOT IN ('doctor_settlement', 'referral_commission'));
  END IF;
END $$;

-- `ledger_transaction_id` and `referral_ledger_transaction_id` stay as dead
-- history rather than being dropped: nothing writes them, and keeping them
-- costs nothing while the change settles.
