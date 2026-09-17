-- Doctor visit settlements — who settled it, not just who last touched it
--
-- doctor_visit_settlements already has created_by/updated_by, but settling one
-- only ever stamped updated_by — the same column an ordinary reprice edit
-- writes. So "who marked this settled" was indistinguishable from "who last
-- edited it", the same gap 20260804000003_employee_attribution.sql closed for
-- salary_payments.settled_by. This adds the same column here.

ALTER TABLE public.doctor_visit_settlements
  ADD COLUMN IF NOT EXISTS settled_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.doctor_visit_settlements.settled_by IS
  'Who marked this settled. updated_by covers edits generally; this is specifically the settle action.';
