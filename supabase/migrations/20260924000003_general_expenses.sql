-- General expenses: who paid it, and how (PRD v2, CR-07 · CR-10)
--
-- The client's rule: *"Admin expenses are general expenses and are NOT related
-- to petty cash. Petty cash applies to receptionists only."*
--
-- So the two books are finally separate: the desk spends from the float
-- (petty_cash_entries, CR-02) and the admin's spending is a general expense.
-- What a general expense never recorded was who entered it or how the money
-- left — both of which the ledger has always kept, and both of which the
-- Expenses log is now expected to show (Q-09, AC-07.2).
--
-- Access control lives in the API. Like every other table here, RLS is off.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payment_mode varchar(20) NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_payment_mode_check') THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_payment_mode_check CHECK (
        payment_mode IN ('cash', 'upi', 'card', 'bank_transfer', 'cheque'));
  END IF;
END $$;

COMMENT ON COLUMN public.expenses.payment_mode IS
  'How the money left. Defaults to cash, which is what every expense recorded before 20260924000003 was assumed to be.';
COMMENT ON COLUMN public.expenses.created_by IS
  'Who entered it. NULL on expenses recorded before 20260924000003, which kept no author at all.';

CREATE INDEX IF NOT EXISTS idx_expenses_month
  ON public.expenses (month_year, expense_date DESC);
