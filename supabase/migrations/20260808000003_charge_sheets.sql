-- Temporary charge sheets — an estimate that is not a bill
--
-- Reception needs to put a list of charges together before there is anything to
-- bill it to: a walk-in OPD patient who is not registered, or a registered
-- patient who wants to know the cost before agreeing to it. Today the only place
-- to put a charge is patient_charges, which immediately moves total_charges and
-- creates a due. So quotes were either not written down or written down as real
-- charges that someone had to remember to delete.
--
-- These tables are deliberately disconnected from the money. No link to
-- patient_billing, no installments, no ledger entry, nothing that clears a due —
-- a sheet is a piece of paper until someone forwards it. Forwarding
-- (app/api/charge-sheets/[id]/forward/route.ts) copies the lines into
-- patient_charges and stamps forwarded_billing_id, which is also the idempotency
-- key that stops a sheet being forwarded twice.
--
-- A sheet is about either a registered patient or a walk-in, never both and never
-- neither. That is what the two subject CHECKs enforce; without them a sheet with
-- no subject at all is representable, and the forward path would have nothing to
-- resolve.

CREATE TABLE IF NOT EXISTS public.charge_sheets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_no      varchar(20) NOT NULL,
  subject_type  varchar(10) NOT NULL,

  -- Registered-patient sheets. ON DELETE SET NULL rather than CASCADE: a
  -- forwarded sheet is the provenance of real charges and must outlive the
  -- patient row being purged.
  patient_id    uuid REFERENCES public.patients(id) ON DELETE SET NULL,

  -- Walk-in sheets. Free text by design — the whole point is that this person is
  -- not in the registry.
  opd_name      varchar(200),
  opd_phone     varchar(20),
  opd_age       smallint,
  opd_gender    varchar(20),

  status        varchar(20) NOT NULL DEFAULT 'draft',
  total_amount  numeric(12,2) NOT NULL DEFAULT 0,
  notes         text,

  forwarded_at          timestamptz,
  forwarded_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  forwarded_billing_id  uuid REFERENCES public.patient_billing(id) ON DELETE SET NULL,

  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT charge_sheets_subject_type_check CHECK (subject_type IN ('patient', 'opd')),
  CONSTRAINT charge_sheets_status_check       CHECK (status IN ('draft', 'forwarded', 'cancelled')),
  CONSTRAINT charge_sheets_total_non_negative CHECK (total_amount >= 0),

  -- A patient sheet names a patient; an OPD sheet names a person.
  CONSTRAINT charge_sheets_patient_subject_check
    CHECK (subject_type <> 'patient' OR patient_id IS NOT NULL),
  CONSTRAINT charge_sheets_opd_subject_check
    CHECK (subject_type <> 'opd' OR nullif(btrim(coalesce(opd_name, '')), '') IS NOT NULL),

  -- Only a patient sheet can ever have been forwarded, and a forwarded sheet
  -- must say where it went. This is what makes the double-forward check a
  -- constraint rather than a convention.
  CONSTRAINT charge_sheets_forwarded_check
    CHECK (status <> 'forwarded' OR (subject_type = 'patient' AND forwarded_billing_id IS NOT NULL))
);

COMMENT ON TABLE  public.charge_sheets IS 'Temporary charge sheets / estimates. Not billing: no dues, no ledger, no installments until forwarded into patient_charges.';
COMMENT ON COLUMN public.charge_sheets.subject_type IS 'patient = registered patient (patient_id set); opd = walk-in (opd_* set).';
COMMENT ON COLUMN public.charge_sheets.status IS 'draft until forwarded into patient billing, or cancelled. A forwarded sheet is immutable.';
COMMENT ON COLUMN public.charge_sheets.total_amount IS 'Denormalised sum of charge_sheet_items.line_total, maintained by the API on every item write.';
COMMENT ON COLUMN public.charge_sheets.forwarded_billing_id IS 'The patient_billing row the lines were copied into. Set exactly once — this is the idempotency key that refuses a second forward.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_charge_sheets_no ON public.charge_sheets (sheet_no);
CREATE INDEX IF NOT EXISTS idx_charge_sheets_status  ON public.charge_sheets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_charge_sheets_patient ON public.charge_sheets (patient_id) WHERE patient_id IS NOT NULL;

DROP TRIGGER IF EXISTS charge_sheets_set_updated_at ON public.charge_sheets;
CREATE TRIGGER charge_sheets_set_updated_at
  BEFORE UPDATE ON public.charge_sheets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── charge_sheet_items ───────────────────────────────────────────────────────
-- Like patient_charges, `description` is the snapshotted name so a catalogue
-- rename never rewrites a quote that has been handed to someone. line_total is
-- generated rather than maintained, because unlike patient_charges nothing here
-- predates the column and there is no legacy row to grandfather in — this is what
-- BUGS.md #26 asks for on doctor_visit_settlements.

CREATE TABLE IF NOT EXISTS public.charge_sheet_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_sheet_id uuid NOT NULL REFERENCES public.charge_sheets(id) ON DELETE CASCADE,
  charge_item_id  uuid REFERENCES public.charge_items(id) ON DELETE SET NULL,
  description     varchar(200) NOT NULL,
  unit_price      numeric(12,2) NOT NULL DEFAULT 0,
  qty             integer NOT NULL DEFAULT 1,
  service_date    date,
  line_total      numeric(12,2) GENERATED ALWAYS AS (unit_price * qty) STORED,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT charge_sheet_items_desc_not_blank   CHECK (btrim(description) <> ''),
  CONSTRAINT charge_sheet_items_price_non_negative CHECK (unit_price >= 0),
  CONSTRAINT charge_sheet_items_qty_positive     CHECK (qty >= 1)
);

COMMENT ON TABLE  public.charge_sheet_items IS 'Line items on a temporary charge sheet. Copied into patient_charges on forward, never referenced by billing directly.';
COMMENT ON COLUMN public.charge_sheet_items.description IS 'Snapshotted display name, so a catalogue rename never rewrites an issued quote.';
COMMENT ON COLUMN public.charge_sheet_items.line_total IS 'Generated: unit_price * qty. Never write this column.';

CREATE INDEX IF NOT EXISTS idx_charge_sheet_items_sheet
  ON public.charge_sheet_items (charge_sheet_id);

DROP TRIGGER IF EXISTS charge_sheet_items_set_updated_at ON public.charge_sheet_items;
CREATE TRIGGER charge_sheet_items_set_updated_at
  BEFORE UPDATE ON public.charge_sheet_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── Numbering ────────────────────────────────────────────────────────────────
-- Same shape as next_patient_id() / next_lab_order_no(): the counter is bumped
-- inside a single INSERT ... ON CONFLICT DO UPDATE so concurrent writers take a
-- row lock instead of both reading the same max().
--
-- One continuous series rather than the per-year reset the patient IDs use — a
-- sheet is short-lived working paper, and CS-000001 is easier to read back over a
-- phone than CS-26-0001.
--
-- Do not replace this with SELECT max(...) — that races, which is the whole
-- point.

CREATE TABLE IF NOT EXISTS public.charge_sheet_counters (
  scope    text PRIMARY KEY,
  last_no  integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.charge_sheet_counters IS 'Single-row sequence backing next_charge_sheet_no(). One row, scope = ''global''.';

CREATE OR REPLACE FUNCTION public.next_charge_sheet_no()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_next integer;
BEGIN
  INSERT INTO public.charge_sheet_counters AS c (scope, last_no)
       VALUES ('global', 1)
  ON CONFLICT (scope)
  DO UPDATE SET last_no = c.last_no + 1
    RETURNING c.last_no INTO v_next;

  RETURN 'CS-' || lpad(v_next::text, 6, '0');
END;
$$;

COMMENT ON FUNCTION public.next_charge_sheet_no() IS 'Returns the next charge sheet number, e.g. CS-000001. Concurrency-safe. Consumes a number.';
