-- Case Sheet rebuild — backfill of existing rows
--
-- Moves the old shape onto the new one:
--   discharge_notes            → clinical_summary
--   case_sheet_url / filename  → a case_sheet_attachments row
--   (no status)                → 'final'
--
-- The last one deserves a note. Under the old code, *creating* a case sheet
-- immediately PATCHed the patient to Discharged — there was no draft stage and
-- no way to save work in progress. So every pre-existing row was, in effect, a
-- finalised summary, and marking it 'final' is the honest mapping. finalised_at
-- is taken from created_at and finalised_by from created_by, because that is
-- literally when and by whom the patient was discharged.
--
-- Guarded and idempotent throughout: re-running changes nothing. The old
-- columns are left in place, to be dropped only after sign-off in production.

DO $$
DECLARE
  r RECORD;
  v_key text;
BEGIN
  -- 1. Narrative: the old single notes box becomes the clinical summary.
  UPDATE public.patient_case_sheets
     SET clinical_summary = discharge_notes
   WHERE clinical_summary IS NULL
     AND discharge_notes IS NOT NULL
     AND btrim(discharge_notes) <> '';

  -- 2. Lifecycle: everything that existed was already a discharge.
  UPDATE public.patient_case_sheets
     SET status       = 'final',
         finalised_at = COALESCE(finalised_at, created_at, now()),
         finalised_by = COALESCE(finalised_by, created_by)
   WHERE status = 'draft'
     AND created_at IS NOT NULL;

  -- 3. Document numbers, issued in creation order so they read chronologically.
  FOR r IN
    SELECT id FROM public.patient_case_sheets
     WHERE summary_no IS NULL
     ORDER BY created_at NULLS LAST, id
  LOOP
    UPDATE public.patient_case_sheets
       SET summary_no = public.next_discharge_summary_no()
     WHERE id = r.id;
  END LOOP;

  -- 4. The single scan becomes the first attachment.
  --
  -- The object key was never stored, so it is recovered from the public URL:
  --   https://pub-<account>.r2.dev/case-sheets/<patient>/<ts>_<name>
  -- Anything that does not match that shape gets a NULL key and is handled by
  -- the download route's legacy fallback rather than being dropped.
  FOR r IN
    SELECT cs.id, cs.case_sheet_url, cs.case_sheet_filename, cs.uploaded_at, cs.created_by, cs.created_at
      FROM public.patient_case_sheets cs
     WHERE cs.case_sheet_url IS NOT NULL
       AND btrim(cs.case_sheet_url) <> ''
       AND NOT EXISTS (
             SELECT 1 FROM public.case_sheet_attachments a
              WHERE a.case_sheet_id = cs.id AND a.file_url = cs.case_sheet_url
           )
  LOOP
    v_key := NULLIF(split_part(r.case_sheet_url, '.r2.dev/', 2), '');

    INSERT INTO public.case_sheet_attachments
      (case_sheet_id, file_url, file_key, filename, uploaded_by, uploaded_at, display_order)
    VALUES
      (r.id,
       r.case_sheet_url,
       v_key,
       COALESCE(r.case_sheet_filename, 'case-sheet.pdf'),
       r.created_by,
       COALESCE(r.uploaded_at, r.created_at, now()),
       0);
  END LOOP;
END $$;
