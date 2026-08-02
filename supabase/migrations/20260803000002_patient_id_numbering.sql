-- Patient registry rebuild — patient ID issuance
--
-- The patient ID was typed by hand ("e.g., 1/25") and its uniqueness was a
-- SELECT immediately before the INSERT. There was no UNIQUE constraint on the
-- column, so two receptionists registering at the same moment both passed the
-- check and both wrote the same ID. Production already shows the format drifting
-- as well: alongside 3/25 … 5/25 and 1/26 … 4/26 there is a row reading
-- "test23".
--
-- This mirrors next_discharge_summary_no() and next_lab_order_no(): a per-year
-- counter bumped inside a single INSERT ... ON CONFLICT DO UPDATE, so concurrent
-- writers take a row lock and cannot collide.
--
-- Format is the hospital's existing one, <serial>/<2-digit year>, restarting
-- each calendar year: 5/26, 6/26, ... then 1/27.
--
-- Do not replace this with SELECT max(...) — that races, which is the whole
-- problem being fixed.

CREATE TABLE IF NOT EXISTS public.patient_counters (
  year     integer PRIMARY KEY,
  last_no  integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.patient_counters IS 'Per-year sequence backing next_patient_id(). One row per calendar year.';

-- Seed from the IDs already issued so the counter continues the series rather
-- than restarting it. Rows that do not fit <digits>/<2 digits> — the "test23"
-- kind — are ignored; they were never part of the sequence.
INSERT INTO public.patient_counters (year, last_no)
SELECT 2000 + split_part(patient_id, '/', 2)::integer AS year,
       max(split_part(patient_id, '/', 1)::integer)   AS last_no
  FROM public.patients
 WHERE patient_id ~ '^[0-9]+/[0-9]{2}$'
 GROUP BY 1
ON CONFLICT (year) DO UPDATE
   SET last_no = greatest(public.patient_counters.last_no, excluded.last_no);

CREATE OR REPLACE FUNCTION public.next_patient_id()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_year integer := EXTRACT(YEAR FROM now())::integer;
  v_next integer;
BEGIN
  INSERT INTO public.patient_counters AS c (year, last_no)
       VALUES (v_year, 1)
  ON CONFLICT (year)
  DO UPDATE SET last_no = c.last_no + 1
    RETURNING c.last_no INTO v_next;

  RETURN v_next::text || '/' || lpad((v_year % 100)::text, 2, '0');
END;
$$;

COMMENT ON FUNCTION public.next_patient_id() IS 'Returns the next patient ID, e.g. 5/26. Concurrency-safe. Consumes a number — use peek_next_patient_id() for a form prefill.';

-- The form prefills the field so reception can see and override the number.
-- That preview must not burn a number: an abandoned registration would leave a
-- permanent gap in the series.
CREATE OR REPLACE FUNCTION public.peek_next_patient_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT (COALESCE((SELECT last_no
                      FROM public.patient_counters
                     WHERE year = EXTRACT(YEAR FROM now())::integer), 0) + 1)::text
         || '/' || lpad((EXTRACT(YEAR FROM now())::integer % 100)::text, 2, '0');
$$;

COMMENT ON FUNCTION public.peek_next_patient_id() IS 'The number next_patient_id() would return, without consuming it. For prefilling the registration form only — never trust it as the ID actually issued.';

-- The constraint that should have been there all along.
CREATE UNIQUE INDEX IF NOT EXISTS patients_patient_id_key
  ON public.patients (patient_id);
