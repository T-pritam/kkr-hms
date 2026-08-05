-- Purpose of visit, and the per-doctor rate card that prices it
--
-- A doctor visit had no type. Every visit by one doctor to one patient was worth
-- the same as every other, because settlement grouped them by doctor alone and
-- multiplied one hand-typed rate by the visit count
-- (app/api/patients/[id]/settlements/sync/route.ts). A doctor who consulted twice
-- at 300 and operated once at 5,000 came out as three visits at one rate — a
-- number that is wrong whichever rate is chosen.
--
-- Two tables, because the two questions are separate. visit_purposes is *what
-- kind of visit exists*, which is a property of the hospital. doctor_fee_schedule
-- is *what this doctor is paid for that kind of visit*, which differs by
-- consultant — a senior surgeon's operation fee is not the junior's.
--
-- Neither is a ceiling. The visit form prefills from the schedule and the amount
-- stays editable, and the fee actually agreed is snapshotted onto the visit
-- (20260808000005). Changing a rate card must never reprice a visit that has
-- already happened.
--
-- docs/PATIENT_DOCTOR_MODULE.md recorded the absence of this as a known gap:
-- "No per-doctor consultation fee. Settlement amounts stay hand-entered."

CREATE TABLE IF NOT EXISTS public.visit_purposes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         varchar(40) NOT NULL,
  name         varchar(100) NOT NULL,
  default_fee  numeric(12,2) NOT NULL DEFAULT 0,
  sort_order   integer NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT visit_purposes_code_not_blank  CHECK (btrim(code) <> ''),
  CONSTRAINT visit_purposes_name_not_blank  CHECK (btrim(name) <> ''),
  CONSTRAINT visit_purposes_fee_non_negative CHECK (default_fee >= 0)
);

COMMENT ON TABLE  public.visit_purposes IS 'What kinds of doctor visit exist. Referenced by patient_consultations and doctor_visit_settlements, which settle per purpose.';
COMMENT ON COLUMN public.visit_purposes.code IS 'Stable machine key. lib/billing/fees.ts and the backfills look up ''consultation'' by this — renaming a code breaks them, renaming the name does not.';
COMMENT ON COLUMN public.visit_purposes.default_fee IS 'Fallback when a doctor has no doctor_fee_schedule row for this purpose. See lib/billing/fees.ts resolveVisitFee().';
COMMENT ON COLUMN public.visit_purposes.is_active IS 'Retire a purpose by clearing this. Never delete one that has visits pointing at it.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_purposes_code_lower
  ON public.visit_purposes (lower(code));
CREATE INDEX IF NOT EXISTS idx_visit_purposes_active
  ON public.visit_purposes (is_active, sort_order, name);

DROP TRIGGER IF EXISTS visit_purposes_set_updated_at ON public.visit_purposes;
CREATE TRIGGER visit_purposes_set_updated_at
  BEFORE UPDATE ON public.visit_purposes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed. 'consultation' must exist and must keep that code: 20260808000005
-- backfills every existing visit and settlement onto it, on the grounds that a
-- visit recorded before purposes existed was a consultation — that is what the
-- old flat "amount per visit" meant in practice.
--
-- Fees stay 0 here. A hospital-wide default operation fee would be a number
-- nobody chose; the per-doctor rate card is where real figures belong.
INSERT INTO public.visit_purposes (code, name, sort_order) VALUES
  ('consultation', 'Consultation',       10),
  ('follow_up',    'Follow-up',          20),
  ('operation',    'Operation / Surgery', 30),
  ('procedure',    'Procedure',          40),
  ('emergency',    'Emergency',          50),
  ('ward_round',   'Ward Round',         60)
ON CONFLICT DO NOTHING;


-- ── doctor_fee_schedule ──────────────────────────────────────────────────────
-- One rate per doctor per purpose. The unique constraint is what makes it a rate
-- card rather than a log: two live rows for the same pair would make
-- resolveVisitFee() non-deterministic.
--
-- ON DELETE CASCADE from doctors (the rate card is meaningless without the
-- doctor) but RESTRICT from visit_purposes (deleting a purpose that is priced
-- should fail loudly — deactivate it instead).

CREATE TABLE IF NOT EXISTS public.doctor_fee_schedule (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id        uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  visit_purpose_id uuid NOT NULL REFERENCES public.visit_purposes(id) ON DELETE RESTRICT,
  fee              numeric(12,2) NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT doctor_fee_schedule_fee_non_negative CHECK (fee >= 0),
  CONSTRAINT doctor_fee_schedule_unique UNIQUE (doctor_id, visit_purpose_id)
);

COMMENT ON TABLE  public.doctor_fee_schedule IS 'Per-doctor, per-purpose rate card. Prefills the visit form; the agreed fee is snapshotted onto patient_consultations.price_per_visit and never read back from here.';
COMMENT ON COLUMN public.doctor_fee_schedule.fee IS 'What this doctor is paid for this kind of visit. A default, not a ceiling — the visit form may override it.';

CREATE INDEX IF NOT EXISTS idx_doctor_fee_schedule_doctor
  ON public.doctor_fee_schedule (doctor_id, is_active);

DROP TRIGGER IF EXISTS doctor_fee_schedule_set_updated_at ON public.doctor_fee_schedule;
CREATE TRIGGER doctor_fee_schedule_set_updated_at
  BEFORE UPDATE ON public.doctor_fee_schedule
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
