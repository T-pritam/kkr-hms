-- Daily ledger — shift settlements as their own record
--
-- Settling an operator's shift and closing the financial day are two different
-- events. One says "this person handed over their cash and went home"; the other
-- says "this date is reconciled and locked". The code has been using a single
-- transaction status, 'day_closed', to mean both, and the damage from that
-- conflation is the reason this table exists:
--
--   * POST /api/ledger/close-employee-day wrote nothing durable. Its only trace
--     was flipping the operator's rows to 'day_closed' — and overwriting the
--     notes on every one of them with "Marked as paid", destroying whatever had
--     been recorded against each entry.
--   * Because the create guard treated any 'day_closed' row on a date as "this
--     day is shut", one receptionist settling their shift locked the date for
--     every other member of staff.
--   * A settlement could not be audited, reversed, or even listed afterwards.
--     Production carries ten such rows across four settlements, with no record
--     of who settled them or when.
--
-- A settlement now writes here and touches no transaction at all. That single
-- change fixes the clobbered notes, the missing record and the cross-operator
-- lock together, because none of them were really separate problems.
--
-- cash_expected vs cash_handed_over is the reason a settlement is worth
-- recording in the first place. The expected figure is derived from the
-- operator's own rows; the handed-over figure is what was physically counted.
-- When they disagree, that gap is the finding — and there has been nowhere to
-- write it down.
--
-- Settlements are reversible rather than deletable, on the same reasoning as
-- closures: status flips to 'reversed' with an actor and a mandatory reason, and
-- the partial unique index keeps exactly one active settlement per operator per
-- day while allowing a corrected one to be recorded afterwards.
--
-- Access control lives in the API. Like every other table in this project,
-- RLS is off.

CREATE TABLE IF NOT EXISTS public.daily_ledger_shift_settlements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_date       date NOT NULL,
  employee_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,

  total_credits         numeric(12,2) NOT NULL DEFAULT 0,
  total_debits          numeric(12,2) NOT NULL DEFAULT 0,
  net_balance           numeric(12,2) NOT NULL DEFAULT 0,

  credits_cash          numeric(12,2) NOT NULL DEFAULT 0,
  credits_upi           numeric(12,2) NOT NULL DEFAULT 0,
  credits_card          numeric(12,2) NOT NULL DEFAULT 0,
  credits_bank_transfer numeric(12,2) NOT NULL DEFAULT 0,
  credits_cheque        numeric(12,2) NOT NULL DEFAULT 0,
  debits_cash           numeric(12,2) NOT NULL DEFAULT 0,

  cash_expected         numeric(12,2) NOT NULL DEFAULT 0,
  cash_handed_over      numeric(12,2),

  transaction_count     integer NOT NULL DEFAULT 0,

  notes                 text,
  settled_at            timestamptz NOT NULL DEFAULT now(),
  settled_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,

  status                varchar(12) NOT NULL DEFAULT 'active',
  reversed_at           timestamptz,
  reversed_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reversal_reason       text,

  CONSTRAINT dlss_status_check CHECK (status IN ('active', 'reversed')),
  CONSTRAINT dlss_reverse_shape_check CHECK (
    (status = 'active'   AND reversed_at IS NULL AND reversal_reason IS NULL)
    OR
    (status = 'reversed' AND reversed_at IS NOT NULL
                         AND btrim(coalesce(reversal_reason, '')) <> '')
  )
);

-- One active settlement per operator per day. A reversed one steps aside so a
-- corrected settlement can be recorded without deleting the mistake.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dlss_active
  ON public.daily_ledger_shift_settlements (settlement_date, employee_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_dlss_date
  ON public.daily_ledger_shift_settlements (settlement_date DESC);

COMMENT ON TABLE public.daily_ledger_shift_settlements IS
  'One cash-handover record per operator per day. Deliberately does NOT lock the date — that is daily_ledger_closures'' job. Settling a shift must never stop a colleague recording an entry.';

COMMENT ON COLUMN public.daily_ledger_shift_settlements.cash_expected IS
  'Cash the operator''s own ledger rows say they should be holding: cash credits minus cash debits.';

COMMENT ON COLUMN public.daily_ledger_shift_settlements.cash_handed_over IS
  'Cash actually counted and handed over. NULL when it was not recorded. Any gap against cash_expected is the finding this table exists to capture.';

COMMENT ON COLUMN public.daily_ledger_shift_settlements.notes IS
  'The settlement note. Lives here rather than being smeared across the operator''s transactions — the old close-employee-day route overwrote every row''s notes with "Marked as paid".';

COMMENT ON COLUMN public.daily_ledger_shift_settlements.status IS
  'active | reversed. A reversed settlement is kept with its actor and reason; it is never deleted.';

-- The other two ledger tables are already published. A new one is not added
-- automatically, and without this useRealtimeRefetch on the shift screen would
-- silently never fire.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'daily_ledger_shift_settlements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_ledger_shift_settlements;
  END IF;
END $$;
