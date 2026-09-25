-- BUGS #68, steps 2 and 3 (narrowing half) — the browser's key reaches nothing
-- but the live-refresh signals.
--
-- The anon key ships to every browser. Until now it could read, insert, update
-- and delete 49 tables (users and their password hashes included), call 11
-- database functions, and receive every change to 21 tables in full over live
-- refresh. The app's server now uses the service-role key (lib/supabase/server.ts)
-- and live refresh listens to change_signals (20260925000006), so nothing
-- legitimate needs any of that.
--
-- `authenticated` is closed too: the app never uses Supabase Auth (no auth
-- users), but the role would otherwise inherit everything anon had.
--
-- Apply only after the code that uses the service-role key is live.
-- Undo: supabase/rollback/20260925000007_reopen_anon_access.sql

-- 1. Tables: nothing, except reading the signals.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.change_signals to anon;

-- 2. Sequences and functions. service_role is granted explicitly so that no
--    call the server makes depends on the PUBLIC grant being removed here.
revoke all on all sequences in schema public from anon, authenticated;
grant execute on all functions in schema public to service_role;
revoke execute on all functions in schema public from public, anon, authenticated;

-- 3. Future objects: stop a new table or function from opening itself to the
--    browser, while the server keeps getting what it needs.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public grant execute on functions to service_role;

-- 4. Live refresh streams the signals only — no real table, no row data.
do $$
declare
  r record;
begin
  for r in
    select tablename from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename <> 'change_signals'
  loop
    execute format('alter publication supabase_realtime drop table public.%I', r.tablename);
  end loop;
end;
$$;
