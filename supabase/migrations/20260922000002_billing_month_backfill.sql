-- Give every bill a join date and a month (PRD v2 gap G-26)
--
-- Registering a patient created their bill without `joined_date` or
-- `month_year` (app/api/patients/route.ts), and neither column has a default.
-- Finances reads commission, doctor fees and pending receivables by
-- `month_year`, so those bills were never counted in any month. Checked on
-- 2026-09-22: 8 of 11 live bills had no month.
--
-- The route now sets both. This fills in the bills already written: the
-- patient's date of joining, else the bill's own creation date on the IST
-- calendar.
--
-- Effect to expect: the Finances Overview for the months these patients joined
-- will start including their bills.

UPDATE public.patient_billing b
   SET joined_date = COALESCE(
         b.joined_date,
         p.date_of_join,
         (b.created_at AT TIME ZONE 'Asia/Kolkata')::date),
       month_year = COALESCE(
         b.month_year,
         to_char(COALESCE(
           b.joined_date,
           p.date_of_join,
           (b.created_at AT TIME ZONE 'Asia/Kolkata')::date), 'YYYY-MM'))
  FROM public.patients p
 WHERE p.id = b.patient_id
   AND (b.month_year IS NULL OR b.joined_date IS NULL);
