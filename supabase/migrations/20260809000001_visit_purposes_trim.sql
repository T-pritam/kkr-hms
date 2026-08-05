-- Trim the visit purposes down to the two the hospital actually uses
--
-- 20260808000004 seeded six: consultation, follow_up, operation, procedure,
-- emergency, ward_round. In practice only consultation and operation are used —
-- verified against the live database: the other four have zero references in
-- patient_consultations, doctor_visit_settlements, and doctor_fee_schedule (which
-- is itself still empty; nobody has set a rate card yet). A plain DELETE, not a
-- deactivation, because there is nothing for a deactivation to preserve.
--
-- If a purpose is ever needed again, it can be re-added through
-- POST /api/visit-purposes — nothing about this migration closes that door.

DELETE FROM public.visit_purposes
 WHERE code IN ('follow_up', 'procedure', 'emergency', 'ward_round');
