-- Daily ledger transactions — constraining the vocabularies
--
-- MUST RUN AFTER 20260807000004, which retires 'day_closed'. Running it first
-- fails on the ten rows still carrying that status.
--
-- The table has never had a single CHECK constraint. Every vocabulary — status,
-- type, source, payment mode — has been enforced only by an if-statement in one
-- route, which is precisely how three other routes came to write rows that
-- bypassed the rules and how 'day_closed' came to mean two different things.
--
-- Live data was verified clean before writing this: zero non-positive amounts,
-- zero UPI rows missing a reference, payment modes limited to cash and upi, and
-- sources to patient/opd/expense. So these go on plain — no NOT VALID two-step.
--
-- 'salary' is in the source list ahead of any code that writes it. Settling
-- payroll posts no ledger debit today while doctor fees and referral commissions
-- both do; including it here costs nothing and saves a migration later.
--
-- Access control lives in the API. Like every other table in this project,
-- RLS is off.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dlt_status_check') THEN
    ALTER TABLE public.daily_ledger_transactions
      ADD CONSTRAINT dlt_status_check CHECK (status IN ('pending', 'verified'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dlt_type_check') THEN
    ALTER TABLE public.daily_ledger_transactions
      ADD CONSTRAINT dlt_type_check CHECK (transaction_type IN ('credit', 'debit'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dlt_source_check') THEN
    ALTER TABLE public.daily_ledger_transactions
      ADD CONSTRAINT dlt_source_check CHECK (source IN (
        'patient', 'opd', 'expense', 'doctor_settlement', 'referral_commission', 'salary'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dlt_mode_check') THEN
    ALTER TABLE public.daily_ledger_transactions
      ADD CONSTRAINT dlt_mode_check CHECK (payment_mode IN (
        'cash', 'upi', 'card', 'bank_transfer', 'cheque'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dlt_amount_check') THEN
    ALTER TABLE public.daily_ledger_transactions
      ADD CONSTRAINT dlt_amount_check CHECK (amount > 0);
  END IF;

  -- A UPI receipt with no reference cannot be reconciled against the statement.
  -- The ledger's own POST has always required this; the installments route did not.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dlt_upi_ref_check') THEN
    ALTER TABLE public.daily_ledger_transactions
      ADD CONSTRAINT dlt_upi_ref_check CHECK (
        payment_mode <> 'upi' OR btrim(coalesce(reference_number, '')) <> '');
  END IF;
END $$;

-- Backs the open-day worklist and the per-date unverified counts.
CREATE INDEX IF NOT EXISTS idx_dlt_date_status
  ON public.daily_ledger_transactions (transaction_date, status);

COMMENT ON COLUMN public.daily_ledger_transactions.status IS
  'pending | verified. The workflow state of this one entry. Whether its DAY is closed is a separate fact, recorded in daily_ledger_closures — conflating the two is what let one operator''s shift settlement lock the date for everybody.';
