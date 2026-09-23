-- Petty cash, advances from the desk, and who set a price (PRD v2, CR-02 · CR-03 · CR-04)
--
-- The client's rule for petty cash, in their words: *"All receptionist expenses
-- are paid from petty cash that the admin gives to receptionists. Petty cash is
-- a single shared amount used by all receptionists across shifts. Add a separate
-- petty cash log showing both credits (admin giving cash) and debits
-- (receptionist expenses), like a bank statement… This log has no status. It is
-- only a log, visible to both admin and receptionists. For each credit, record
-- which receptionist it was given to."*
--
-- So: one pool, one statement, no status and no closing. Patient money never
-- enters it (Q-08), and the desk's spending leaves the ledger entirely (Q-07 =
-- A) — the ledger is for money that belongs to the hospital's books.
--
-- Access control lives in the API. Like every other table here, RLS is off.

-- 1. The petty cash statement ------------------------------------------------

CREATE TABLE IF NOT EXISTS public.petty_cash_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date   date NOT NULL DEFAULT CURRENT_DATE,
  direction    varchar(10) NOT NULL,
  -- topup = admin hands cash to the desk · expense = the desk spends it
  -- advance = an advance the desk paid an employee (CR-03) · opening = go-live
  kind         varchar(20) NOT NULL,
  amount       numeric(12,2) NOT NULL,
  payment_mode varchar(20) NOT NULL DEFAULT 'cash',
  reason       text NOT NULL,
  -- Only on a top-up, and only so everyone knows who took the cash (Q-11).
  -- It names the receptionist's login, the same list "added by" comes from.
  given_to     uuid REFERENCES public.users(id),
  advance_id   bigint REFERENCES public.advances(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL REFERENCES public.users(id),
  updated_at   timestamptz,
  updated_by   uuid REFERENCES public.users(id),

  CONSTRAINT pce_direction_check CHECK (direction IN ('in', 'out')),
  CONSTRAINT pce_kind_check CHECK (kind IN ('opening', 'topup', 'expense', 'advance')),
  CONSTRAINT pce_amount_check CHECK (amount > 0),
  CONSTRAINT pce_reason_check CHECK (length(btrim(reason)) > 0),
  -- Money in is only ever the admin's: an opening balance or a top-up (Q-13).
  CONSTRAINT pce_direction_kind_check CHECK (
    (direction = 'in'  AND kind IN ('opening', 'topup')) OR
    (direction = 'out' AND kind IN ('expense', 'advance'))),
  -- An advance debit always names the advance it paid, and nothing else does.
  CONSTRAINT pce_advance_link_check CHECK (
    (kind = 'advance') = (advance_id IS NOT NULL))
);

COMMENT ON TABLE public.petty_cash_entries IS
  'The desk''s cash float, as a statement (PRD v2 CR-02). One shared pool across receptionists and shifts, with no status and no closing: the balance is top-ups minus debits, and the admin checks it against the cash the desk holds.';

COMMENT ON COLUMN public.petty_cash_entries.given_to IS
  'Which receptionist the admin handed the cash to. Information only — it changes nothing (Q-11).';

CREATE INDEX IF NOT EXISTS idx_petty_cash_entry_date
  ON public.petty_cash_entries (entry_date DESC, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_petty_cash_one_opening
  ON public.petty_cash_entries (kind)
  WHERE kind = 'opening';

CREATE UNIQUE INDEX IF NOT EXISTS idx_petty_cash_one_per_advance
  ON public.petty_cash_entries (advance_id)
  WHERE advance_id IS NOT NULL;

-- 2. What changed about an entry, and when (Q-70) ----------------------------
--
-- The client asked to keep an edit history, because the balance is checked
-- against real cash: when it disagrees, the question is always "what changed?".

-- No foreign key: the history has to outlive the entry, since "someone deleted
-- a ₹2,000 debit" is exactly the change the admin will come looking for.
CREATE TABLE IF NOT EXISTS public.petty_cash_entry_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    uuid NOT NULL,
  action      varchar(10) NOT NULL,
  before      jsonb,
  after       jsonb,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  changed_by  uuid NOT NULL REFERENCES public.users(id),

  CONSTRAINT pceh_action_check CHECK (action IN ('create', 'update', 'delete'))
);

CREATE INDEX IF NOT EXISTS idx_petty_cash_history_entry
  ON public.petty_cash_entry_history (entry_id, changed_at DESC);

-- 3. An advance knows its petty cash debit (CR-03) ---------------------------

ALTER TABLE public.advances
  ADD COLUMN IF NOT EXISTS petty_cash_entry_id uuid
    REFERENCES public.petty_cash_entries(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.advances.petty_cash_entry_id IS
  'The petty cash debit this advance was paid from, when the desk paid it (CR-03). NULL when an admin paid it outside petty cash, and on advances recorded before 20260924000002.';

-- `given_by` was free text that nobody filled in reliably. The user who
-- recorded the advance is `created_by`, and that is what the screens show now;
-- the old text stays for history (Q-15 = A).
COMMENT ON COLUMN public.advances.given_by IS
  'Legacy free text. The person who gave the advance is created_by (PRD v2 Q-15 = A).';

-- 4. Who set a price, and which ledger row paid it (CR-04, CR-13) ------------
--
-- Reception may price a doctor's fee and set the referral commission, but not
-- overwrite one an admin has set (Q-20 = A). That needs the owner of the
-- *amount*, which is not the same as who created the row.

ALTER TABLE public.doctor_visit_settlements
  ADD COLUMN IF NOT EXISTS amount_set_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS ledger_transaction_id uuid
    REFERENCES public.daily_ledger_transactions(id) ON DELETE SET NULL;

ALTER TABLE public.patient_billing
  ADD COLUMN IF NOT EXISTS referral_commission_set_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS referral_ledger_transaction_id uuid
    REFERENCES public.daily_ledger_transactions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.doctor_visit_settlements.amount_set_by IS
  'Who last set this fee. Reception may change its own and an unset one, never an amount an admin set (PRD v2 Q-20 = A).';
COMMENT ON COLUMN public.doctor_visit_settlements.ledger_transaction_id IS
  'The ledger OUT this payout wrote. Un-paying removes that row, so the two never disagree (CR-13).';

CREATE INDEX IF NOT EXISTS idx_dvs_ledger_transaction
  ON public.doctor_visit_settlements (ledger_transaction_id)
  WHERE ledger_transaction_id IS NOT NULL;
