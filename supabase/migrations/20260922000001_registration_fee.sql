-- Registration fee at registration (PRD v2, CR-11) and payment kinds (CR-12)
--
-- The client's rule: the registration fee comes from the catalogue, is pre-filled
-- when a patient is registered, and — if the desk ticks "collected" — is recorded
-- as a payment received, with its own ledger entry. It is both a charge line
-- (services used) and a payment (PRD v2 Q-45 = B), and it shows as its own type,
-- "Registration fee", in Payments, the Ledger and Finances (Q-46 = B).
--
-- Three things are added. None of them changes an existing row's meaning.
--
--   1. charge_items.is_registration_fee — which catalogue entry *is* the fee.
--      Only admin may change that entry (Q-40 = A; enforced in the API). The
--      seeded 'REG' item is the one the desk already bills registration from.
--
--   2. patient_billing_installments.kind — 'payment' (every existing row) or
--      'registration'. One registration payment per bill.
--
--   3. patient_billing.registration_fee_status — pending / collected / waived,
--      set by the registration form. NULL on bills registered before this
--      change: their fee (if any) was billed as an ordinary charge and paid as
--      an ordinary payment, and nothing can tell those payments apart now, so
--      they must not suddenly show "registration fee not collected".
--
-- And the ledger learns the 'registration' source.
--
-- Access control lives in the API. Like every other table in this project, RLS
-- is off (PRD §9 — a separate task).

-- 1. Which catalogue item is the registration fee ---------------------------

ALTER TABLE public.charge_items
  ADD COLUMN IF NOT EXISTS is_registration_fee boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.charge_items.is_registration_fee IS
  'True on the one catalogue entry the registration form pre-fills the fee from. Only ADMIN may edit or retire that entry.';

-- At most one entry can be the registration fee.
CREATE UNIQUE INDEX IF NOT EXISTS idx_charge_items_one_registration_fee
  ON public.charge_items (is_registration_fee)
  WHERE is_registration_fee;

UPDATE public.charge_items
   SET is_registration_fee = true
 WHERE lower(code) = 'reg'
   AND NOT EXISTS (SELECT 1 FROM public.charge_items WHERE is_registration_fee);

-- 2. What a payment is for ---------------------------------------------------

ALTER TABLE public.patient_billing_installments
  ADD COLUMN IF NOT EXISTS kind varchar(20) NOT NULL DEFAULT 'payment';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pbi_kind_check') THEN
    ALTER TABLE public.patient_billing_installments
      ADD CONSTRAINT pbi_kind_check CHECK (kind IN ('payment', 'registration'));
  END IF;
END $$;

COMMENT ON COLUMN public.patient_billing_installments.kind IS
  'payment = an ordinary installment; registration = the registration fee taken at (or after) registration. At most one registration per bill.';

-- The backstop for a double-click on "Register" or "Collect now".
CREATE UNIQUE INDEX IF NOT EXISTS idx_pbi_one_registration_per_bill
  ON public.patient_billing_installments (patient_billing_id)
  WHERE kind = 'registration';

-- 3. Whether the registration fee has been taken -----------------------------

ALTER TABLE public.patient_billing
  ADD COLUMN IF NOT EXISTS registration_fee_status varchar(20);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pb_registration_fee_status_check') THEN
    ALTER TABLE public.patient_billing
      ADD CONSTRAINT pb_registration_fee_status_check CHECK (
        registration_fee_status IS NULL
        OR registration_fee_status IN ('pending', 'collected', 'waived'));
  END IF;
END $$;

COMMENT ON COLUMN public.patient_billing.registration_fee_status IS
  'pending = charged but not yet collected; collected = a registration payment exists; waived = registered with a fee of 0. NULL on bills registered before 20260922000001.';

-- 4. The ledger source ------------------------------------------------------
--
-- Same list as 20260807000005 plus 'registration'. The table is small and every
-- live row already satisfies the new list, so it goes on plain.

ALTER TABLE public.daily_ledger_transactions
  DROP CONSTRAINT IF EXISTS dlt_source_check;

ALTER TABLE public.daily_ledger_transactions
  ADD CONSTRAINT dlt_source_check CHECK (source IN (
    'patient', 'opd', 'expense', 'doctor_settlement', 'referral_commission', 'salary', 'registration'));
