-- A third billing mode: per_hour
--
-- Oxygen is the case that forced this. It was seeded as `per_day`, so a patient
-- on oxygen for six hours was billed a whole day of it, and the entry form only
-- offered a date range. What the hospital actually charges is an hourly rate
-- against the hours used on each day.
--
-- No new columns. The hours are the `qty` and the hourly rate is the `amount`,
-- so `amount * qty` — which is already what lib/recalculate-billing.ts and every
-- total in the app computes — stays correct without touching any of them. qty is
-- an integer, which matches how this is entered: the desk types whole hours
-- rather than start and end times for the app to subtract.
--
-- Entry mirrors per_day: a from/to date range, expanded to one row per day, each
-- day carrying its own hours and removable before saving. That is why per_hour
-- rows also share a charge_group_id — the block deletes in one go, exactly like
-- a per-day block.
--
-- Existing catalogue rows are left alone. Switching Oxygen over is a pricing
-- decision for the hospital to make in the catalogue UI, not something a
-- migration should do to live data behind their back.

ALTER TABLE public.charge_items
  DROP CONSTRAINT IF EXISTS charge_items_billing_mode_check;
ALTER TABLE public.charge_items
  ADD  CONSTRAINT charge_items_billing_mode_check
       CHECK (billing_mode IN ('one_time', 'per_day', 'per_hour'));

ALTER TABLE public.patient_charges
  DROP CONSTRAINT IF EXISTS patient_charges_billing_mode_check;
ALTER TABLE public.patient_charges
  ADD  CONSTRAINT patient_charges_billing_mode_check
       CHECK (billing_mode IS NULL OR billing_mode IN ('one_time', 'per_day', 'per_hour'));

COMMENT ON COLUMN public.patient_charges.qty IS 'Units at this rate. For a per_day row this is the units on that one day, not the number of days. For a per_hour row it is the hours used on that day.';
