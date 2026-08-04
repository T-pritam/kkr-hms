-- doctor_visit_settlements.total_amount — repair rows frozen at null
--
-- PUT /api/doctor-settlements/[settlementId] computed amount_per_visit/visit_count
-- but never wrote total_amount, and the sync route creates rows without it at
-- all — so it stayed null forever for anything priced through the normal UI
-- flow (BUGS.md #26). The route now keeps it in sync going forward; this
-- repairs whatever it left behind.

UPDATE public.doctor_visit_settlements
SET total_amount = COALESCE(amount_per_visit, 0) * COALESCE(visit_count, 0)
WHERE total_amount IS NULL;
