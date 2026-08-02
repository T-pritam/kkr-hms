-- Employee registry — the fields a staff record actually needs
--
-- `employees` held eight columns: id, name, designation, base_salary,
-- join_date, status and the two timestamps. There was no way to reach a member
-- of staff, no next of kin, and no bank details for the salary that this same
-- table computes every month.
--
-- Nothing here is required. Adding an employee still needs exactly the four
-- fields it needed before — name, designation, base salary and joining date —
-- so the desk is no slower than it was.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS employee_code              varchar(30),
  ADD COLUMN IF NOT EXISTS phone                      varchar(30),
  ADD COLUMN IF NOT EXISTS address                    text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name     varchar(120),
  ADD COLUMN IF NOT EXISTS emergency_contact_relation varchar(40),
  ADD COLUMN IF NOT EXISTS emergency_contact_phone    varchar(30),
  ADD COLUMN IF NOT EXISTS date_of_birth              date,
  ADD COLUMN IF NOT EXISTS gender                     varchar(10),
  ADD COLUMN IF NOT EXISTS id_proof_type              varchar(40),
  ADD COLUMN IF NOT EXISTS id_proof_number            varchar(60),
  ADD COLUMN IF NOT EXISTS bank_account_no            varchar(40),
  ADD COLUMN IF NOT EXISTS bank_ifsc                  varchar(20);

COMMENT ON COLUMN public.employees.employee_code   IS 'EMP/<2-digit year>/<3 digits>. Issued by next_employee_code().';
COMMENT ON COLUMN public.employees.bank_account_no IS 'For salary transfer. Shown only on the employee record and the payslip.';

-- The same three values the patient registry uses, so one vocabulary covers
-- both. See lib/patients/constants.ts, which lib/employees/constants.ts imports.
UPDATE public.employees
   SET gender = initcap(lower(trim(gender)))
 WHERE gender IS NOT NULL
   AND gender <> initcap(lower(trim(gender)));

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_gender_check;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_gender_check
  CHECK (gender IS NULL OR gender IN ('Male', 'Female', 'Other'));

-- Deleting an employee sets status to 'Inactive' rather than removing the row,
-- because their salary and advance history has to survive. Only these two
-- values are ever written; constrain them so a typo cannot make a member of
-- staff invisible to every screen at once.
UPDATE public.employees
   SET status = 'Active'
 WHERE status IS NULL
    OR status NOT IN ('Active', 'Inactive');

ALTER TABLE public.employees
  ALTER COLUMN status SET DEFAULT 'Active';

ALTER TABLE public.employees
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_status_check;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_status_check
  CHECK (status IN ('Active', 'Inactive'));

COMMENT ON COLUMN public.employees.status IS 'Active | Inactive. Inactive is the soft delete — the row stays so salary and advance history remains readable.';
