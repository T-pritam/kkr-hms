-- Case Sheet rebuild — table privileges
--
-- Tables created through the Supabase dashboard inherit SELECT/INSERT/UPDATE/
-- DELETE grants for anon, authenticated and service_role from the project's
-- default privileges. Tables created by a migration do not — which is how the
-- lab rebuild shipped with `permission denied for table lab_orders`.
--
-- 20260801000005 set ALTER DEFAULT PRIVILEGES so new tables should now inherit
-- these anyway. Granting explicitly regardless: default privileges only apply
-- to the role that ran that statement, and this must not depend on which
-- connection creates the table.
--
-- Access control lives in the API (lib/case-sheet/authz.ts). Like every other
-- table in this project, RLS is off — see docs/CASE_SHEET_MODULE.md.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.medicines               TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_sheet_doctors      TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_sheet_medications  TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_sheet_attachments  TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_sheet_counters     TO anon, authenticated, service_role;

-- The audit log is append-only by policy. No UPDATE, no DELETE: a trail that
-- can be rewritten is not a trail.
GRANT SELECT, INSERT ON public.record_audit_log TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.next_discharge_summary_no() TO anon, authenticated, service_role;
