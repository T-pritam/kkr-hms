-- Case Sheet / Discharge Summary rebuild — structured clinical content
--
-- Until now `patient_case_sheets` held a discharge date, one free-text notes
-- box and a URL to a scanned PDF. That was the entire discharge summary: no
-- diagnosis, no consulting doctor, no medication, no investigations, no
-- admission date. The document the hospital hands the patient was a photocopy.
--
-- This adds the clinical fields, a draft/final lifecycle and a document number.
-- The table is extended in place rather than replaced: it has a live row, a
-- working download route and existing tests, and every addition is nullable so
-- nothing breaks mid-deploy.
--
-- Deliberately NOT added:
--   - a UNIQUE constraint on patient_id. The table always allowed many rows per
--     patient; only the UI assumed one, which left a readmission nowhere to go.
--   - a `duration` column on medications — the four fields agreed with the
--     client are medicine, dosage, quantity and usage.

-- ── patient_case_sheets ──────────────────────────────────────────────────────

ALTER TABLE public.patient_case_sheets
  -- Admission & stay
  ADD COLUMN IF NOT EXISTS admission_date          date,
  ADD COLUMN IF NOT EXISTS ward                    varchar(80),
  ADD COLUMN IF NOT EXISTS bed                     varchar(40),

  -- Presenting details
  ADD COLUMN IF NOT EXISTS chief_complaints        text,
  ADD COLUMN IF NOT EXISTS history_present_illness text,
  ADD COLUMN IF NOT EXISTS past_history            text,

  -- The core of the summary
  ADD COLUMN IF NOT EXISTS diagnosis               text,
  ADD COLUMN IF NOT EXISTS investigations          text,
  ADD COLUMN IF NOT EXISTS clinical_summary        text,

  -- Discharge advice → free-text note (medication lives in its own table)
  ADD COLUMN IF NOT EXISTS advice_notes            text,

  -- Condition on discharge. Vitals stay text: "120/80" is not a number, and
  -- "98.6 F" and "37 C" both turn up in practice.
  ADD COLUMN IF NOT EXISTS condition_on_discharge  varchar(40),
  ADD COLUMN IF NOT EXISTS vitals_bp               varchar(30),
  ADD COLUMN IF NOT EXISTS vitals_pulse            varchar(30),
  ADD COLUMN IF NOT EXISTS vitals_temp             varchar(30),
  ADD COLUMN IF NOT EXISTS vitals_spo2             varchar(30),

  -- Follow-up
  ADD COLUMN IF NOT EXISTS follow_up_date          date,
  ADD COLUMN IF NOT EXISTS follow_up_instructions  text,

  -- Document identity and lifecycle
  ADD COLUMN IF NOT EXISTS summary_no              varchar(30),
  ADD COLUMN IF NOT EXISTS status                  varchar(20) NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS finalised_by            uuid,
  ADD COLUMN IF NOT EXISTS finalised_at            timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patient_case_sheets_summary_no_key'
  ) THEN
    ALTER TABLE public.patient_case_sheets
      ADD CONSTRAINT patient_case_sheets_summary_no_key UNIQUE (summary_no);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patient_case_sheets_status_check'
  ) THEN
    ALTER TABLE public.patient_case_sheets
      ADD CONSTRAINT patient_case_sheets_status_check
      CHECK (status IN ('draft', 'final'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patient_case_sheets_finalised_by_fkey'
  ) THEN
    ALTER TABLE public.patient_case_sheets
      ADD CONSTRAINT patient_case_sheets_finalised_by_fkey
      FOREIGN KEY (finalised_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.patient_case_sheets.status IS
  'draft while being written; final once signed off. Finalising is what discharges the patient.';
COMMENT ON COLUMN public.patient_case_sheets.summary_no IS
  'Human-facing document number, DS/<year>/<5 digits>. Issued by next_discharge_summary_no().';
COMMENT ON COLUMN public.patient_case_sheets.discharge_notes IS
  'DEPRECATED — superseded by clinical_summary. Backfilled, then left in place; drop after sign-off.';
COMMENT ON COLUMN public.patient_case_sheets.case_sheet_url IS
  'DEPRECATED — superseded by case_sheet_attachments, which supports several files. Backfilled.';

CREATE INDEX IF NOT EXISTS idx_case_sheets_patient    ON public.patient_case_sheets (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_sheets_status     ON public.patient_case_sheets (status);

DROP TRIGGER IF EXISTS patient_case_sheets_set_updated_at ON public.patient_case_sheets;
CREATE TRIGGER patient_case_sheets_set_updated_at
  BEFORE UPDATE ON public.patient_case_sheets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── medicines ────────────────────────────────────────────────────────────────
-- A master list so the same drug is not spelled five different ways. Starts
-- empty and fills up as staff add names from the discharge advice form.

CREATE TABLE IF NOT EXISTS public.medicines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(200) NOT NULL,
  form        varchar(50),               -- Tablet | Capsule | Syrup | Injection | ...
  strength    varchar(80),               -- '500 mg', '5 ml'
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT medicines_name_not_blank CHECK (btrim(name) <> '')
);

-- Case-insensitive uniqueness: "Pantoprazole" and "pantoprazole" are one drug.
CREATE UNIQUE INDEX IF NOT EXISTS idx_medicines_name_lower ON public.medicines (lower(name));
CREATE INDEX IF NOT EXISTS idx_medicines_active ON public.medicines (is_active, name);

DROP TRIGGER IF EXISTS medicines_set_updated_at ON public.medicines;
CREATE TRIGGER medicines_set_updated_at
  BEFORE UPDATE ON public.medicines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── case_sheet_doctors ───────────────────────────────────────────────────────
-- Several consulting doctors per summary. Names are snapshotted so renaming or
-- removing a doctor never rewrites a document that has already been signed.

CREATE TABLE IF NOT EXISTS public.case_sheet_doctors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_sheet_id     uuid NOT NULL REFERENCES public.patient_case_sheets(id) ON DELETE CASCADE,
  doctor_id         uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  doctor_name       varchar(255) NOT NULL,
  doctor_specialist varchar(150),
  display_order     integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_sheet_doctors_unique UNIQUE (case_sheet_id, doctor_id)
);

CREATE INDEX IF NOT EXISTS idx_case_sheet_doctors_sheet ON public.case_sheet_doctors (case_sheet_id, display_order);

-- ── case_sheet_medications ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.case_sheet_medications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_sheet_id uuid NOT NULL REFERENCES public.patient_case_sheets(id) ON DELETE CASCADE,
  medicine_id   uuid REFERENCES public.medicines(id) ON DELETE SET NULL,
  medicine_name varchar(200) NOT NULL,   -- snapshot, survives a master edit
  dosage        varchar(100),            -- '500 mg'
  quantity      varchar(50),             -- '10 tabs', '1 strip', '100 ml'
  usage         varchar(200),            -- '1-0-1 after food'
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_sheet_medications_name_not_blank CHECK (btrim(medicine_name) <> '')
);

CREATE INDEX IF NOT EXISTS idx_case_sheet_meds_sheet ON public.case_sheet_medications (case_sheet_id, display_order);

DROP TRIGGER IF EXISTS case_sheet_medications_set_updated_at ON public.case_sheet_medications;
CREATE TRIGGER case_sheet_medications_set_updated_at
  BEFORE UPDATE ON public.case_sheet_medications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── case_sheet_attachments ───────────────────────────────────────────────────
-- Several scans per summary, kept rather than overwritten. Today uploading a
-- replacement permanently destroys the previous object.
--
-- file_key is the actual R2 object key. The old code stored only a URL and a
-- filename that did not match the key it had written (BUGS.md #62), so the
-- download route had to reverse-engineer the key by splitting the URL.

CREATE TABLE IF NOT EXISTS public.case_sheet_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_sheet_id uuid NOT NULL REFERENCES public.patient_case_sheets(id) ON DELETE CASCADE,
  file_url      text NOT NULL,
  file_key      text,
  filename      varchar(255),
  size_bytes    bigint,
  uploaded_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  display_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_case_sheet_attachments_sheet ON public.case_sheet_attachments (case_sheet_id, display_order);
