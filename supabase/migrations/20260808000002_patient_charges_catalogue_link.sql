-- Patient charges — link to the catalogue, and group the rows a date range produces
--
-- Four columns, each earning its place:
--
-- `charge_item_id` points at the catalogue entry the charge came from. Nullable
-- on purpose: reception must still be able to bill something that is not in the
-- price list, and the four rows already in the table predate the catalogue
-- entirely. `charge_type` stays and stays NOT NULL — it is the snapshotted
-- display name, so renaming "ICU Charges" to "Intensive Care" tomorrow does not
-- silently rewrite a bill printed last week.
--
-- `billing_mode` is likewise a snapshot. If a service is switched from one_time
-- to per_day, rows already written must keep describing how they were actually
-- billed.
--
-- `charge_group_id` is the one that makes per-day charges usable. A four-night
-- stay is written as four rows so each day can be repriced or removed on its own,
-- but the four are one act of data entry: the UI groups on this to show them
-- collapsed under a single subtotal (the "segregated" view), and DELETE accepts
-- it so the whole block can be dropped without four round trips.
--
-- `source_sheet_id` records that a row arrived from a forwarded charge sheet
-- (20260808000003). No FK: charge_sheets is created in the next migration, and
-- deleting a sheet must not cascade into a bill that has already been paid.
--
-- The two CHECKs are the schema half of BUGS.md #18 (charges are not validated at
-- all). The API half is lib/billing/validate.ts.

ALTER TABLE public.patient_charges
  ADD COLUMN IF NOT EXISTS charge_item_id   uuid REFERENCES public.charge_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_mode     varchar(20),
  ADD COLUMN IF NOT EXISTS charge_group_id  uuid,
  ADD COLUMN IF NOT EXISTS source_sheet_id  uuid;

COMMENT ON COLUMN public.patient_charges.charge_item_id  IS 'Catalogue entry this charge came from. Null for ad-hoc charges and for rows predating the catalogue.';
COMMENT ON COLUMN public.patient_charges.charge_type     IS 'Snapshotted display name. Kept even when charge_item_id is set, so a catalogue rename never rewrites history.';
COMMENT ON COLUMN public.patient_charges.billing_mode    IS 'Snapshot of charge_items.billing_mode at entry time. One of lib/billing/constants.ts CHARGE_BILLING_MODES.';
COMMENT ON COLUMN public.patient_charges.charge_group_id IS 'Shared by every row generated from one date-range entry. Drives the segregated view and group delete.';
COMMENT ON COLUMN public.patient_charges.source_sheet_id IS 'The charge_sheets row this was forwarded from, if any. Deliberately not a FK — deleting a sheet must not touch a bill.';
COMMENT ON COLUMN public.patient_charges.amount          IS 'Unit rate. The line total is amount * qty — see lib/recalculate-billing.ts.';
COMMENT ON COLUMN public.patient_charges.qty             IS 'Units at this rate. For a per_day row this is the units on that one day, not the number of days.';

-- Backfill. The catalogue seeds the exact names that were hardcoded in the old
-- dropdown, so a case-insensitive name match resolves every row that came from
-- it; anything else is genuinely ad-hoc and correctly stays null.
UPDATE public.patient_charges pc
   SET charge_item_id = ci.id
  FROM public.charge_items ci
 WHERE pc.charge_item_id IS NULL
   AND lower(btrim(pc.charge_type)) = lower(ci.name);

-- Every existing row was entered one at a time against a single date, which is
-- exactly what one_time means. None of them are part of a range, so
-- charge_group_id stays null and the segregated view falls back to grouping them
-- by catalogue item.
UPDATE public.patient_charges
   SET billing_mode = 'one_time'
 WHERE billing_mode IS NULL;

-- Constrained only after the backfill, or the ALTER would fail on existing rows.
ALTER TABLE public.patient_charges
  DROP CONSTRAINT IF EXISTS patient_charges_billing_mode_check;
ALTER TABLE public.patient_charges
  ADD  CONSTRAINT patient_charges_billing_mode_check
       CHECK (billing_mode IS NULL OR billing_mode IN ('one_time', 'per_day'));

ALTER TABLE public.patient_charges
  DROP CONSTRAINT IF EXISTS patient_charges_amount_non_negative;
ALTER TABLE public.patient_charges
  ADD  CONSTRAINT patient_charges_amount_non_negative CHECK (amount >= 0);

ALTER TABLE public.patient_charges
  DROP CONSTRAINT IF EXISTS patient_charges_qty_positive;
ALTER TABLE public.patient_charges
  ADD  CONSTRAINT patient_charges_qty_positive CHECK (qty >= 1);

CREATE INDEX IF NOT EXISTS idx_patient_charges_item
  ON public.patient_charges (charge_item_id);

-- Partial: only the rows a date range produced carry a group.
CREATE INDEX IF NOT EXISTS idx_patient_charges_group
  ON public.patient_charges (charge_group_id) WHERE charge_group_id IS NOT NULL;
