-- Make the pharmacy bill → charge link a real one-to-one
--
-- 20260809000006 enforced "one bill per charge" with a unique *index*
-- (idx_pharmacy_bills_charge). That is correct as far as the data goes, but
-- PostgREST decides whether an embedded resource is an object or an array by
-- looking at pg_constraint, not at bare indexes. With only an index it treated
-- pharmacy_bills as a to-many child of patient_charges and returned
-- `pharmacy_bill` as an array on every charges row.
--
-- An empty array is truthy in JavaScript, so `charge.pharmacy_bill && ...` was
-- true for *every* charge: the Pharmacy badge and the View button rendered on
-- all of them, and on the one real pharmacy row `charge.pharmacy_bill.id` was
-- undefined, so View and Download did nothing.
--
-- The same rule is expressed as a constraint instead. Postgres backs a UNIQUE
-- constraint with its own index, so dropping the hand-rolled one loses nothing.
-- Multiple NULLs stay legal under a UNIQUE constraint, which is what lets
-- 20260810000004 make this column nullable without revisiting this.

DROP INDEX IF EXISTS public.idx_pharmacy_bills_charge;

ALTER TABLE public.pharmacy_bills
  DROP CONSTRAINT IF EXISTS pharmacy_bills_patient_charge_id_key;

ALTER TABLE public.pharmacy_bills
  ADD CONSTRAINT pharmacy_bills_patient_charge_id_key UNIQUE (patient_charge_id);

COMMENT ON CONSTRAINT pharmacy_bills_patient_charge_id_key ON public.pharmacy_bills IS
  'One bill per charge. Deliberately a constraint rather than an index: PostgREST reads pg_constraint to decide that the embedded pharmacy_bill is an object and not an array.';
