-- Charge catalogue — the price list that patient charges are placed from
--
-- There was no charge master. The list of chargeable things was a hardcoded
-- array of ten strings inside a React component
-- (components/patients/charges-tab.tsx), `patient_charges.charge_type` was free
-- varchar with no FK and no CHECK, and the price was typed from memory on every
-- entry. Adding a service meant editing and redeploying the app; two people
-- billing the same thing on the same day could and did charge different amounts.
--
-- The second thing missing was any notion of *how* a charge accrues. Registration
-- is billed once. Room rent, oxygen and a nebuliser are billed per day, so a
-- twelve-day stay meant twelve identical manual entries and one forgotten day was
-- invisible. `billing_mode` is what drives the entry form: `one_time` asks for a
-- date, `per_day` asks for a range and writes one row per day. It is not
-- cosmetic — see app/api/patients/[id]/charges/route.ts.
--
-- Shaped after public.medicines and public.lab_tests, the two master tables this
-- project already has: soft `is_active` rather than deletion (a retired service
-- still has history pointing at it), case-insensitive unique name, and the shared
-- set_updated_at trigger.

CREATE TABLE IF NOT EXISTS public.charge_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           varchar(50),                    -- optional short code, e.g. 'ICU-BED'
  name           varchar(200) NOT NULL,
  category       varchar(30) NOT NULL,           -- lib/billing/constants.ts CHARGE_CATEGORIES
  billing_mode   varchar(20) NOT NULL,           -- lib/billing/constants.ts CHARGE_BILLING_MODES
  default_price  numeric(12,2) NOT NULL DEFAULT 0,
  unit_label     varchar(40),                    -- 'per day', 'per session' — display only
  is_active      boolean NOT NULL DEFAULT true,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT charge_items_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT charge_items_price_non_negative CHECK (default_price >= 0),

  -- Every list here is mirrored by a constant in lib/billing/constants.ts.
  -- Adding an option means changing both — the database is the thing that
  -- actually stops bad data.
  CONSTRAINT charge_items_category_check CHECK (
    category IN ('room', 'medical', 'diagnostic', 'procedure', 'registration', 'pharmacy', 'other')
  ),
  CONSTRAINT charge_items_billing_mode_check CHECK (
    billing_mode IN ('one_time', 'per_day')
  )
);

COMMENT ON TABLE  public.charge_items IS 'Charge master / price list. Patient charges reference this; the name and rate are snapshotted onto the charge row so history survives a catalogue edit.';
COMMENT ON COLUMN public.charge_items.category IS 'One of lib/billing/constants.ts CHARGE_CATEGORIES. Mirrored by charge_items_category_check.';
COMMENT ON COLUMN public.charge_items.billing_mode IS 'One of lib/billing/constants.ts CHARGE_BILLING_MODES. Drives the entry form: one_time writes a single row, per_day expands a date range into one row per day.';
COMMENT ON COLUMN public.charge_items.default_price IS 'Prefilled into the charge form and always editable there — the catalogue is a default, not a ceiling.';
COMMENT ON COLUMN public.charge_items.is_active IS 'Retire a service by clearing this. Never delete one that has charges pointing at it.';

-- "ICU Charges" and "ICU charges" are one service.
CREATE UNIQUE INDEX IF NOT EXISTS idx_charge_items_name_lower
  ON public.charge_items (lower(name));

-- Partial: code is optional, and several rows may legitimately leave it null.
CREATE UNIQUE INDEX IF NOT EXISTS idx_charge_items_code_lower
  ON public.charge_items (lower(code)) WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_charge_items_active
  ON public.charge_items (is_active, category, name);

DROP TRIGGER IF EXISTS charge_items_set_updated_at ON public.charge_items;
CREATE TRIGGER charge_items_set_updated_at
  BEFORE UPDATE ON public.charge_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed: the ten types that were hardcoded in charges-tab.tsx, so nothing that is
-- already billable stops being billable, plus the per-day services named in the
-- rebuild request. Prices are 0 where the hospital has not stated one — 0 means
-- "type it in", and the form requires a positive amount before it will save.
--
-- ON CONFLICT DO NOTHING keyed on the name index: re-running this must not
-- overwrite a price the hospital has since corrected in the UI.
INSERT INTO public.charge_items (code, name, category, billing_mode, default_price, unit_label) VALUES
  ('REG',        'Registration',      'registration', 'one_time', 0, NULL),
  ('CONS',       'Consultation Fee',  'procedure',    'one_time', 0, 'per visit'),
  ('PROC',       'Procedure',         'procedure',    'one_time', 0, NULL),
  ('MED',        'Medication',        'pharmacy',     'one_time', 0, NULL),
  ('LAB',        'Lab Test',          'diagnostic',   'one_time', 0, NULL),
  ('XRAY',       'X-Ray',             'diagnostic',   'one_time', 0, NULL),
  ('CT',         'CT Scan',           'diagnostic',   'one_time', 0, NULL),
  ('MRI',        'MRI',               'diagnostic',   'one_time', 0, NULL),
  ('ROOM',       'Room Charges',      'room',         'per_day',  0, 'per day'),
  ('ICU',        'ICU Charges',       'room',         'per_day',  0, 'per day'),
  ('O2',         'Oxygen',            'medical',      'per_day',  0, 'per day'),
  ('NEB',        'Nebulizer',         'medical',      'per_day',  0, 'per day'),
  ('OTH',        'Other',             'other',        'one_time', 0, NULL)
ON CONFLICT DO NOTHING;
