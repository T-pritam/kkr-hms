-- One bill per patient (BUGS.md #22)
--
-- Every screen reads a patient's single bill, and a returning patient is
-- registered again rather than given a second bill (Q-74; CR-17, "a new bill
-- per stay", is dropped for now). Nothing enforced it: a double submit or two
-- tabs could open a second bill, splitting payments and charges across two
-- records while the screens showed only one.
--
-- `POST /api/patients/[id]/billing` now refuses with 409 when a bill exists;
-- this index closes the race two simultaneous requests could still win.
-- Checked before writing: no patient in production has more than one bill.
--
-- If CR-17 is ever built (a bill per stay), this index is what to drop.

CREATE UNIQUE INDEX IF NOT EXISTS patient_billing_one_per_patient
  ON public.patient_billing (patient_id);
