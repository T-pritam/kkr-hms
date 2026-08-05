-- Daily ledger — close, reopen, and the open-day worklist, as database functions
--
-- Closing a day used to be three API round-trips: check for an existing closure,
-- fetch and sum the day's transactions, insert the result. Nothing held those
-- steps together, so two admins closing the same date at the same moment could
-- both pass the check and both insert. The totals could also be computed from a
-- snapshot that had already moved by the time the row was written.
--
-- Doing it in one function fixes that, and it removes the client from the
-- arithmetic entirely. The old route accepted `opening_balance` in the request
-- body and never reconciled it against anything — the browser was choosing the
-- number that anchors the day's balance chain. It is now derived from the
-- previous active closure and cannot be supplied.
--
-- Note what close_ledger_day does NOT do: it never touches
-- daily_ledger_transactions. Closing is a property of the date, recorded in one
-- row. That is what makes the old failure mode — the bulk status update
-- succeeding and the closure insert then failing, freezing every entry on the
-- day with no closure to point at — impossible rather than merely unlikely.
--
-- Errors are raised with custom SQLSTATEs so the API can map them on error.code
-- and never on message text. Class 'LC' is outside the reserved prefixes and is
-- a legal user-defined class:
--
--   LC001  the date already has an active closure          -> 409
--   LC002  no transactions on the date, and no prior close -> 404
--   LC003  the closure date is in the future               -> 400
--   LC004  there is no active closure to reopen            -> 409
--   LC005  the reopen reason is missing or too short       -> 400
--
-- Access control lives in the API. Like every other table in this project,
-- RLS is off — these functions are SECURITY INVOKER and assume the caller has
-- already been authorised.

-- ---------------------------------------------------------------------------
-- close_ledger_day
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_ledger_day(
  p_closure_date date,
  p_closed_by    uuid,
  p_notes        text DEFAULT NULL
) RETURNS public.daily_ledger_closures
LANGUAGE plpgsql
AS $$
DECLARE
  v_row     public.daily_ledger_closures;
  v_prev    public.daily_ledger_closures;  -- last active closure BEFORE this date
  v_prior   public.daily_ledger_closures;  -- newest closure FOR this date, any status
  v_version integer;
  v_open      numeric(12,2);
  v_open_cash numeric(12,2);
  v_count   integer;
BEGIN
  IF p_closure_date > current_date THEN
    RAISE EXCEPTION 'closure date is in the future' USING ERRCODE = 'LC003';
  END IF;

  -- Serialises concurrent closes of the same date so the existence check, the
  -- aggregate and the insert all see one snapshot. The partial unique index is
  -- the backstop, not the plan.
  PERFORM pg_advisory_xact_lock(hashtext('ledger_close'), p_closure_date - date '2000-01-01');

  IF EXISTS (
    SELECT 1 FROM public.daily_ledger_closures
     WHERE closure_date = p_closure_date AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'this date has already been closed' USING ERRCODE = 'LC001';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.daily_ledger_transactions
   WHERE transaction_date = p_closure_date;

  SELECT * INTO v_prior
    FROM public.daily_ledger_closures
   WHERE closure_date = p_closure_date
   ORDER BY version DESC
   LIMIT 1;

  -- An empty day has nothing to reconcile. The exception is re-closing after a
  -- reopen whose whole purpose was to delete a bad entry: refusing there would
  -- strand the date open with no way to shut it again.
  IF v_count = 0 AND v_prior.id IS NULL THEN
    RAISE EXCEPTION 'no transactions found for this date' USING ERRCODE = 'LC002';
  END IF;

  v_version := coalesce(v_prior.version, 0) + 1;

  -- Opening balances are derived, never supplied. The chain is only meaningful
  -- if each day starts where the last one finished.
  SELECT * INTO v_prev
    FROM public.daily_ledger_closures
   WHERE closure_date < p_closure_date AND status = 'active'
   ORDER BY closure_date DESC
   LIMIT 1;

  v_open      := coalesce(v_prev.closing_balance, 0);
  v_open_cash := coalesce(v_prev.closing_cash_balance, 0);

  INSERT INTO public.daily_ledger_closures AS c (
    closure_date, status, version, supersedes_id,
    total_credits, total_debits, net_balance,
    total_credits_cash, total_credits_upi, total_credits_card,
    total_credits_bank_transfer, total_credits_cheque, total_credits_other,
    total_debits_cash,
    transaction_count, credit_count, debit_count, unverified_count,
    opening_balance, closing_balance, closing_cash_balance,
    closed_by, notes
  )
  SELECT
    p_closure_date, 'active', v_version, v_prior.id,
    coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit'), 0),
    coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'debit'), 0),
    coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit'), 0)
      - coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'debit'), 0),

    coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit' AND t.payment_mode = 'cash'), 0),
    coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit' AND t.payment_mode = 'upi'), 0),
    coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit' AND t.payment_mode = 'card'), 0),
    coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit' AND t.payment_mode = 'bank_transfer'), 0),
    coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit' AND t.payment_mode = 'cheque'), 0),
    coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit'
             AND t.payment_mode IN ('bank_transfer', 'cheque')), 0),

    coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'debit' AND t.payment_mode = 'cash'), 0),

    count(*),
    count(*) FILTER (WHERE t.transaction_type = 'credit'),
    count(*) FILTER (WHERE t.transaction_type = 'debit'),
    count(*) FILTER (WHERE t.status <> 'verified'),

    v_open,
    v_open + coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit'), 0)
           - coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'debit'), 0),
    v_open_cash
      + coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit' AND t.payment_mode = 'cash'), 0)
      - coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'debit'  AND t.payment_mode = 'cash'), 0),

    p_closed_by, nullif(btrim(coalesce(p_notes, '')), '')
  FROM public.daily_ledger_transactions t
  WHERE t.transaction_date = p_closure_date
  RETURNING c.* INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.close_ledger_day(date, uuid, text) IS
  'Closes a ledger date by inserting one active closure row. Never modifies daily_ledger_transactions — the lock is a property of the date, not of each entry. Opening balances are derived from the previous active closure.';

-- ---------------------------------------------------------------------------
-- reopen_ledger_day
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reopen_ledger_day(
  p_closure_date date,
  p_reopened_by  uuid,
  p_reason       text
) RETURNS public.daily_ledger_closures
LANGUAGE plpgsql
AS $$
DECLARE
  v_row public.daily_ledger_closures;
BEGIN
  IF btrim(coalesce(p_reason, '')) = '' OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'a reason of at least 10 characters is required to reopen a closed day'
      USING ERRCODE = 'LC005';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ledger_close'), p_closure_date - date '2000-01-01');

  -- Supersede, never delete. The superseded row keeps the totals that were
  -- reported at the time, and the replacement close will point back at it.
  UPDATE public.daily_ledger_closures
     SET status        = 'superseded',
         reopened_at   = now(),
         reopened_by   = p_reopened_by,
         reopen_reason = btrim(p_reason)
   WHERE closure_date = p_closure_date
     AND status = 'active'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'this date is not currently closed' USING ERRCODE = 'LC004';
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.reopen_ledger_day(date, uuid, text) IS
  'Reopens a closed ledger date by superseding its active closure. The old row is retained with the actor, timestamp and reason. A later close inserts a new version pointing back at it via supersedes_id.';

-- ---------------------------------------------------------------------------
-- ledger_open_days — the worklist
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ledger_open_days(
  p_limit         integer DEFAULT 50,
  p_include_today boolean DEFAULT false
) RETURNS TABLE (
  date               date,
  transaction_count  integer,
  credit_count       integer,
  debit_count        integer,
  total_credits      numeric,
  total_debits       numeric,
  net_balance        numeric,
  cash_credits       numeric,
  unverified_count   integer,
  reopened           boolean,
  last_reopened_at   timestamptz,
  last_reopen_reason text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    t.transaction_date AS date,
    count(*)::int,
    count(*) FILTER (WHERE t.transaction_type = 'credit')::int,
    count(*) FILTER (WHERE t.transaction_type = 'debit')::int,
    coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit'), 0),
    coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'debit'), 0),
    coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit'), 0)
      - coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'debit'), 0),
    coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'credit' AND t.payment_mode = 'cash'), 0),
    count(*) FILTER (WHERE t.status <> 'verified')::int,
    -- A date that was closed and then reopened is not the same thing as one
    -- nobody has ever closed, and the worklist must not present them alike.
    (r.reopened_at IS NOT NULL),
    r.reopened_at,
    r.reopen_reason
  FROM public.daily_ledger_transactions t
  LEFT JOIN public.daily_ledger_closures c
         ON c.closure_date = t.transaction_date AND c.status = 'active'
  LEFT JOIN LATERAL (
    SELECT s.reopened_at, s.reopen_reason
      FROM public.daily_ledger_closures s
     WHERE s.closure_date = t.transaction_date AND s.status = 'superseded'
     ORDER BY s.version DESC
     LIMIT 1
  ) r ON true
  WHERE c.id IS NULL
    AND (p_include_today OR t.transaction_date < current_date)
  GROUP BY t.transaction_date, r.reopened_at, r.reopen_reason
  ORDER BY t.transaction_date ASC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.ledger_open_days(integer, boolean) IS
  'Every date carrying ledger activity with no active closure, oldest first. Backs the Day Close worklist and the unclosed-day banner, so an admin never has to step through the date picker hunting for what is still open.';

-- ---------------------------------------------------------------------------
-- ledger_closure_continuity
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ledger_closure_continuity(p_from date)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::int
    FROM public.daily_ledger_closures
   WHERE closure_date > p_from AND status = 'active';
$$;

COMMENT ON FUNCTION public.ledger_closure_continuity(date) IS
  'How many active closures sit after a date. Reopening an earlier day changes its closing balance, which later closures were calculated from; this backs the warning that says so. Balances are not recalculated in a cascade — the admin is told instead.';
