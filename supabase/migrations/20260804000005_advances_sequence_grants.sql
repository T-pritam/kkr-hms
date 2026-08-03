-- Advances / salary payments — sequence privileges
--
-- `GRANT INSERT ON public.advances` (already in place) does not imply
-- `USAGE` on the sequence backing its `id` column — table and sequence
-- privileges are separate ACL categories in Postgres. Neither
-- `advances_id_seq` nor `salary_payments_id_seq` had ever been granted to
-- anon/authenticated/service_role, so every insert failed with:
--
--     permission denied for sequence advances_id_seq
--
-- This was latent for every role — Postgres has no notion of this app's own
-- ADMIN/DOCTOR/RECEPTIONIST distinction, everything connects as one of the
-- three Postgres roles below — it only surfaced once Receptionist started
-- exercising the advance-adding path (lib/employees/authz.ts, advance:write).
--
-- Access control lives in the API. Like every other table in this project,
-- RLS is off.

GRANT USAGE, SELECT ON SEQUENCE public.advances_id_seq        TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.salary_payments_id_seq TO anon, authenticated, service_role;
