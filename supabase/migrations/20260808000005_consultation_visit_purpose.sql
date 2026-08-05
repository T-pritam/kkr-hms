-- Wire purpose of visit into consultations and settlements
--
-- This is the migration that changes what a settlement *is*. It was one row per
-- (patient, doctor); it becomes one row per (patient, doctor, purpose). Two
-- consultations and one operation by the same doctor stop being "3 visits at one
-- rate" and become two rows that can be priced and paid independently.
--
-- On patient_consultations, `price_per_visit` is not a new column — it has
-- existed since before the migrations directory and has never been read or
-- written by any route (verified: zero hits across app/, lib/, components/). It
-- is exactly the right shape for the fee snapshot, so it is being given a meaning
-- rather than duplicated.
--
-- The partial unique index on doctor_visit_settlements is also the structural fix
-- for BUGS.md #29: sync matched an existing settlement on (patient_id, doctor_id)
-- while ignoring patient_billing_id, so a second admission repointed the first
-- admission's settlement and overwrote a fee that had already been agreed. With
-- the cycle in the key that is no longer representable.
--
-- WHERE deleted_at IS NULL, because a soft-deleted settlement must not block a
-- fresh one for the same triple — that is the normal way to start over.

-- ── patient_consultations ────────────────────────────────────────────────────

ALTER TABLE public.patient_consultations
  ADD COLUMN IF NOT EXISTS visit_purpose_id uuid REFERENCES public.visit_purposes(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.patient_consultations.visit_purpose_id IS 'What the visit was for. Settlement groups on this, so a consultation and an operation by the same doctor settle separately.';
COMMENT ON COLUMN public.patient_consultations.price_per_visit  IS 'The fee agreed for THIS visit, snapshotted from doctor_fee_schedule at entry time and editable there. Never read back from the rate card — repricing the card must not reprice history.';

CREATE INDEX IF NOT EXISTS idx_consultations_purpose
  ON public.patient_consultations (visit_purpose_id);

-- Backfill: a visit recorded before purposes existed was a consultation. That is
-- not a guess — the flat "amount per visit" the old model carried was the
-- consultation rate, because there was nothing else it could have been.
UPDATE public.patient_consultations c
   SET visit_purpose_id = vp.id
  FROM public.visit_purposes vp
 WHERE c.visit_purpose_id IS NULL
   AND vp.code = 'consultation';

-- Give each existing visit the rate its settlement was actually priced at, so
-- the first re-sync after this migration reproduces the same totals instead of
-- resetting agreed fees to zero. Settled rows included — especially settled rows.
UPDATE public.patient_consultations c
   SET price_per_visit = s.amount_per_visit
  FROM public.doctor_visit_settlements s
 WHERE coalesce(c.price_per_visit, 0) = 0
   AND s.patient_id = c.patient_id
   AND s.doctor_id  = c.doctor_id
   AND s.patient_billing_id IS NOT DISTINCT FROM c.billing_id
   AND s.deleted_at IS NULL
   AND coalesce(s.amount_per_visit, 0) > 0;


-- ── doctor_visit_settlements ─────────────────────────────────────────────────

ALTER TABLE public.doctor_visit_settlements
  ADD COLUMN IF NOT EXISTS visit_purpose_id uuid REFERENCES public.visit_purposes(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.doctor_visit_settlements.visit_purpose_id IS 'The purpose these visits share. Nullable: create-manual and merge produce rows that span purposes and have no single one.';
COMMENT ON COLUMN public.doctor_visit_settlements.total_amount IS 'visit_count * amount_per_visit. Maintained by every write path — see BUGS.md #26. Not generated, because merge and create-manual set it directly.';

-- Same reasoning as the consultation backfill: these rows were consultations.
UPDATE public.doctor_visit_settlements s
   SET visit_purpose_id = vp.id
  FROM public.visit_purposes vp
 WHERE s.visit_purpose_id IS NULL
   AND s.deleted_at IS NULL
   AND vp.code = 'consultation';

-- Repair the drift BUGS.md #26 describes before the index goes on, so a row with
-- a stale total is not carried forward past this point.
UPDATE public.doctor_visit_settlements
   SET total_amount = coalesce(amount_per_visit, 0) * coalesce(visit_count, 0)
 WHERE deleted_at IS NULL
   AND total_amount IS DISTINCT FROM coalesce(amount_per_visit, 0) * coalesce(visit_count, 0);

CREATE INDEX IF NOT EXISTS idx_settlements_purpose
  ON public.doctor_visit_settlements (visit_purpose_id);

-- One live settlement per cycle, doctor and purpose. See the header — this is
-- BUGS.md #29.
CREATE UNIQUE INDEX IF NOT EXISTS idx_settlements_cycle_doctor_purpose
  ON public.doctor_visit_settlements (patient_billing_id, doctor_id, visit_purpose_id)
  WHERE deleted_at IS NULL;
