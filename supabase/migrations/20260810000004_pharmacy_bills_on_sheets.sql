-- A pharmacy bill can hang off a charge sheet line, not just a patient charge
--
-- Charge sheets quote what the Charges tab bills, so a quote has to be able to
-- include the medicines too. Two things blocked that.
--
-- `patient_id` was NOT NULL, and half of all sheets are for an OPD walk-in who
-- has no patient row at all — that is the whole reason charge sheets exist. It
-- becomes nullable, and a sheet-owned bill simply has no patient until the sheet
-- is forwarded and a real charge is created.
--
-- `patient_charge_id` was the only owner a bill could have. It becomes one of
-- two, with a CHECK that exactly one is set: a bill belongs to a patient charge
-- or to a sheet line, never to both and never to neither. Both sides cascade, so
-- deleting either owner takes the bill and its medicines with it — which is
-- still the only delete path, exactly as before.
--
-- The "billed once" rule narrows accordingly. `external_bill_id` was globally
-- unique, which would have made quoting an invoice and then forwarding that
-- quote impossible: forwarding copies the bill onto the new charge, so the same
-- invoice legitimately appears twice — once as a quote, once as the real charge.
-- The uniqueness now applies only where the bill is actually money
-- (patient_charge_id IS NOT NULL), so an invoice can still be billed to a
-- patient only once, while any number of quotes may reference it.
--
-- Copy rather than move on forward, because a forwarded sheet is a historical
-- document: it must keep showing the medicines it quoted.

ALTER TABLE public.pharmacy_bills
  ALTER COLUMN patient_id        DROP NOT NULL,
  ALTER COLUMN patient_charge_id DROP NOT NULL;

ALTER TABLE public.pharmacy_bills
  ADD COLUMN IF NOT EXISTS charge_sheet_item_id uuid
    REFERENCES public.charge_sheet_items(id) ON DELETE CASCADE;

ALTER TABLE public.pharmacy_bills
  DROP CONSTRAINT IF EXISTS pharmacy_bills_one_owner_check;
ALTER TABLE public.pharmacy_bills
  ADD  CONSTRAINT pharmacy_bills_one_owner_check
       CHECK (num_nonnulls(patient_charge_id, charge_sheet_item_id) = 1);

-- One bill per sheet line, the same rule patient_charge_id already has. Partial,
-- because the column is null on every patient-owned bill.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pharmacy_bills_sheet_item
  ON public.pharmacy_bills (charge_sheet_item_id)
  WHERE charge_sheet_item_id IS NOT NULL;

-- Billed for real only once; a quote may reference any invoice freely.
DROP INDEX IF EXISTS public.idx_pharmacy_bills_external_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pharmacy_bills_external_billed
  ON public.pharmacy_bills (external_bill_id)
  WHERE patient_charge_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pharmacy_bills_sheet_lookup
  ON public.pharmacy_bills (charge_sheet_item_id)
  WHERE charge_sheet_item_id IS NOT NULL;

COMMENT ON COLUMN public.pharmacy_bills.charge_sheet_item_id IS 'The charge sheet line this bill is quoted as. Exactly one of this and patient_charge_id is set — see pharmacy_bills_one_owner_check.';
COMMENT ON COLUMN public.pharmacy_bills.patient_id IS 'Null for a bill quoted on an OPD walk-in sheet, who has no patient record. Set once the bill belongs to a real patient charge.';
COMMENT ON COLUMN public.pharmacy_bills.external_bill_id IS 'SmartPharma360''s own numeric bill id. Unique only among bills that are actually billed (patient_charge_id set) — quotes may reference the same invoice.';
