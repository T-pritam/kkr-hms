-- Lab / Pathology rebuild — order number generation
--
-- Nothing in this application generates identifiers today: patients.patient_id
-- is typed by hand (e.g. '1/25') and merely checked for uniqueness. Lab orders
-- need a real accession number, so this introduces the first generator.
--
-- Format: LAB/<year>/<5-digit sequence>, restarting each calendar year.
--   LAB/2026/00001, LAB/2026/00002, ...
--
-- The counter is bumped inside a single INSERT ... ON CONFLICT DO UPDATE, so
-- concurrent orders take a row lock and cannot collide. Do not replace this
-- with SELECT max(order_no) — that races.

CREATE TABLE IF NOT EXISTS public.lab_order_counters (
  year     integer PRIMARY KEY,
  last_no  integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.lab_order_counters IS 'Per-year sequence backing next_lab_order_no(). One row per calendar year.';

CREATE OR REPLACE FUNCTION public.next_lab_order_no()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_year integer := EXTRACT(YEAR FROM now())::integer;
  v_next integer;
BEGIN
  INSERT INTO public.lab_order_counters AS c (year, last_no)
       VALUES (v_year, 1)
  ON CONFLICT (year)
  DO UPDATE SET last_no = c.last_no + 1
    RETURNING c.last_no INTO v_next;

  RETURN 'LAB/' || v_year || '/' || lpad(v_next::text, 5, '0');
END;
$$;

COMMENT ON FUNCTION public.next_lab_order_no() IS 'Returns the next lab accession number, e.g. LAB/2026/00184. Concurrency-safe.';
