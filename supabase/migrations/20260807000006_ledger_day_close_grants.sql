-- Daily ledger day close — table and function privileges
--
-- Tables and functions created by a migration do not inherit this project's
-- default grants, which is how the lab rebuild shipped with `permission denied
-- for table lab_orders`. Granting explicitly rather than relying on ALTER
-- DEFAULT PRIVILEGES, which only applies to the role that ran it.
--
-- `anon` is on the list because lib/supabase/server.ts connects with the anon
-- key and RLS is off across this project — access control lives in the API.
-- That also means these functions are reachable through PostgREST by anyone
-- holding the anon key, which ships in the browser bundle. That exposure is
-- pre-existing and systemic (the same key can already INSERT into
-- daily_ledger_transactions directly) rather than introduced here, but close and
-- reopen make it a single call, so it is worth naming: the real fix is RLS or a
-- service-role connection, and it is tracked separately.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_ledger_shift_settlements
  TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.close_ledger_day(date, uuid, text)  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reopen_ledger_day(date, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ledger_open_days(integer, boolean)  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ledger_closure_continuity(date)     TO anon, authenticated, service_role;
