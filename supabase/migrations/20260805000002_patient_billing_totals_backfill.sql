-- patient_billing — repair totals frozen by the missing package-flag columns
--
-- recalculatePatientBilling() has failed at its first query since this table
-- existed (the two columns added in 20260805000001 didn't exist yet), so
-- patient_charges_total, total_doctor_fees and total_charges on every row
-- predate whatever charges/settlements were recorded after billing creation.
-- One-time repair, same formula as lib/recalculate-billing.ts; the app keeps
-- them current from here on.

UPDATE public.patient_billing pb SET
  patient_charges_total = COALESCE(
    (SELECT SUM(amount * COALESCE(qty, 1)) FROM patient_charges WHERE patient_billing_id = pb.id), 0
  ),
  total_doctor_fees = COALESCE(
    (SELECT SUM(total_amount) FROM doctor_visit_settlements WHERE patient_billing_id = pb.id AND deleted_at IS NULL), 0
  ),
  total_charges = COALESCE(pb.base_charge, 0)
    + COALESCE(
        (SELECT SUM(amount * COALESCE(qty, 1)) FROM patient_charges WHERE patient_billing_id = pb.id), 0
      )
    + CASE WHEN pb.doctor_fees_included_in_package THEN 0
        ELSE COALESCE(
          (SELECT SUM(total_amount) FROM doctor_visit_settlements WHERE patient_billing_id = pb.id AND deleted_at IS NULL), 0
        )
      END
    + CASE WHEN pb.referral_commission_included_in_package THEN 0
        ELSE COALESCE(pb.referral_commission_amount, 0)
      END;
