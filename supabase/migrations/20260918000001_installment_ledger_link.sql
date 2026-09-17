-- Link a payment to the ledger credit it created
--
-- The Payments tab hides Edit/Delete once a payment is "settled", which so far
-- only checked whether the *day* was closed (daily_ledger_closures). But an
-- admin can mark an individual transaction verified in the Daily Ledger long
-- before the day itself is closed — and that is what staff actually call
-- "settled" day to day. There was no way to ask that question per payment: the
-- credit an installment creates was never linked back to it, only matched by
-- eye (same patient, date, amount).
--
-- ledger_transaction_id is that missing link, set going forward at the point
-- the installment route already creates the credit.

ALTER TABLE public.patient_billing_installments
  ADD COLUMN IF NOT EXISTS ledger_transaction_id uuid REFERENCES public.daily_ledger_transactions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.patient_billing_installments.ledger_transaction_id IS
  'The ledger credit this payment created (create_ledger_entry), if any. Lets the UI know a payment has been verified/settled without guessing by date+amount.';

-- Backfill for rows written before this link existed. There is no better key
-- than (patient, date, amount, source=patient, credit) for these, so same-day
-- same-amount payments are paired to transactions in the order both were
-- created — the only ordering that was ever meaningful between them, and it
-- makes an ambiguous pair indistinguishable in outcome anyway (both rows carry
-- the same patient, date and amount, so either pairing shows the same facts).
WITH installments_ranked AS (
  SELECT
    pbi.id,
    pb.patient_id,
    pbi.payment_date,
    pbi.amount,
    row_number() OVER (
      PARTITION BY pb.patient_id, pbi.payment_date, pbi.amount
      ORDER BY pbi.created_at, pbi.id
    ) AS rn
  FROM public.patient_billing_installments pbi
  JOIN public.patient_billing pb ON pb.id = pbi.patient_billing_id
  WHERE pbi.ledger_transaction_id IS NULL
),
transactions_ranked AS (
  SELECT
    dlt.id,
    dlt.patient_id,
    dlt.transaction_date,
    dlt.amount,
    row_number() OVER (
      PARTITION BY dlt.patient_id, dlt.transaction_date, dlt.amount
      ORDER BY dlt.created_at, dlt.id
    ) AS rn
  FROM public.daily_ledger_transactions dlt
  WHERE dlt.source = 'patient' AND dlt.transaction_type = 'credit'
)
UPDATE public.patient_billing_installments pbi
SET ledger_transaction_id = tr.id
FROM installments_ranked ir
JOIN transactions_ranked tr
  ON tr.patient_id = ir.patient_id
 AND tr.transaction_date = ir.payment_date
 AND tr.amount = ir.amount
 AND tr.rn = ir.rn
WHERE pbi.id = ir.id;
