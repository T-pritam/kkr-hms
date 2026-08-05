-- Daily ledger — retiring 'day_closed' as a transaction status
--
-- MUST NOT RUN before the application code that stops writing this status is
-- deployed. If it does, close-employee-day recreates 'day_closed' rows between
-- this repair and the CHECK constraint in 20260807000005, and that constraint
-- then fails on the next deploy with the schema half-migrated.
--
-- Production carries ten transactions with status = 'day_closed' across four
-- (date, employee) groups, each group written by a single created_by. That
-- shape is the evidence: all four were per-employee shift settlements, never day
-- closes. `daily_ledger_closures` is empty, so no date was ever actually closed.
--
-- The repair is written set-based rather than against those ten ids on purpose —
-- the count is a fact about one snapshot, not about this migration.
--
-- Why the rows become 'verified' rather than 'pending':
--   They were reviewed. An admin opened the shift modal, looked at the list and
--   confirmed the cash handover. Demoting them would make four historical dates
--   flag as unverified in the new worklist forever, with nobody left who could
--   action them. verified_by / verified_at stay NULL, which is already possible
--   today — doctor-settlements and referral-commissions both insert
--   status = 'verified' with no verifier — so no new untruth is introduced.
--
-- Why no synthetic closure rows are created:
--   That would assert four day-closes that never happened. 2026-02-11 provably
--   was not closed: three settled rows sit alongside a `pending` row from a
--   different user that nobody ever touched. What did happen was four shift
--   settlements, so those are what get backfilled. The affected dates then show
--   up honestly as *open* in the new worklist.
--
-- All four steps run in one transaction — Supabase applies each migration file
-- transactionally — so a failure part-way leaves nothing half-done.
--
-- Access control lives in the API. Like every other table in this project,
-- RLS is off.

-- 1. Snapshot before rewriting. The cost of insurance is nil; the value of being
--    able to answer "which rows did we touch" a year from now is not.
--    Do not drop this in a later cleanup without a conscious decision — after
--    step 4 it and the audit rows are the only record of what these rows were.
CREATE TABLE IF NOT EXISTS public.daily_ledger_day_closed_backup_20260807 AS
  SELECT id, transaction_date, created_by, status, notes, now() AS captured_at
    FROM public.daily_ledger_transactions
   WHERE status = 'day_closed';

-- 2. One settlement row per (date, employee) that was settled, reconstructed from
--    the rows themselves. Re-runnable: idx_dlss_active is the conflict target.
INSERT INTO public.daily_ledger_shift_settlements (
  settlement_date, employee_id,
  total_credits, total_debits, net_balance,
  credits_cash, credits_upi, credits_card, credits_bank_transfer, credits_cheque,
  debits_cash, cash_expected, transaction_count,
  notes, settled_at, settled_by, status
)
SELECT
  t.transaction_date,
  t.created_by,
  coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit'), 0),
  coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'debit'), 0),
  coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit'), 0)
    - coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'debit'), 0),
  coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit' AND t.payment_mode = 'cash'), 0),
  coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit' AND t.payment_mode = 'upi'), 0),
  coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit' AND t.payment_mode = 'card'), 0),
  coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit' AND t.payment_mode = 'bank_transfer'), 0),
  coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit' AND t.payment_mode = 'cheque'), 0),
  coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'debit'  AND t.payment_mode = 'cash'), 0),
  -- Only cash is ever handed over.
  coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit' AND t.payment_mode = 'cash'), 0)
    - coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'debit' AND t.payment_mode = 'cash'), 0),
  count(*),
  'Backfilled by migration 20260807000004 from status = ''day_closed''. The '
  'settling admin, the timestamp and any note were never recorded by the old '
  'close-employee-day route and cannot be recovered.',
  min(t.created_at),
  NULL,
  'active'
FROM public.daily_ledger_transactions t
WHERE t.status = 'day_closed'
GROUP BY t.transaction_date, t.created_by
ON CONFLICT DO NOTHING;

-- 3. Provenance for every rewritten row, in the log that already exists for this.
INSERT INTO public.record_audit_log
  (entity_type, entity_id, patient_id, action, changes, summary,
   actor_id, actor_name, actor_role)
SELECT
  'ledger_transaction',
  t.id,
  t.patient_id,
  'updated',
  jsonb_build_object('status', jsonb_build_object('from', 'day_closed', 'to', 'verified')),
  'Status repaired by migration 20260807000004: day_closed is no longer a '
  'transaction status. The shift settlement it stood for is preserved in '
  'daily_ledger_shift_settlements.',
  NULL,
  'migration 20260807000004',
  'SYSTEM'
FROM public.daily_ledger_transactions t
WHERE t.status = 'day_closed';

-- 4. The rewrite.
UPDATE public.daily_ledger_transactions
   SET status = 'verified'
 WHERE status = 'day_closed';

COMMENT ON TABLE public.daily_ledger_day_closed_backup_20260807 IS
  'Snapshot of the ten transactions carrying status = ''day_closed'' before migration 20260807000004 rewrote them to ''verified''. Together with the matching record_audit_log rows this is the only remaining record of that state.';
