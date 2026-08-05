-- Daily ledger — closure versioning, so a day can be reopened and closed again
--
-- Closing the day is a financial period lock. Until now the lock was not a
-- record at all: POST /api/ledger/close-day flipped every transaction on the
-- date to status = 'day_closed' and inserted a closure row as a second,
-- unrelated statement, and every guard in the codebase then asked
-- daily_ledger_transactions — not this table — whether the day was closed.
--
-- Two consequences, both visible in production. `daily_ledger_closures` holds
-- zero rows while ten transactions carry status = 'day_closed', because
-- close-employee-day sets that status and never writes a closure. And because
-- the guard treats any 'day_closed' row on a date as "the whole day is shut",
-- one operator settling their shift silently froze the date for everyone else,
-- permanently — there has never been a way to reopen anything.
--
-- This migration makes this table the single source of truth for "is this date
-- closed?", and makes that question answerable while still allowing an admin to
-- correct a mistake.
--
-- Versioning is `status` plus a partial unique index, not a separate events
-- table and not a max(version) convention:
--
--   * A separate events table would turn the one question every write path asks
--     into a join, and give the answer two homes.
--   * `UNIQUE (closure_date, version)` cannot express "only the highest version
--     counts" — two rows could each believe they are current and the database
--     would accept both.
--   * A partial unique index on (closure_date) WHERE status = 'active' makes two
--     active closures for one date *impossible*, and reduces the question to a
--     single index-only lookup.
--
-- `version` is kept, but purely as a human-facing counter — "Close #2" — never
-- as the thing that decides which row is current.
--
-- Reopening supersedes rather than deletes. The v1 row survives with the actor,
-- the timestamp and the reason that reopened it, and the replacement close
-- points back at it through supersedes_id. An audit trail you can erase is not
-- an audit trail.
--
-- The per-mode credit columns close a real hole. The old close routine's
-- payment_mode switch handled cash, upi, bank_transfer and cheque — but not
-- card. Card credits were therefore counted into total_credits with no matching
-- line in the breakdown, so the parts stopped summing to the whole and nothing
-- noticed. dlc_credit_modes_reconcile turns that invariant into a constraint so
-- it cannot silently break a second time.
--
-- closing_cash_balance exists because closing_balance is not a cash figure: it
-- mixes UPI, card and bank transfers into a number named like a drawer count.
-- The old column is kept as-is for compatibility, but the drawer is this one.
--
-- Additive and safe to deploy on its own: nothing reads the new columns yet and
-- no constraint rejects anything the current code writes. The table is empty in
-- production, so dlc_credit_modes_reconcile has nothing to validate against.
--
-- Access control lives in the API. Like every other table in this project,
-- RLS is off.

ALTER TABLE public.daily_ledger_closures
  ADD COLUMN IF NOT EXISTS status           varchar(12) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS version          integer     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supersedes_id    uuid REFERENCES public.daily_ledger_closures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reopened_at      timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reopen_reason    text,
  ADD COLUMN IF NOT EXISTS unverified_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_credits_card          numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_credits_bank_transfer numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_credits_cheque        numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_debits_cash           numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closing_cash_balance        numeric(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dlc_status_check') THEN
    ALTER TABLE public.daily_ledger_closures
      ADD CONSTRAINT dlc_status_check CHECK (status IN ('active', 'superseded'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dlc_version_check') THEN
    ALTER TABLE public.daily_ledger_closures
      ADD CONSTRAINT dlc_version_check CHECK (version >= 1);
  END IF;

  -- A superseded row must say who reopened it, when, and why. An active row must
  -- carry none of that. The mandatory reason is enforced here, not only in the API.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dlc_reopen_shape_check') THEN
    ALTER TABLE public.daily_ledger_closures
      ADD CONSTRAINT dlc_reopen_shape_check CHECK (
        (status = 'active'
           AND reopened_at IS NULL
           AND reopened_by IS NULL
           AND reopen_reason IS NULL)
        OR
        (status = 'superseded'
           AND reopened_at IS NOT NULL
           AND btrim(coalesce(reopen_reason, '')) <> '')
      );
  END IF;

  -- The parts must sum to the whole. This is exactly the invariant the missing
  -- `card` branch broke.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dlc_credit_modes_reconcile') THEN
    ALTER TABLE public.daily_ledger_closures
      ADD CONSTRAINT dlc_credit_modes_reconcile CHECK (
        total_credits_cash + total_credits_upi + total_credits_card
          + total_credits_bank_transfer + total_credits_cheque = total_credits
      );
  END IF;
END $$;

-- The whole point: one active closure per date, enforced rather than asserted.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dlc_active_date
  ON public.daily_ledger_closures (closure_date) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_dlc_date_version
  ON public.daily_ledger_closures (closure_date, version DESC);

COMMENT ON COLUMN public.daily_ledger_closures.status IS
  'active | superseded. Exactly one active row per closure_date, enforced by idx_dlc_active_date. A superseded row is a closure that was reopened; it is kept as history and never deleted.';

COMMENT ON COLUMN public.daily_ledger_closures.version IS
  'Human-facing counter — "Close #2". Which row is current is decided by status, never by this.';

COMMENT ON COLUMN public.daily_ledger_closures.supersedes_id IS
  'The closure this one replaced after a reopen. NULL on a first close.';

COMMENT ON COLUMN public.daily_ledger_closures.reopen_reason IS
  'Why an admin reopened this closure. Mandatory on a superseded row (dlc_reopen_shape_check) — a reopen without a stated reason is not auditable.';

COMMENT ON COLUMN public.daily_ledger_closures.unverified_count IS
  'Entries still pending verification at the moment of close. Recorded, never blocking: closing is a cash reconciliation, and waiting on a verifier who has gone home would strand the day.';

COMMENT ON COLUMN public.daily_ledger_closures.total_credits_other IS
  'Derived, kept for compatibility with existing UI: total_credits_bank_transfer + total_credits_cheque. Prefer the explicit per-mode columns.';

COMMENT ON COLUMN public.daily_ledger_closures.closing_balance IS
  'Opening balance plus the day''s net across every payment mode. NOT a cash figure — it includes UPI, card and bank transfers. For the drawer, use closing_cash_balance.';

COMMENT ON COLUMN public.daily_ledger_closures.closing_cash_balance IS
  'Physical cash carried forward: previous closing_cash_balance + cash credits - cash debits. This is the number that should match a drawer count.';
