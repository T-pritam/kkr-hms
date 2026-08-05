-- Table privileges for the pharmacy bills tables
--
-- Same reasoning as 20260808000006_charges_grants.sql: RLS is off project-wide,
-- access control lives in the API (lib/pharmacy/*, lib/billing/authz.ts), and
-- every request arrives as one of the three roles below. Granted explicitly
-- rather than relying on default privileges, for the same "might have been
-- applied through the dashboard SQL editor as a different role" reason that
-- file gives. Re-running is a no-op; GRANT is idempotent.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_bills        TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_bill_items   TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_api_sessions TO anon, authenticated, service_role;
