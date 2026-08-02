-- Employee registry — table privileges
--
-- Tables created by a migration do not inherit this project's default grants,
-- which is how the lab rebuild shipped with `permission denied for table
-- lab_orders`. Granting explicitly rather than relying on ALTER DEFAULT
-- PRIVILEGES, which only applies to the role that ran it.
--
-- Access control lives in the API (lib/employees/authz.ts). Like every other
-- table in this project, RLS is off.

GRANT SELECT, INSERT, UPDATE ON public.employee_counters TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.next_employee_code()      TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.peek_next_employee_code() TO anon, authenticated, service_role;
