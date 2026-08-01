-- Lab / Pathology rebuild — core order model
--
-- Replaces the flat `patient_test_results` (one row = one test, no patient FK)
-- with a proper LIS order model:
--     lab_orders  →  lab_order_items  →  lab_result_values
--
-- One order = one requisition at one visit, carrying many tests under a single
-- order number. The same test repeated on another date is a NEW order.
--
-- The old tables are left untouched; migration 20260801000004 backfills from
-- them. Drop/rename them only after the new module is signed off in production.

-- ─────────────────────────────────────────────────────────────────────────────
-- lab_orders
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_orders (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no                varchar(30)  NOT NULL UNIQUE,

  -- Registered patient link. NULL only for walk-in / OPD orders.
  patient_id              uuid REFERENCES public.patients(id) ON DELETE SET NULL,

  -- Demographic snapshot. Always populated, for registered patients too, so a
  -- reprinted report shows what was true when the sample was taken.
  patient_name            varchar(255) NOT NULL,
  patient_phone           varchar(20),
  patient_age             integer,
  patient_gender          varchar(20),
  patient_display_id      varchar(50),   -- snapshot of patients.patient_id (MRN)
  patient_status          varchar(20),   -- snapshot of patients.status

  referring_doctor_id     uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  referring_doctor_name   varchar(255),  -- free text for doctors outside the hospital

  priority                varchar(20)  NOT NULL DEFAULT 'routine',
  status                  varchar(30)  NOT NULL DEFAULT 'registered',

  registered_at           timestamptz  NOT NULL DEFAULT now(),
  collected_at            timestamptz,
  received_at             timestamptz,
  reported_at             timestamptz,

  collected_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by              uuid REFERENCES public.users(id) ON DELETE SET NULL,

  total_amount            numeric(12,2) NOT NULL DEFAULT 0,
  discount                numeric(12,2) NOT NULL DEFAULT 0,
  net_amount              numeric(12,2) NOT NULL DEFAULT 0,

  notes                   text,
  created_at              timestamptz  NOT NULL DEFAULT now(),
  updated_at              timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT lab_orders_priority_check
    CHECK (priority IN ('routine', 'urgent')),
  CONSTRAINT lab_orders_status_check
    CHECK (status IN ('registered', 'collected', 'received', 'in_progress', 'reported', 'cancelled')),
  CONSTRAINT lab_orders_amounts_check
    CHECK (total_amount >= 0 AND discount >= 0 AND net_amount >= 0)
);

CREATE INDEX IF NOT EXISTS lab_orders_patient_id_idx     ON public.lab_orders (patient_id);
CREATE INDEX IF NOT EXISTS lab_orders_status_idx         ON public.lab_orders (status);
CREATE INDEX IF NOT EXISTS lab_orders_registered_at_idx  ON public.lab_orders (registered_at DESC);
CREATE INDEX IF NOT EXISTS lab_orders_patient_name_idx   ON public.lab_orders (lower(patient_name));

COMMENT ON TABLE  public.lab_orders IS 'One lab requisition per visit. Many tests hang off it via lab_order_items.';
COMMENT ON COLUMN public.lab_orders.patient_id IS 'NULL for walk-in/OPD patients who have no registration record.';
COMMENT ON COLUMN public.lab_orders.patient_display_id IS 'Snapshot of patients.patient_id (the human MRN) at order time.';

-- ─────────────────────────────────────────────────────────────────────────────
-- lab_order_items — one per test within an order
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_order_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid NOT NULL REFERENCES public.lab_orders(id) ON DELETE CASCADE,
  test_id            uuid NOT NULL REFERENCES public.lab_tests(id) ON DELETE RESTRICT,

  -- Catalogue snapshot: the report must reproduce what was ordered, even if the
  -- catalogue entry is later renamed or repriced.
  test_name          varchar(255) NOT NULL,
  test_code          varchar(50)  NOT NULL,
  category           varchar(50),
  specimen           varchar(100),
  method             varchar(150),

  price              numeric(12,2) NOT NULL DEFAULT 0,
  status             varchar(30)   NOT NULL DEFAULT 'pending',

  -- The clinical summary. Industry term is "interpretation".
  interpretation     text,
  interpretation_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  interpretation_at  timestamptz,

  entered_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  entered_at         timestamptz,

  -- Authorisation is OPTIONAL in this deployment: it stamps who released the
  -- report but never gates printing.
  authorised_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  authorised_at      timestamptz,

  display_order      integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lab_order_items_status_check
    CHECK (status IN ('pending', 'results_entered', 'authorised', 'cancelled')),
  CONSTRAINT lab_order_items_order_test_unique UNIQUE (order_id, test_id)
);

CREATE INDEX IF NOT EXISTS lab_order_items_order_id_idx ON public.lab_order_items (order_id);
CREATE INDEX IF NOT EXISTS lab_order_items_test_id_idx  ON public.lab_order_items (test_id);
CREATE INDEX IF NOT EXISTS lab_order_items_status_idx   ON public.lab_order_items (status);

COMMENT ON COLUMN public.lab_order_items.interpretation IS 'Clinical summary shown on the report. Editable by ADMIN, DOCTOR or LAB_TECHNICIAN.';

-- ─────────────────────────────────────────────────────────────────────────────
-- lab_result_values
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_result_values (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id  uuid NOT NULL REFERENCES public.lab_order_items(id) ON DELETE CASCADE,
  parameter_id   uuid NOT NULL REFERENCES public.test_parameters(id) ON DELETE RESTRICT,

  value          numeric,
  text_value     text,

  -- Snapshot of the interval that applied to THIS patient at entry time.
  unit           varchar(50),
  ref_display    varchar(120),   -- rendered, e.g. '13.0 - 17.0' / '< 200' / 'Negative'
  ref_min        numeric,
  ref_max        numeric,

  -- Stores exactly the letter printed on the report. Replaces the old `flag`
  -- column so the report needs no mapping logic.
  abnormal       varchar(2),
  is_critical    boolean NOT NULL DEFAULT false,

  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lab_result_values_abnormal_check
    CHECK (abnormal IS NULL OR abnormal IN ('H', 'L', 'A')),
  CONSTRAINT lab_result_values_item_param_unique UNIQUE (order_item_id, parameter_id)
);

CREATE INDEX IF NOT EXISTS lab_result_values_order_item_id_idx ON public.lab_result_values (order_item_id);
CREATE INDEX IF NOT EXISTS lab_result_values_parameter_id_idx  ON public.lab_result_values (parameter_id);

COMMENT ON COLUMN public.lab_result_values.abnormal IS 'H = above interval, L = below interval, A = abnormal qualitative result. NULL = within interval.';

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at maintenance
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lab_orders_set_updated_at ON public.lab_orders;
CREATE TRIGGER lab_orders_set_updated_at
  BEFORE UPDATE ON public.lab_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS lab_order_items_set_updated_at ON public.lab_order_items;
CREATE TRIGGER lab_order_items_set_updated_at
  BEFORE UPDATE ON public.lab_order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS lab_result_values_set_updated_at ON public.lab_result_values;
CREATE TRIGGER lab_result_values_set_updated_at
  BEFORE UPDATE ON public.lab_result_values
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
