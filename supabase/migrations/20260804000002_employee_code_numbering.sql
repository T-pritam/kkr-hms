-- Employee registry — employee code issuance
--
-- Staff had no identifier but their name, so two people called Kumar were
-- distinguishable only by a uuid nobody can read out.
--
-- Mirrors next_patient_id() and next_discharge_summary_no(): a per-year counter
-- bumped inside a single INSERT ... ON CONFLICT DO UPDATE, so concurrent
-- writers take a row lock and cannot collide.
--
-- Format: EMP/<2-digit year>/<3 digits>, restarting each calendar year.
--   EMP/26/001, EMP/26/002, ...
--
-- Do not replace this with SELECT max(...) — that races.

CREATE TABLE IF NOT EXISTS public.employee_counters (
  year     integer PRIMARY KEY,
  last_no  integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.employee_counters IS 'Per-year sequence backing next_employee_code(). One row per calendar year.';

-- Give the existing staff codes before the unique index goes on. Numbered in
-- joining order so the series reads like the hiring history, and grouped by the
-- year they joined so the counter below continues rather than restarts.
WITH numbered AS (
  SELECT id,
         EXTRACT(YEAR FROM COALESCE(join_date, created_at::date))::integer AS yr,
         row_number() OVER (
           PARTITION BY EXTRACT(YEAR FROM COALESCE(join_date, created_at::date))
           ORDER BY join_date, created_at, id
         ) AS seq
    FROM public.employees
   WHERE employee_code IS NULL
)
UPDATE public.employees e
   SET employee_code = 'EMP/' || lpad((n.yr % 100)::text, 2, '0')
                              || '/' || lpad(n.seq::text, 3, '0')
  FROM numbered n
 WHERE n.id = e.id;

INSERT INTO public.employee_counters (year, last_no)
SELECT 2000 + split_part(employee_code, '/', 2)::integer AS year,
       max(split_part(employee_code, '/', 3)::integer)   AS last_no
  FROM public.employees
 WHERE employee_code ~ '^EMP/[0-9]{2}/[0-9]+$'
 GROUP BY 1
ON CONFLICT (year) DO UPDATE
   SET last_no = greatest(public.employee_counters.last_no, excluded.last_no);

CREATE OR REPLACE FUNCTION public.next_employee_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_year integer := EXTRACT(YEAR FROM now())::integer;
  v_next integer;
BEGIN
  INSERT INTO public.employee_counters AS c (year, last_no)
       VALUES (v_year, 1)
  ON CONFLICT (year)
  DO UPDATE SET last_no = c.last_no + 1
    RETURNING c.last_no INTO v_next;

  RETURN 'EMP/' || lpad((v_year % 100)::text, 2, '0')
                || '/' || lpad(v_next::text, 3, '0');
END;
$$;

COMMENT ON FUNCTION public.next_employee_code() IS 'Returns the next employee code, e.g. EMP/26/007. Concurrency-safe. Consumes a number — use peek_next_employee_code() for a form prefill.';

-- The form prefills the field so it can be seen and overridden. That preview
-- must not burn a number: an abandoned form would leave a permanent gap.
CREATE OR REPLACE FUNCTION public.peek_next_employee_code()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT 'EMP/' || lpad((EXTRACT(YEAR FROM now())::integer % 100)::text, 2, '0')
                || '/' || lpad((COALESCE((SELECT last_no
                                            FROM public.employee_counters
                                           WHERE year = EXTRACT(YEAR FROM now())::integer), 0) + 1)::text, 3, '0');
$$;

COMMENT ON FUNCTION public.peek_next_employee_code() IS 'The code next_employee_code() would return, without consuming it. For prefilling the form only — never trust it as the code actually issued.';

CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_code_key
  ON public.employees (employee_code);
