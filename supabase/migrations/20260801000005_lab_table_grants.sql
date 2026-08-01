-- Lab / Pathology rebuild — table privileges
--
-- Tables created through the Supabase dashboard inherit SELECT/INSERT/UPDATE/
-- DELETE grants for anon, authenticated and service_role from the project's
-- default privileges. Tables created by a migration do not, so the API —
-- which connects as `authenticated` — failed with:
--
--     permission denied for table lab_orders
--
-- This grants the new lab tables exactly what every pre-existing table in this
-- project already has, and sets the default so future migrations don't repeat
-- the problem.
--
-- Access control still lives in the API (lib/lab/authz.ts). Like every other
-- table here, RLS is off — see the note at the end of docs/LAB_MODULE.md.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_orders                    TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_order_items              TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_result_values            TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_parameter_ranges        TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_interpretation_templates TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_order_counters           TO anon, authenticated, service_role;

-- next_lab_order_no() is reached through PostgREST's RPC endpoint.
GRANT EXECUTE ON FUNCTION public.next_lab_order_no() TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
