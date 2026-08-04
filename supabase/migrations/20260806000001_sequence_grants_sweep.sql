-- Sequence privileges — every sequence in the schema, and every future one
--
-- `GRANT INSERT ON <table>` does not imply `USAGE` on the sequence backing its
-- `id` column: table and sequence privileges are separate ACL categories in
-- Postgres. 20260804000005 granted two sequences by name, after Receptionist
-- started adding advances. That fixed those two and left every other one, so
-- the same failure surfaced again the moment an admin saved a general expense:
--
--     permission denied for sequence expenses_id_seq
--
-- Granting them one at a time as each is discovered is how this recurs a third
-- time. This sweeps the whole schema and then sets the default, so a sequence
-- created tomorrow is already covered.
--
-- A loop rather than the one-line `GRANT ... ON ALL SEQUENCES IN SCHEMA
-- public`: that form is a single statement and aborts entirely if the
-- migration role does not own even one sequence in the schema. Per-sequence, a
-- sequence we cannot grant is reported and skipped instead of taking the rest
-- down with it.
--
-- `USAGE, SELECT` matches 20260804000005 — USAGE covers nextval, SELECT covers
-- currval. UPDATE is deliberately withheld: it would permit setval, which lets
-- a caller rewind the counter and hand out ids that already exist.
--
-- Re-running this is a no-op; GRANT is idempotent.
--
-- Access control lives in the API. Like every other table in this project,
-- RLS is off — Postgres has no notion of this app's own ADMIN/DOCTOR/
-- RECEPTIONIST distinction, every request arrives as one of the three roles
-- below.

DO $$
DECLARE
  seq record;
BEGIN
  FOR seq IN
    SELECT schemaname, sequencename
      FROM pg_sequences
     WHERE schemaname = 'public'
     ORDER BY sequencename
  LOOP
    BEGIN
      EXECUTE format(
        'GRANT USAGE, SELECT ON SEQUENCE %I.%I TO anon, authenticated, service_role',
        seq.schemaname, seq.sequencename
      );
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'skipped %.% — not owned by %',
        seq.schemaname, seq.sequencename, current_user;
    END;
  END LOOP;
END
$$;

-- Sequences created after this migration. The TABLES equivalent has been in
-- place since 20260801000005; only SEQUENCES was missing, which is the whole
-- reason this keeps happening. Note this only covers objects created by the
-- role that runs it — the same caveat that already applies to 20260801000005.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
