-- Table and function privileges for the charges rebuild
--
-- Access control lives in the API. Like every other table in this project RLS is
-- off — Postgres has no notion of this app's ADMIN/DOCTOR/RECEPTIONIST
-- distinction, and every request arrives as one of the three roles below. The
-- capability checks are in lib/billing/authz.ts.
--
-- 20260801000005 set ALTER DEFAULT PRIVILEGES for tables and 20260806000001 did
-- the same for sequences, so tables created by that same role are already
-- covered. This grants them explicitly anyway: default privileges only apply to
-- objects created by the role that set them, and a migration applied through the
-- dashboard SQL editor rather than the CLI can easily run as a different one.
-- Re-running is a no-op; GRANT is idempotent.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.charge_items          TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.charge_sheets         TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.charge_sheet_items    TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_purposes        TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_fee_schedule   TO anon, authenticated, service_role;

-- next_charge_sheet_no() writes to this, so the caller needs more than SELECT.
GRANT SELECT, INSERT, UPDATE          ON public.charge_sheet_counters TO anon, authenticated, service_role;

-- The counter is a table, not a sequence, so the sweep in 20260806000001 does not
-- reach it — the function's INSERT ... ON CONFLICT is what needs the privilege
-- above. Granting EXECUTE here keeps the numbering callable from the API for the
-- same reason next_patient_id() is.
GRANT EXECUTE ON FUNCTION public.next_charge_sheet_no() TO anon, authenticated, service_role;
