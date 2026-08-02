-- Patient registry rebuild — the fields a hospital registration desk actually needs
--
-- `patients` was created before this migrations directory existed and has never
-- been extended. Two of its gaps are not "missing features" but live bugs:
--
--   * `age`   is read by app/patients/[id]/page.tsx, components/patients/
--             patient-info-tab.tsx and lib/pdf/discharge-summary-pdf.ts. No such
--             column exists, so the discharge summary a patient takes home has
--             a blank age on its cover page.
--   * `email` is rendered by patient-info-tab.tsx and has printed "N/A" since
--             the day it was written.
--
-- Age is deliberately TWO columns rather than a back-computed date of birth.
-- Most patients state an age, not a birth date. Turning "45" into 1981-01-01
-- would fabricate a fact that then prints on a clinical document. Storing the
-- stated age alongside the date it was stated lets lib/patients/age.ts age it
-- forward instead of freezing it.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS age_years                  smallint,
  ADD COLUMN IF NOT EXISTS age_recorded_on            date,
  ADD COLUMN IF NOT EXISTS blood_group                varchar(10),
  ADD COLUMN IF NOT EXISTS email                      varchar(255),
  ADD COLUMN IF NOT EXISTS alternate_phone            varchar(30),
  ADD COLUMN IF NOT EXISTS emergency_contact_relation varchar(40),
  ADD COLUMN IF NOT EXISTS id_proof_type              varchar(40),
  ADD COLUMN IF NOT EXISTS id_proof_number            varchar(60);

COMMENT ON COLUMN public.patients.age_years       IS 'Age as stated by the patient, used when date_of_birth is unknown. Resolve through lib/patients/age.ts, never read raw.';
COMMENT ON COLUMN public.patients.age_recorded_on IS 'The date age_years was stated, so a stated age can be aged forward rather than going stale.';
COMMENT ON COLUMN public.patients.blood_group     IS 'A+ A- B+ B- AB+ AB- O+ O- or Unknown.';
COMMENT ON COLUMN public.patients.id_proof_type   IS 'Aadhaar / Voter ID / PAN / Driving Licence / Passport / Ration Card / Other.';

-- Gender was pre-selected as 'Male' in the form and never enforced, so an
-- unanswered question was recorded as a fact. Production also holds rows
-- reading 'MALE' — which matches no dropdown option, so the edit modal silently
-- rewrote them on the next save. Normalise, then constrain so it cannot recur.
UPDATE public.patients
   SET gender = initcap(lower(trim(gender)))
 WHERE gender IS NOT NULL
   AND gender <> initcap(lower(trim(gender)));

-- Anything that still does not fit the three known values is left for a human
-- rather than guessed at.
UPDATE public.patients
   SET gender = NULL
 WHERE gender IS NOT NULL
   AND gender NOT IN ('Male', 'Female', 'Other');

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS patients_gender_check;

ALTER TABLE public.patients
  ADD CONSTRAINT patients_gender_check
  CHECK (gender IS NULL OR gender IN ('Male', 'Female', 'Other'));

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS patients_blood_group_check;

ALTER TABLE public.patients
  ADD CONSTRAINT patients_blood_group_check
  CHECK (blood_group IS NULL OR blood_group IN
    ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'));

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS patients_age_years_check;

ALTER TABLE public.patients
  ADD CONSTRAINT patients_age_years_check
  CHECK (age_years IS NULL OR (age_years >= 0 AND age_years <= 130));
