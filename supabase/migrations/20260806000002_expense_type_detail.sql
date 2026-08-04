-- General expenses — what "Miscellaneous" actually was
--
-- `expenses.expense_type` is one of eight fixed values (lib/finances/constants.ts).
-- Seven of them say what the money went on. The eighth, 'Miscellaneous', says
-- nothing, and it is the one people reach for when there is no better box — so
-- the month's catch-all line is precisely the line nobody can account for
-- afterwards. `remarks` does not cover this: it is optional, and it is used for
-- invoice numbers and vendor names rather than the nature of the spend.
--
-- Nullable, and no CHECK constraint. The column is meaningless for the other
-- seven types, where NULL is the honest value rather than an empty string
-- pretending to be an answer; and the rows already in the table predate this
-- and have nothing to put in it.
--
-- "Required when the type is Miscellaneous" is conditional on another column,
-- which Postgres can only express as a CHECK. It lives in the API instead —
-- POST and PUT in app/api/finances/expenses/route.ts — the same shape as the
-- existing UPI rule, where reference_number is nullable and required only when
-- payment_mode = 'upi'. The API enforces it on edit too, so a legacy row
-- cannot be saved again without one.
--
-- varchar(40) is a backstop, not the validation: the API rejects anything
-- longer with a 400 before Postgres would raise 22001, and the input caps at
-- the same 40. The limit exists because both PDF reports truncate this column
-- at 35 characters (lib/pdf/finance-pdf.ts).
--
-- Access control lives in the API. Like every other table in this project,
-- RLS is off.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS expense_type_detail varchar(40);

COMMENT ON COLUMN public.expenses.expense_type_detail IS
  'Free text qualifying a catch-all expense_type. Required by the API when expense_type = ''Miscellaneous'', NULL otherwise. Displayed as "misc - (detail)".';
