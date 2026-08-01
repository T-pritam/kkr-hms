-- Lab / Pathology rebuild — test master upgrade
--
-- Before this migration a parameter could only be "name + unit + numeric
-- min/max (+ optional male/female split)". That cannot express:
--   * '< 200'  — every cholesterol / triglyceride range
--   * 'Negative' / 'Positive' — qualitative results (the text_value column
--     existed but had no way to declare what the normal value was)
--   * age bands (paediatric vs adult intervals)
--   * calculated parameters (A/G ratio, LDL by Friedewald, MCH, MCHC)
--   * sub-headings such as DIFFERENTIAL COUNT inside a CBC
--
-- The legacy columns on test_parameters are kept and still readable; migration
-- 20260801000004 copies them into test_parameter_ranges rows.

-- ─────────────────────────────────────────────────────────────────────────────
-- test_parameters — new columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.test_parameters
  ADD COLUMN IF NOT EXISTS param_type  varchar(20)  NOT NULL DEFAULT 'numeric',
  ADD COLUMN IF NOT EXISTS code        varchar(50),
  ADD COLUMN IF NOT EXISTS method      varchar(150),
  ADD COLUMN IF NOT EXISTS options     jsonb,
  ADD COLUMN IF NOT EXISTS formula     text,
  ADD COLUMN IF NOT EXISTS decimals    integer      NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS group_name  varchar(120),
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz  NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'test_parameters_param_type_check'
  ) THEN
    ALTER TABLE public.test_parameters
      ADD CONSTRAINT test_parameters_param_type_check
      CHECK (param_type IN ('numeric', 'qualitative', 'calculated'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'test_parameters_decimals_check'
  ) THEN
    ALTER TABLE public.test_parameters
      ADD CONSTRAINT test_parameters_decimals_check
      CHECK (decimals BETWEEN 0 AND 6);
  END IF;
END $$;

-- `code` is the token used inside formulas, e.g. {ALB}/({TP}-{ALB}).
-- Unique per test, but only where present.
CREATE UNIQUE INDEX IF NOT EXISTS test_parameters_test_code_unique
  ON public.test_parameters (test_id, upper(code))
  WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS test_parameters_test_id_order_idx
  ON public.test_parameters (test_id, display_order, name);

COMMENT ON COLUMN public.test_parameters.param_type IS 'numeric = measured number; qualitative = picklist from options; calculated = derived via formula.';
COMMENT ON COLUMN public.test_parameters.code       IS 'Short token referenced by other parameters formulas, e.g. ALB in {ALB}/({TP}-{ALB}).';
COMMENT ON COLUMN public.test_parameters.options    IS 'Qualitative picklist: JSON array of strings, e.g. ["Negative","Positive"].';
COMMENT ON COLUMN public.test_parameters.group_name IS 'Optional sub-heading printed above this parameter, e.g. DIFFERENTIAL COUNT.';

DROP TRIGGER IF EXISTS test_parameters_set_updated_at ON public.test_parameters;
CREATE TRIGGER test_parameters_set_updated_at
  BEFORE UPDATE ON public.test_parameters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- test_parameter_ranges — age/gender-banded reference intervals
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.test_parameter_ranges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_id    uuid NOT NULL REFERENCES public.test_parameters(id) ON DELETE CASCADE,

  gender          varchar(10),   -- NULL = applies to any gender
  age_min_years   numeric,       -- NULL = no lower bound (inclusive)
  age_max_years   numeric,       -- NULL = no upper bound (exclusive)

  range_type      varchar(20) NOT NULL DEFAULT 'between',
  min_value       numeric,
  max_value       numeric,
  text_range      varchar(120),  -- range_type = 'text', e.g. 'Negative'
  display_text    varchar(120),  -- overrides what is printed on the report

  normal_options  jsonb,         -- qualitative: which option values are normal

  -- Explicit critical bounds. These REPLACE the old multiplicative rule
  -- (value < refMin*0.5 || value > refMax*1.5), which was clinically wrong for
  -- any interval touching or spanning zero — e.g. bilirubin 0-1.2 could never
  -- be flagged critical no matter how high the result went.
  critical_low    numeric,
  critical_high   numeric,

  display_order   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT test_parameter_ranges_gender_check
    CHECK (gender IS NULL OR lower(gender) IN ('male', 'female', 'other')),
  CONSTRAINT test_parameter_ranges_type_check
    CHECK (range_type IN ('between', 'less_than', 'greater_than', 'text')),
  CONSTRAINT test_parameter_ranges_age_check
    CHECK (age_min_years IS NULL OR age_max_years IS NULL OR age_min_years < age_max_years),

  -- Each range type must carry the values it needs to be renderable.
  CONSTRAINT test_parameter_ranges_values_check CHECK (
    (range_type = 'between'      AND min_value IS NOT NULL AND max_value IS NOT NULL AND min_value <= max_value)
 OR (range_type = 'less_than'    AND max_value IS NOT NULL)
 OR (range_type = 'greater_than' AND min_value IS NOT NULL)
 OR (range_type = 'text'         AND (text_range IS NOT NULL OR normal_options IS NOT NULL))
  )
);

CREATE INDEX IF NOT EXISTS test_parameter_ranges_parameter_id_idx
  ON public.test_parameter_ranges (parameter_id, display_order);

COMMENT ON TABLE  public.test_parameter_ranges IS 'Reference intervals resolved per patient by gender then age band. Most specific match wins.';
COMMENT ON COLUMN public.test_parameter_ranges.age_min_years IS 'Inclusive lower bound in years. NULL = unbounded.';
COMMENT ON COLUMN public.test_parameter_ranges.age_max_years IS 'Exclusive upper bound in years. NULL = unbounded.';

DROP TRIGGER IF EXISTS test_parameter_ranges_set_updated_at ON public.test_parameter_ranges;
CREATE TRIGGER test_parameter_ranges_set_updated_at
  BEFORE UPDATE ON public.test_parameter_ranges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- lab_tests — method + default interpretation
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.lab_tests
  ADD COLUMN IF NOT EXISTS method                 varchar(150),
  ADD COLUMN IF NOT EXISTS interpretation_template text;

-- ─────────────────────────────────────────────────────────────────────────────
-- lab_interpretation_templates — reusable summary text
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_interpretation_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id    uuid REFERENCES public.lab_tests(id) ON DELETE CASCADE,  -- NULL = global
  title      varchar(150) NOT NULL,
  body       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lab_interpretation_templates_test_id_idx
  ON public.lab_interpretation_templates (test_id) WHERE is_active;

COMMENT ON COLUMN public.lab_interpretation_templates.test_id IS 'NULL means the template is offered for every test.';

DROP TRIGGER IF EXISTS lab_interpretation_templates_set_updated_at ON public.lab_interpretation_templates;
CREATE TRIGGER lab_interpretation_templates_set_updated_at
  BEFORE UPDATE ON public.lab_interpretation_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
