-- Employee registry — attribution
--
-- 20260802000004_attribution_columns.sql added created_by / updated_by across
-- the app and skipped all three payroll tables. So money left the drawer and
-- payroll was signed off with nothing recording who did either: `advances` has
-- only `date_given`, and `salary_payments.settled_on` is a bare date.
--
-- Two different questions get two different columns on `advances`:
--
--   given_by    who physically handed over the cash. Free text, deliberately —
--               it is often a cashier or a ward sister who has no login, and a
--               name that cannot be recorded ends up in the remarks box, where
--               nothing can query it.
--   created_by  who was at the keyboard. Captured from the session, never typed.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.salary_payments
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settled_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.advances
  ADD COLUMN IF NOT EXISTS given_by   varchar(120),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.advances.given_by       IS 'Who physically handed over the cash. Free text — often not a system user.';
COMMENT ON COLUMN public.advances.created_by     IS 'Who recorded the advance. Taken from the session, not typed.';
COMMENT ON COLUMN public.salary_payments.settled_by IS 'Who signed the payroll off. settled_on records when; this records who.';

-- The advance log lists a month across all staff and is the screen reception
-- will spend its time on.
CREATE INDEX IF NOT EXISTS advances_month_year_idx  ON public.advances (month_year, date_given DESC);
CREATE INDEX IF NOT EXISTS advances_employee_id_idx ON public.advances (employee_id);
