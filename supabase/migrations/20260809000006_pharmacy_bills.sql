-- Pharmacy bills — medicine bills fetched once from the third-party SmartPharma360
-- system and stored here, never re-fetched on every view.
--
-- SmartPharma360 is somebody else's website, not ours, and it can rate-limit or
-- ban a client that hits it too often. So the shape here is "fetch once, store
-- forever": `pharmacy_bills`/`pharmacy_bill_items` are a local copy of one
-- invoice, and after the initial POST nothing in this app ever calls
-- SmartPharma360 again for that bill. Getting it wrong is not "edit" — it's
-- delete the row and fetch the correct one, which is why there is no update path
-- for anything except `entry_date` (see below).
--
-- `patient_charge_id` makes `patient_charges` the parent, not the other way
-- round: a pharmacy bill is represented on the bill as exactly one row (id +
-- amount, per the hospital's own request), and that row already goes through
-- every existing charges code path — totals, PDF, permissions. Making the
-- FK point this direction means the existing charge DELETE endpoint already
-- does the right thing here for free: delete the charge, and ON DELETE CASCADE
-- takes the bill and its items with it.
--
-- `entry_date` is deliberately not immutable. SmartPharma360's own entry date
-- can be wrong (staff there mis-key it same as anywhere), and the hospital asked
-- for it to be correctable on our side without a re-fetch. Everything else
-- about a bill — the medicines, the amount, the GST — is exactly what
-- SmartPharma360 said it was and stays that way until the row is deleted.

CREATE TABLE IF NOT EXISTS public.pharmacy_bills (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id         uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  patient_charge_id  uuid NOT NULL REFERENCES public.patient_charges(id) ON DELETE CASCADE,

  external_bill_id   bigint NOT NULL,       -- SmartPharma360's numeric id, e.g. 34069611
  entry_number       varchar(50),           -- e.g. 'SI-KK-26-001558'
  entry_date         date NOT NULL,         -- editable on our side; everything else is not
  invoice_number     varchar(50),
  bill_patient_name  varchar(200),          -- name on the SmartPharma360 bill, for cross-checking
  doctor_name        varchar(200),
  invoice_url        text,

  net_amount         numeric(12,2) NOT NULL,  -- becomes the linked charge's amount
  gross_total        numeric(12,2),
  total_gst_value    numeric(12,2),
  total_disc         numeric(12,2),
  rounding           numeric(12,2),

  raw_response       jsonb,                 -- the full head+items payload, so a later field
                                             -- doesn't require a re-fetch (which we're avoiding)

  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT pharmacy_bills_net_amount_non_negative CHECK (net_amount >= 0)
);

COMMENT ON TABLE  public.pharmacy_bills IS 'One row per SmartPharma360 invoice attached to a patient, fetched once and stored. patient_charge_id is the single charges-tab row it produces.';
COMMENT ON COLUMN public.pharmacy_bills.patient_charge_id IS 'The patient_charges row this bill is billed as. Deleting that row cascades here — this is the whole delete path, there is no separate one.';
COMMENT ON COLUMN public.pharmacy_bills.external_bill_id IS 'SmartPharma360''s own numeric bill id. Globally unique: the same real invoice must never be attached twice.';
COMMENT ON COLUMN public.pharmacy_bills.entry_date IS 'The only field on a stored bill that can be corrected in place, via PATCH. Everything else is fetched-once and immutable — wrong data means delete and re-add.';
COMMENT ON COLUMN public.pharmacy_bills.raw_response IS 'Full head+items payload from retail_sale_details, kept so a field we did not think to snapshot can still be recovered without calling SmartPharma360 again.';

-- The same real-world invoice must never be attached twice, in this patient's
-- bill or anyone else's — SmartPharma360's id already uniquely identifies it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pharmacy_bills_external_id ON public.pharmacy_bills (external_bill_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pharmacy_bills_charge      ON public.pharmacy_bills (patient_charge_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_bills_patient            ON public.pharmacy_bills (patient_id);

DROP TRIGGER IF EXISTS pharmacy_bills_set_updated_at ON public.pharmacy_bills;
CREATE TRIGGER pharmacy_bills_set_updated_at
  BEFORE UPDATE ON public.pharmacy_bills
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── pharmacy_bill_items ──────────────────────────────────────────────────────
-- The medicine lines on one bill. Exactly the fields the hospital asked to see:
-- name, unit, batch, qty, rate (MRP), net amount, and GST. View-only in the
-- UI — there is no edit path for a row here at all, matching the head above.

CREATE TABLE IF NOT EXISTS public.pharmacy_bill_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_bill_id  uuid NOT NULL REFERENCES public.pharmacy_bills(id) ON DELETE CASCADE,

  product_name      varchar(200) NOT NULL,
  batch_number      varchar(50),
  packing           varchar(40),           -- the 'unit', e.g. '1S'
  sale_quantity     numeric(10,2) NOT NULL DEFAULT 1,
  mrp               numeric(12,2),         -- the 'rate'
  gst_percent       numeric(5,2),
  gst_value         numeric(12,2),
  net_amount        numeric(12,2) NOT NULL,

  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pharmacy_bill_items IS 'Medicine lines on a pharmacy_bills row, as returned by SmartPharma360. View-only — never edited, only deleted along with the parent bill.';

CREATE INDEX IF NOT EXISTS idx_pharmacy_bill_items_bill ON public.pharmacy_bill_items (pharmacy_bill_id);


-- ── pharmacy_api_sessions ────────────────────────────────────────────────────
-- Cached SmartPharma360 login. Single row, same singleton shape as
-- charge_sheet_counters. Logging in on every request is exactly the kind of
-- unnecessary call to someone else's site this whole feature exists to avoid —
-- the token is fetched once and reused until it is actually about to expire.

CREATE TABLE IF NOT EXISTS public.pharmacy_api_sessions (
  scope         text PRIMARY KEY,
  access_token  text,
  expires_at    timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pharmacy_api_sessions IS 'Cached SmartPharma360 login token. One row, scope = ''global''. Read/refreshed by lib/pharmacy/client.ts — never re-logged-in while the cached token still has life left.';
