-- Daily ledger — the expense category the form has always collected
--
-- components/ledger/expense-entry-modal.tsx has asked for an expense category
-- since it was written — Medical Supplies, Utilities & Rent, Maintenance,
-- Staff Bonus, Other — and it is a required field on the form.
--
-- It has never reached the database. The modal simply left it out of the
-- request body, and POST /api/ledger/transactions never destructured it, so
-- the value was dropped between the click and the network call with no error
-- and a success toast. Every ledger debit ever recorded has therefore lost the
-- one field that classified it, and the Finances screen can only report a
-- single undifferentiated "Ledger Expenses" total. Existing rows cannot be
-- backfilled — the information was never transmitted.
--
-- `expense_category_detail` is the same conditional free text that
-- expenses.expense_type_detail is (20260806000002), for the same reason: the
-- 'other' bucket is the one that needs explaining. Named for the column it
-- qualifies so the pair reads identically on both tables.
--
-- Both nullable, no CHECK. Every existing row has neither, and the columns are
-- meaningless on the credit and OPD rows that share this table — only
-- source = 'expense' ever carries one, which the API enforces by forcing both
-- to NULL on every other source. The allow-list is enforced in the API against
-- lib/finances/constants.ts.
--
-- Access control lives in the API. Like every other table in this project,
-- RLS is off.

ALTER TABLE public.daily_ledger_transactions
  ADD COLUMN IF NOT EXISTS expense_category        varchar(30),
  ADD COLUMN IF NOT EXISTS expense_category_detail varchar(40);

COMMENT ON COLUMN public.daily_ledger_transactions.expense_category IS
  'supplies | utilities | maintenance | staff | other. Set only when source = ''expense''; NULL on credits and OPD rows.';

COMMENT ON COLUMN public.daily_ledger_transactions.expense_category_detail IS
  'Free text qualifying the category. Required by the API when expense_category = ''other'', NULL otherwise. Displayed as "other - (detail)".';
