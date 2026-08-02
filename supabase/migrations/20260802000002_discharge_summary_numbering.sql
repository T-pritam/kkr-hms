-- Case Sheet rebuild — discharge summary numbering
--
-- A printed discharge summary needs a reference anyone can quote back over the
-- phone. This mirrors next_lab_order_no() exactly: a per-year counter bumped
-- inside a single INSERT ... ON CONFLICT DO UPDATE, so concurrent writers take
-- a row lock and cannot collide.
--
-- Format: DS/<year>/<5-digit sequence>, restarting each calendar year.
--   DS/2026/00001, DS/2026/00002, ...
--
-- Do not replace this with SELECT max(summary_no) — that races.

CREATE TABLE IF NOT EXISTS public.case_sheet_counters (
  year     integer PRIMARY KEY,
  last_no  integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.case_sheet_counters IS 'Per-year sequence backing next_discharge_summary_no(). One row per calendar year.';

CREATE OR REPLACE FUNCTION public.next_discharge_summary_no()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_year integer := EXTRACT(YEAR FROM now())::integer;
  v_next integer;
BEGIN
  INSERT INTO public.case_sheet_counters AS c (year, last_no)
       VALUES (v_year, 1)
  ON CONFLICT (year)
  DO UPDATE SET last_no = c.last_no + 1
    RETURNING c.last_no INTO v_next;

  RETURN 'DS/' || v_year || '/' || lpad(v_next::text, 5, '0');
END;
$$;

COMMENT ON FUNCTION public.next_discharge_summary_no() IS 'Returns the next discharge summary number, e.g. DS/2026/00012. Concurrency-safe.';
