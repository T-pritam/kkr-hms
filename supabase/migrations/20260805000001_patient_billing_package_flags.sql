-- patient_billing — missing "included in package" columns
--
-- The billing tab's two "included in package" checkboxes, and
-- lib/recalculate-billing.ts, have always read/written
-- referral_commission_included_in_package and doctor_fees_included_in_package
-- — but neither column ever existed on patient_billing (this table predates
-- the migrations directory). Every PATCH carrying either flag failed with
-- 42703 (column does not exist), which is every "Set Charges" save from the
-- billing tab. The same missing columns also make recalculatePatientBilling
-- fail before it computes anything, freezing total_charges on every existing
-- row, and make GET /api/finances/summary's patient_billing query error,
-- silently zeroing commission/doctor-fee figures for the month.
--
-- See BUGS.md #16 and #23.

ALTER TABLE public.patient_billing
  ADD COLUMN referral_commission_included_in_package boolean NOT NULL DEFAULT false,
  ADD COLUMN doctor_fees_included_in_package         boolean NOT NULL DEFAULT false;
