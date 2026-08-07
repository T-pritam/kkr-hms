-- Charge sheet lines gain what patient charges already had
--
-- A charge sheet is the same act of billing as the Charges tab, just before
-- there is an account to bill it to — so the two have to offer the same things.
-- Two were missing.
--
-- `billing_mode`: the sheet form read the catalogue entry and threw the mode
-- away, so Room, Oxygen and Nebulizer got no date range on a sheet even though
-- they get one on a patient. Snapshotted per line for the same reason
-- patient_charges snapshots it — a service switched from per_day to per_hour
-- later must not rewrite how an issued quote described itself. It is also what
-- the forward path now reads, instead of stamping every copied line 'one_time'.
--
-- `charge_name`: the sheet had a single "Description" box doing duty as both the
-- name and the note about it, so a line either lost its explanation or lost its
-- name. Patient charges keeps `charge_type` and `description` apart; this brings
-- the sheet in line. The name is the required half — a line must say what it is
-- — and the description becomes optional, which is why the not-blank CHECK moves
-- from one column to the other.

ALTER TABLE public.charge_sheet_items
  ADD COLUMN IF NOT EXISTS billing_mode varchar(20),
  ADD COLUMN IF NOT EXISTS charge_name  varchar(200);

-- Every existing line's description *is* its name — that is all the column ever
-- held. Copy it across before the NOT NULL below can see a gap.
UPDATE public.charge_sheet_items
   SET charge_name = description
 WHERE charge_name IS NULL;

-- Existing rows all pre-date ranges on sheets, and were entered one at a time
-- against a single date, which is exactly what one_time means.
UPDATE public.charge_sheet_items
   SET billing_mode = 'one_time'
 WHERE billing_mode IS NULL;

ALTER TABLE public.charge_sheet_items
  ALTER COLUMN charge_name SET NOT NULL;

-- The name is now the required half; the description is free to be empty.
ALTER TABLE public.charge_sheet_items
  ALTER COLUMN description DROP NOT NULL;

ALTER TABLE public.charge_sheet_items
  DROP CONSTRAINT IF EXISTS charge_sheet_items_desc_not_blank;

ALTER TABLE public.charge_sheet_items
  DROP CONSTRAINT IF EXISTS charge_sheet_items_name_not_blank;
ALTER TABLE public.charge_sheet_items
  ADD  CONSTRAINT charge_sheet_items_name_not_blank CHECK (btrim(charge_name) <> '');

ALTER TABLE public.charge_sheet_items
  DROP CONSTRAINT IF EXISTS charge_sheet_items_billing_mode_check;
ALTER TABLE public.charge_sheet_items
  ADD  CONSTRAINT charge_sheet_items_billing_mode_check
       CHECK (billing_mode IS NULL OR billing_mode IN ('one_time', 'per_day', 'per_hour'));

COMMENT ON COLUMN public.charge_sheet_items.charge_name IS 'Snapshotted display name, so a catalogue rename never rewrites an issued quote. The required half of the line — description is the optional note beside it.';
COMMENT ON COLUMN public.charge_sheet_items.billing_mode IS 'Snapshot of how this line was billed. One of lib/billing/constants.ts CHARGE_BILLING_MODES. Read by the forward path so a per-day quote becomes per-day charges.';
COMMENT ON COLUMN public.charge_sheet_items.description IS 'Optional note beside the name. Was the name itself before 20260810000002 split the two.';
