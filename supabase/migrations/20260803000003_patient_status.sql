-- Patient registry rebuild — one status vocabulary
--
-- `patients.status` meant four different things depending on which screen wrote
-- it:
--
--   edit-patient-modal.tsx          Active | Inactive
--   patient-info-tab.tsx            'cancelled'  (lowercase)
--   case-sheet finalise             Discharged
--   app/api/patients/active/route   filtered on 'discharge' — a value nothing
--                                   ever wrote, so that endpoint returned
--                                   discharged patients as active
--
-- Settled to three values. 'Inactive' is dropped: nothing in the app ever read
-- it, and a patient who is not currently under care is Discharged, which is a
-- clinical fact, not an account state.

UPDATE public.patients
   SET status = CASE lower(trim(coalesce(status, '')))
                  WHEN 'active'     THEN 'Active'
                  WHEN 'inactive'   THEN 'Active'
                  WHEN 'discharged' THEN 'Discharged'
                  WHEN 'discharge'  THEN 'Discharged'
                  WHEN 'cancelled'  THEN 'Cancelled'
                  WHEN 'canceled'   THEN 'Cancelled'
                  ELSE 'Active'
                END;

ALTER TABLE public.patients
  ALTER COLUMN status SET DEFAULT 'Active';

ALTER TABLE public.patients
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS patients_status_check;

ALTER TABLE public.patients
  ADD CONSTRAINT patients_status_check
  CHECK (status IN ('Active', 'Discharged', 'Cancelled'));

COMMENT ON COLUMN public.patients.status IS 'Active | Discharged | Cancelled. Discharged is set by finalising a discharge summary, not by hand.';
