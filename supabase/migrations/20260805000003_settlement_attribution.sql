-- Settlement attribution — "Given by" for doctor visit and referral commission settlements
--
-- Advances already have given_by (who physically handed over the cash), rendered
-- alongside created_by_user/updated_by_user via <UpdatedStamp>. Neither doctor
-- visit settlements nor the referral commission settlement (on patient_billing)
-- have an equivalent column — adding both so the billing tab can show "given by"
-- and "recorded/updated by" for both settlement types, same convention.

ALTER TABLE public.doctor_visit_settlements ADD COLUMN given_by varchar(255);
ALTER TABLE public.patient_billing ADD COLUMN referral_settlement_given_by varchar(255);
