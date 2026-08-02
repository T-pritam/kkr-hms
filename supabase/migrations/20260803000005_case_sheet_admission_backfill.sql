-- Case sheet — seed the admission date from the patient's date of joining
--
-- `patients.date_of_join` is captured at registration and
-- `patient_case_sheets.admission_date` is a separate column, with nothing
-- connecting them. The case sheet editor started from a blank form, the POST
-- route selected only `id` off the patient, and the discharge summary PDF
-- fetched the patient record but mapped only name/id/phone/address/gender/age.
-- The result was an admission date that printed blank on every summary unless
-- a clinician happened to retype it.
--
-- New drafts now inherit it (app/api/patients/[id]/case-sheets/route.ts) and
-- stay editable — a readmission has a real admission date that differs from the
-- original registration. This fills in the sheets that already exist.

UPDATE public.patient_case_sheets cs
   SET admission_date = p.date_of_join
  FROM public.patients p
 WHERE p.id = cs.patient_id
   AND cs.admission_date IS NULL
   AND p.date_of_join IS NOT NULL;
