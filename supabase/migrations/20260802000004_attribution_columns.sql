-- Attribution columns for "last updated by <name> at <time>"
--
-- Most patient-facing tables already carry created_by / updated_by and the API
-- already writes them; the screens simply never showed them. These four do not
-- have the columns at all:
--
--   patients          — nobody can tell who changed a phone number or
--                       discharged a patient
--   doctors           — no attribution on create or edit
--   lab_orders        — has created_by / collected_by, but no general
--                       "who touched this last"
--   lab_order_items   — same
--
-- All nullable: existing rows keep NULL and the UI simply omits the stamp.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.lab_orders
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.lab_order_items
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.patients.updated_by IS 'Last user to modify this row. Shown on the Patient Info tab.';
COMMENT ON COLUMN public.lab_orders.updated_by IS 'Last user to modify this order. Distinct from collected_by / entered_by, which record specific workflow steps.';
