-- Two demo charge sheets — one OPD walk-in, one registered patient
--
-- The Charge Sheets screen was empty on every fresh install, which made it hard to see
-- what a sheet actually looks like without creating one by hand first. These are ordinary
-- draft sheets, not special rows — printable, editable, forwardable and deletable exactly
-- like any other. Their `notes` say so and end "— safe to delete" for anyone who wants
-- them gone.
--
-- Guarded by an EXISTS check on that note text rather than ON CONFLICT: neither table has
-- a natural unique constraint to hang one off (a real sheet's number is only known after
-- next_charge_sheet_no() runs), so re-running this migration must not create a second
-- copy of either demo sheet.
--
-- Uses next_charge_sheet_no() — the same function the app calls — so a demo sheet's number
-- can never collide with one a user has already issued.

DO $$
DECLARE
  v_patient_id uuid;
  v_sheet_id   uuid;
BEGIN
  -- OPD demo. No dependency on existing data — always created.
  IF NOT EXISTS (
    SELECT 1 FROM public.charge_sheets WHERE notes = 'Sample OPD charge sheet — safe to delete'
  ) THEN
    INSERT INTO public.charge_sheets
      (sheet_no, subject_type, opd_name, opd_phone, opd_age, opd_gender, status, notes)
    VALUES
      (public.next_charge_sheet_no(), 'opd', 'Ramesh Kumar (Demo)', '9876543210', 34, 'Male',
       'draft', 'Sample OPD charge sheet — safe to delete')
    RETURNING id INTO v_sheet_id;

    INSERT INTO public.charge_sheet_items
      (charge_sheet_id, charge_item_id, description, unit_price, qty, service_date)
    SELECT v_sheet_id, id, name, default_price, 1, CURRENT_DATE
      FROM public.charge_items WHERE code = 'CONS'
    UNION ALL
    SELECT v_sheet_id, id, name, default_price, 1, CURRENT_DATE
      FROM public.charge_items WHERE code = 'XRAY';

    UPDATE public.charge_sheets
       SET total_amount = (
             SELECT COALESCE(SUM(line_total), 0)
               FROM public.charge_sheet_items WHERE charge_sheet_id = v_sheet_id
           )
     WHERE id = v_sheet_id;
  END IF;

  -- Registered-patient demo. Skipped, not failed, on a brand-new install with nobody
  -- registered yet.
  SELECT id INTO v_patient_id FROM public.patients ORDER BY created_at ASC LIMIT 1;

  IF v_patient_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.charge_sheets
     WHERE notes = 'Sample charge sheet for a registered patient — safe to delete'
  ) THEN
    INSERT INTO public.charge_sheets (sheet_no, subject_type, patient_id, status, notes)
    VALUES
      (public.next_charge_sheet_no(), 'patient', v_patient_id, 'draft',
       'Sample charge sheet for a registered patient — safe to delete')
    RETURNING id INTO v_sheet_id;

    INSERT INTO public.charge_sheet_items
      (charge_sheet_id, charge_item_id, description, unit_price, qty, service_date)
    SELECT v_sheet_id, id, name, default_price, 1, CURRENT_DATE
      FROM public.charge_items WHERE code = 'LAB'
    UNION ALL
    SELECT v_sheet_id, id, name, default_price, 2, CURRENT_DATE
      FROM public.charge_items WHERE code = 'MED';

    UPDATE public.charge_sheets
       SET total_amount = (
             SELECT COALESCE(SUM(line_total), 0)
               FROM public.charge_sheet_items WHERE charge_sheet_id = v_sheet_id
           )
     WHERE id = v_sheet_id;
  END IF;
END
$$;
