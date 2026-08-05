-- Link each visit to the settlement that billed it
--
-- The settlement sync endpoint matched an existing settlement by
-- (patient_billing_id, doctor_id, visit_purpose_id) and recomputed visit_count as a
-- live COUNT of matching consultations. That is fine until the matching row is
-- already settled — money already handed over. Two more consultations of the same
-- doctor and purpose then arrive, sync finds the same (settled) row, and — quite
-- reasonably — refuses to change a paid amount. But it also never creates anything
-- for the two new visits, because nothing recorded which specific visits the
-- settled row actually covers. They vanish: recorded, never billed, and nothing
-- says so.
--
-- `settlement_id` is the fix: null means "not yet billed". Sync only ever gathers
-- visits where this is null into the one live *unsettled* row for their
-- (doctor, purpose); once that row is settled, the next visit of the same pair has
-- nothing unsettled to attach to and starts a fresh one. The count is no longer a
-- number trusted to stay in sync with reality — it is the count of rows that
-- actually point here.
--
-- ON DELETE SET NULL: deleting a settlement (the DELETE route already supports
-- this) must hand its visits back to the unbilled pool, not strand them pointing
-- at a row that no longer exists as an active settlement.

ALTER TABLE public.patient_consultations
  ADD COLUMN IF NOT EXISTS settlement_id uuid REFERENCES public.doctor_visit_settlements(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.patient_consultations.settlement_id IS 'The settlement this visit has been billed under, or null if not yet billed. Set by the sync endpoint and cleared when that settlement is deleted — never set by hand.';

CREATE INDEX IF NOT EXISTS idx_consultations_settlement
  ON public.patient_consultations (settlement_id);

-- Backfill. Every live settlement predates this column, so every one of them is
-- currently unlinked to any visit. For each, attach up to its own visit_count of
-- the matching, still-unlinked, live consultations — oldest visit first, on the
-- grounds that whichever visits were recorded first are the ones a settlement
-- created before today would have been counting.
--
-- No cross-settlement ambiguity to resolve here: the constraint this migration is
-- about to replace already guaranteed at most one live settlement per
-- (patient_billing_id, doctor_id, visit_purpose_id), so every settlement's matching
-- visits are its own.
DO $$
DECLARE
  s RECORD;
  v RECORD;
BEGIN
  FOR s IN
    SELECT * FROM public.doctor_visit_settlements WHERE deleted_at IS NULL
  LOOP
    FOR v IN
      SELECT id FROM public.patient_consultations
       WHERE patient_id = s.patient_id
         AND doctor_id = s.doctor_id
         AND billing_id IS NOT DISTINCT FROM s.patient_billing_id
         AND visit_purpose_id IS NOT DISTINCT FROM s.visit_purpose_id
         AND deleted_at IS NULL
         AND settlement_id IS NULL
       ORDER BY consultation_date ASC
       LIMIT GREATEST(s.visit_count, 0)
    LOOP
      UPDATE public.patient_consultations SET settlement_id = s.id WHERE id = v.id;
    END LOOP;
  END LOOP;
END
$$;

-- The uniqueness constraint this replaces made "one live settlement per
-- (cycle, doctor, purpose)" absolute — settled or not. That is exactly what has to
-- give: a settled row is now allowed to sit alongside a fresh unsettled one for the
-- same triple, because they cover different visits. Uniqueness is scoped to the
-- unsettled row only — there is still never more than one thing currently awaiting
-- payment for a given doctor and purpose, which is the invariant that actually
-- matters for sync to stay simple.
DROP INDEX IF EXISTS public.idx_settlements_cycle_doctor_purpose;

CREATE UNIQUE INDEX IF NOT EXISTS idx_settlements_cycle_doctor_purpose_unsettled
  ON public.doctor_visit_settlements (patient_billing_id, doctor_id, visit_purpose_id)
  WHERE deleted_at IS NULL AND settled = false;

COMMENT ON INDEX public.idx_settlements_cycle_doctor_purpose_unsettled IS 'At most one live, unsettled settlement per cycle+doctor+purpose. Settled rows for the same triple are historical and are not covered by this index — see 20260809000002.';
