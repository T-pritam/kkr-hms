-- BUGS #68, step 3 (additive half) — live refresh without the data.
--
-- Screens refetch when a table they show changes (hooks/use-realtime-refetch.ts).
-- They used to subscribe to the real tables, which streamed every changed row,
-- in full, to anyone holding the public anon key. From now on a trigger on each
-- watched table adds a row here — the table's name and a time, nothing else —
-- and the browser listens to this table only.
--
-- Additive: nothing is revoked and the real tables stay in the stream, so the
-- code that is live keeps working. 20260925000007 narrows once the new code is
-- deployed.

create table if not exists public.change_signals (
  id bigint generated always as identity primary key,
  table_name text not null,
  changed_at timestamptz not null default now()
);

comment on table public.change_signals is
  'Live-refresh signals: which table changed, and when. No row data. Written by public.signal_change(), read by the browser (anon), pruned hourly. BUGS #68.';

-- The browser may read the signals and nothing else; nobody but the trigger writes.
alter table public.change_signals enable row level security;
drop policy if exists change_signals_read on public.change_signals;
create policy change_signals_read on public.change_signals for select to anon using (true);
revoke all on public.change_signals from anon, authenticated;
grant select on public.change_signals to anon;

-- Statement-level, so a bulk write is one signal. A failure to signal must
-- never fail the write that caused it, hence the exception block.
create or replace function public.signal_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.change_signals (table_name) values (tg_table_name);
  exception when others then
    raise warning 'signal_change(%): %', tg_table_name, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.signal_change() from public, anon, authenticated;

-- Every table a screen watches. tests/unit/realtime-signals.test.ts reads this
-- list and fails if a useRealtimeRefetch call names a table missing from it.
do $$
declare
  t text;
begin
  foreach t in array array[
    -- signalled-tables:start
    'advances', 'case_sheet_attachments', 'case_sheet_doctors', 'case_sheet_medications',
    'charge_items', 'charge_sheet_items', 'charge_sheets', 'daily_ledger_transactions',
    'doctor_visit_settlements', 'doctors', 'employees', 'expenses',
    'lab_order_items', 'lab_orders', 'lab_result_values', 'lab_tests',
    'patient_billing', 'patient_billing_installments', 'patient_case_sheets',
    'patient_charges', 'patient_consultations', 'patients', 'petty_cash_entries',
    'referrals', 'salary_payments', 'test_parameter_ranges', 'test_parameters', 'users'
    -- signalled-tables:end
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_signal_change', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each statement execute function public.signal_change()',
      t || '_signal_change', t);
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'change_signals'
  ) then
    alter publication supabase_realtime add table public.change_signals;
  end if;
end;
$$;

-- Signals are only needed for the moment they are delivered.
select cron.schedule(
  'prune-change-signals',
  '15 * * * *',
  $$delete from public.change_signals where changed_at < now() - interval '1 hour'$$
);
