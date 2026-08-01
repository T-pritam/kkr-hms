-- Lab / Pathology rebuild — backfill from the legacy tables
--
-- Moves the existing data into the new model:
--   test_parameters (legacy min/max + male/female columns) → test_parameter_ranges
--   patient_test_results  → lab_orders + lab_order_items
--   test_result_values    → lab_result_values
--
-- The legacy tables are NOT dropped. Rename them to *_legacy only once the new
-- module has been signed off in production.
--
-- Both halves are guarded so re-running is a no-op.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Reference intervals
-- ─────────────────────────────────────────────────────────────────────────────

-- Gender-neutral fallback interval.
INSERT INTO public.test_parameter_ranges
  (parameter_id, gender, range_type, min_value, max_value, display_order)
SELECT p.id, NULL, 'between', p.min_value, p.max_value, 0
FROM public.test_parameters p
WHERE p.min_value IS NOT NULL
  AND p.max_value IS NOT NULL
  AND p.min_value <= p.max_value
  AND NOT EXISTS (
    SELECT 1 FROM public.test_parameter_ranges r
    WHERE r.parameter_id = p.id AND r.gender IS NULL
  );

-- Male interval.
INSERT INTO public.test_parameter_ranges
  (parameter_id, gender, range_type, min_value, max_value, display_order)
SELECT p.id, 'male', 'between', p.male_min, p.male_max, 1
FROM public.test_parameters p
WHERE p.gender_specific IS TRUE
  AND p.male_min IS NOT NULL
  AND p.male_max IS NOT NULL
  AND p.male_min <= p.male_max
  AND NOT EXISTS (
    SELECT 1 FROM public.test_parameter_ranges r
    WHERE r.parameter_id = p.id AND lower(r.gender) = 'male'
  );

-- Female interval.
INSERT INTO public.test_parameter_ranges
  (parameter_id, gender, range_type, min_value, max_value, display_order)
SELECT p.id, 'female', 'between', p.female_min, p.female_max, 2
FROM public.test_parameters p
WHERE p.gender_specific IS TRUE
  AND p.female_min IS NOT NULL
  AND p.female_max IS NOT NULL
  AND p.female_min <= p.female_max
  AND NOT EXISTS (
    SELECT 1 FROM public.test_parameter_ranges r
    WHERE r.parameter_id = p.id AND lower(r.gender) = 'female'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Orders, items and values
--
-- Row-at-a-time on purpose: the live volume is 3 orders / 2 values, and the
-- explicit loop keeps the old→new mapping legible.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r           record;
  v_order_id  uuid;
  v_item_id   uuid;
  v_order_no  text;
  v_seq       integer;
  v_year      integer;
BEGIN
  -- Guard: only backfill into an empty table.
  IF EXISTS (SELECT 1 FROM public.lab_orders) THEN
    RAISE NOTICE 'lab_orders is not empty — skipping backfill.';
    RETURN;
  END IF;

  FOR r IN
    SELECT ptr.*,
           lt.name        AS t_name,
           lt.code        AS t_code,
           lt.category    AS t_category,
           lt.sample_type AS t_specimen,
           lt.method      AS t_method,
           pt.patient_id  AS p_display_id,
           pt.status      AS p_status,
           u.username     AS ref_doctor_name
    FROM public.patient_test_results ptr
    JOIN public.lab_tests lt ON lt.id = ptr.test_id
    LEFT JOIN public.patients pt ON pt.id = ptr.patient_id
    LEFT JOIN public.users u     ON u.id  = ptr.reference_doctor_id
    ORDER BY ptr.test_date, ptr.created_at, ptr.id
  LOOP
    v_year := EXTRACT(YEAR FROM r.test_date)::integer;

    -- Advance (and if necessary create) that year's counter so the legacy
    -- numbers and all future numbers share one sequence.
    INSERT INTO public.lab_order_counters AS c (year, last_no)
         VALUES (v_year, 1)
    ON CONFLICT (year) DO UPDATE SET last_no = c.last_no + 1
      RETURNING c.last_no INTO v_seq;

    v_order_no := 'LAB/' || v_year || '/' || lpad(v_seq::text, 5, '0');

    INSERT INTO public.lab_orders (
      order_no, patient_id,
      patient_name, patient_phone, patient_age, patient_gender,
      patient_display_id, patient_status,
      referring_doctor_id, referring_doctor_name,
      priority, status,
      registered_at, collected_at, received_at, reported_at,
      created_by,
      total_amount, discount, net_amount,
      notes, created_at
    ) VALUES (
      v_order_no,
      r.patient_id,
      COALESCE(NULLIF(btrim(r.patient_name), ''), 'Unknown'),
      r.patient_phone,
      r.patient_age,
      r.patient_gender,
      r.p_display_id,
      r.p_status,
      NULL,                    -- old FK pointed at users, not doctors — cannot map
      r.ref_doctor_name,       -- preserved as free text instead
      'routine',
      CASE r.status
        WHEN 'pending'    THEN 'registered'
        WHEN 'collected'  THEN 'collected'
        WHEN 'processing' THEN 'in_progress'
        WHEN 'completed'  THEN 'reported'
        WHEN 'verified'   THEN 'reported'
        WHEN 'cancelled'  THEN 'cancelled'
        ELSE 'registered'
      END,
      COALESCE(r.created_at::timestamptz, r.test_date::timestamptz),
      r.sample_collected_at::timestamptz,
      r.sample_collected_at::timestamptz,   -- legacy had no separate receipt time
      r.result_issued_at::timestamptz,
      r.conducted_by,
      COALESCE(r.price, 0),
      COALESCE(r.discount, 0),
      COALESCE(r.final_price, COALESCE(r.price, 0) - COALESCE(r.discount, 0)),
      r.notes,
      COALESCE(r.created_at::timestamptz, now())
    )
    RETURNING id INTO v_order_id;

    INSERT INTO public.lab_order_items (
      order_id, test_id, test_name, test_code, category, specimen, method,
      price, status, entered_by, entered_at, authorised_by, authorised_at,
      display_order, created_at
    ) VALUES (
      v_order_id, r.test_id, r.t_name, r.t_code, r.t_category, r.t_specimen, r.t_method,
      COALESCE(r.price, 0),
      CASE r.status
        WHEN 'completed' THEN 'results_entered'
        WHEN 'verified'  THEN 'authorised'
        WHEN 'cancelled' THEN 'cancelled'
        ELSE 'pending'
      END,
      r.conducted_by,
      CASE WHEN r.conducted_by IS NOT NULL THEN r.updated_at::timestamptz END,
      r.verified_by,
      CASE WHEN r.verified_by IS NOT NULL THEN r.result_issued_at::timestamptz END,
      0,
      COALESCE(r.created_at::timestamptz, now())
    )
    RETURNING id INTO v_item_id;

    -- Values for this result.
    INSERT INTO public.lab_result_values (
      order_item_id, parameter_id, value, text_value,
      unit, ref_display, ref_min, ref_max, abnormal, is_critical, notes, created_at
    )
    SELECT
      v_item_id,
      trv.parameter_id,
      trv.value,
      trv.text_value,
      trv.unit,
      CASE
        WHEN trv.ref_min IS NOT NULL AND trv.ref_max IS NOT NULL
          THEN trv.ref_min::text || ' - ' || trv.ref_max::text
        ELSE NULL
      END,
      trv.ref_min,
      trv.ref_max,
      -- Recompute direction from the value where possible. The legacy `flag`
      -- column overwrote 'low'/'high' with 'critical', losing the direction.
      CASE
        WHEN trv.value IS NULL THEN NULL
        WHEN trv.ref_min IS NOT NULL AND trv.value < trv.ref_min THEN 'L'
        WHEN trv.ref_max IS NOT NULL AND trv.value > trv.ref_max THEN 'H'
        WHEN trv.flag = 'low'  THEN 'L'
        WHEN trv.flag = 'high' THEN 'H'
        ELSE NULL
      END,
      COALESCE(trv.flag = 'critical', false),
      trv.notes,
      COALESCE(trv.created_at::timestamptz, now())
    FROM public.test_result_values trv
    WHERE trv.result_id = r.id;
  END LOOP;

  RAISE NOTICE 'Lab backfill complete: % order(s).', (SELECT count(*) FROM public.lab_orders);
END $$;
