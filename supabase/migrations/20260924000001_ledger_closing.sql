-- Closing entries, not days (PRD v2, CR-06 and CR-08)
--
-- The client's rule: *"Remove the per-user, per-day day close. List all relevant
-- rows with full details, let the admin select rows in bulk and mark them
-- closed. No per-user or per-day grouping. Add a separate tab showing rows that
-- are not yet marked closed."*
--
-- So closing moves from the date to the row. A row is Open or Closed; an admin
-- ticks any set of rows and closes them in one batch, with an optional note and
-- the amount received; reopening needs a reason and is kept on the row.
--
-- Go-live (Q-29), applied below in this order:
--   * rows on a day that is already closed  -> closed
--   * rows marked verified                  -> closed
--   * everything else                       -> open
--
-- `daily_ledger_closures` and `daily_ledger_shift_settlements` stay exactly as
-- they are: read-only history, with no screen and nothing writing to them
-- (Q-29). This migration does not touch them.
--
-- Access control lives in the API. Like every other table here, RLS is off.

-- 1. One close of many rows --------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ledger_close_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note            text,
  amount_received numeric(12,2),
  row_count       integer NOT NULL DEFAULT 0,
  closed_at       timestamptz NOT NULL DEFAULT now(),
  closed_by       uuid NOT NULL REFERENCES public.users(id)
);

COMMENT ON TABLE public.ledger_close_batches IS
  'One admin "Mark closed" action over many ledger rows (PRD v2 CR-06). The note and amount received are what the admin typed when closing.';

CREATE INDEX IF NOT EXISTS idx_ledger_close_batches_closed_at
  ON public.ledger_close_batches (closed_at DESC);

-- 2. Closing, and reopening, on the entry ------------------------------------

ALTER TABLE public.daily_ledger_transactions
  ADD COLUMN IF NOT EXISTS closed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by      uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS close_batch_id uuid REFERENCES public.ledger_close_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reopened_at    timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by    uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reopen_reason  text;

COMMENT ON COLUMN public.daily_ledger_transactions.close_batch_id IS
  'The "Mark closed" action that closed this row (ledger_close_batches). NULL while the row is open.';
COMMENT ON COLUMN public.daily_ledger_transactions.reopen_reason IS
  'Why an admin last reopened this row. Reopening without a reason is refused by the API (Q-04 = B).';

-- Every screen asks for the open rows first, across all dates and users.
CREATE INDEX IF NOT EXISTS idx_dlt_open_rows
  ON public.daily_ledger_transactions (transaction_date DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_dlt_close_batch
  ON public.daily_ledger_transactions (close_batch_id)
  WHERE close_batch_id IS NOT NULL;

-- 3. Two statuses, and the go-live conversion (Q-29) --------------------------

ALTER TABLE public.daily_ledger_transactions
  DROP CONSTRAINT IF EXISTS dlt_status_check;

-- (a) rows sitting on a day that was closed: closed, credited to that closure.
UPDATE public.daily_ledger_transactions t
   SET status    = 'closed',
       closed_at = c.closed_at,
       closed_by = c.closed_by
  FROM public.daily_ledger_closures c
 WHERE c.closure_date = t.transaction_date
   AND c.status = 'active'
   AND t.status <> 'closed';

-- (b) rows someone had verified: closed, credited to whoever verified them.
UPDATE public.daily_ledger_transactions
   SET status    = 'closed',
       closed_at = COALESCE(verified_at, created_at),
       closed_by = verified_by
 WHERE status = 'verified';

-- (c) everything else is open and waiting for an admin.
UPDATE public.daily_ledger_transactions
   SET status = 'open'
 WHERE status IS NULL
    OR status NOT IN ('open', 'closed');

ALTER TABLE public.daily_ledger_transactions
  ALTER COLUMN status SET DEFAULT 'open';

ALTER TABLE public.daily_ledger_transactions
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.daily_ledger_transactions
  ADD CONSTRAINT dlt_status_check CHECK (status IN ('open', 'closed'));

COMMENT ON COLUMN public.daily_ledger_transactions.status IS
  'open = still to be closed by an admin; closed = counted and locked. "pending"/"verified"/"day_closed" are gone (PRD v2 Q-24 = A).';

-- A closed row always says who closed it and when.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dlt_closed_has_time_check') THEN
    ALTER TABLE public.daily_ledger_transactions
      ADD CONSTRAINT dlt_closed_has_time_check CHECK (
        status <> 'closed' OR closed_at IS NOT NULL);
  END IF;
END $$;
