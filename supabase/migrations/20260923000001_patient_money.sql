-- Patient money (PRD v2, CR-15): payment labels, lab & medicine collection,
-- charges become internal, the base package goes.
--
-- MUST RUN AFTER 20260922000001 (it widens that migration's `kind` column).
--
-- The client's model (2026-09-22):
--   * Charges are for internal knowledge — no finance figure reads them, and
--     there is no balance or "due". The patient's total bill is what they paid.
--   * Every payment carries a label: regular, advance, discharge, misc (picked
--     by the desk), lab, medicine (a lab/medicine charge collected separately),
--     registration (the registration fee).
--   * Only lab and medicine charges ask "included?". Excluded (the default) means
--     the desk collects it now, as its own payment tagged lab/medicine.
--     Included means the patient's regular payments already cover it and
--     nothing extra is collected.
--   * There is no pre-decided amount, so the base package is removed.
--
-- Access control lives in the API. Like every other table here, RLS is off.

-- 1. Payment labels ------------------------------------------------------------

ALTER TABLE public.patient_billing_installments
  DROP CONSTRAINT IF EXISTS pbi_kind_check;

-- Every payment recorded so far is an ordinary one.
UPDATE public.patient_billing_installments SET kind = 'regular' WHERE kind = 'payment';

ALTER TABLE public.patient_billing_installments
  ALTER COLUMN kind SET DEFAULT 'regular';

ALTER TABLE public.patient_billing_installments
  ADD CONSTRAINT pbi_kind_check CHECK (kind IN (
    'regular', 'advance', 'discharge', 'misc', 'lab', 'medicine', 'registration'));

COMMENT ON COLUMN public.patient_billing_installments.kind IS
  'The payment''s label. regular/advance/discharge/misc are picked by the desk; lab/medicine come from a lab or medicine charge collected separately; registration is the registration fee.';

-- 2. A Lab catalogue category ---------------------------------------------------
--
-- Lab charges are the ones in this category; medicine charges are the
-- Pharmacy category. The seeded "Lab Test" item moves here. X-Ray, CT and MRI
-- stay in Diagnostics (the hospital's own) until the client says otherwise.

ALTER TABLE public.charge_items
  DROP CONSTRAINT IF EXISTS charge_items_category_check;

ALTER TABLE public.charge_items
  ADD CONSTRAINT charge_items_category_check CHECK (
    category IN ('room', 'medical', 'diagnostic', 'procedure', 'registration', 'pharmacy', 'lab', 'other'));

UPDATE public.charge_items SET category = 'lab' WHERE lower(code) = 'lab' AND category = 'diagnostic';

-- 3. Lab / medicine: included, to collect, or collected -------------------------

ALTER TABLE public.patient_charges
  ADD COLUMN IF NOT EXISTS lab_medicine_status varchar(20);

ALTER TABLE public.patient_charges
  ADD COLUMN IF NOT EXISTS collected_installment_id uuid
    REFERENCES public.patient_billing_installments(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pc_lab_medicine_status_check') THEN
    ALTER TABLE public.patient_charges
      ADD CONSTRAINT pc_lab_medicine_status_check CHECK (
        lab_medicine_status IS NULL
        OR lab_medicine_status IN ('included', 'to_collect', 'collected'));
  END IF;

  -- "Collected" always points at the payment that collected it. The app resets
  -- the charge before deleting that payment; this refuses a delete that didn't.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pc_collected_has_payment_check') THEN
    ALTER TABLE public.patient_charges
      ADD CONSTRAINT pc_collected_has_payment_check CHECK (
        lab_medicine_status IS DISTINCT FROM 'collected' OR collected_installment_id IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN public.patient_charges.lab_medicine_status IS
  'Lab and medicine charges only. included = covered by the patient''s regular payments; to_collect = to be collected separately; collected = collected as payment collected_installment_id. NULL on every other charge, and on lab/medicine charges written before 20260923000001.';

CREATE INDEX IF NOT EXISTS idx_patient_charges_collected_installment
  ON public.patient_charges (collected_installment_id)
  WHERE collected_installment_id IS NOT NULL;

-- 4. The base package goes ------------------------------------------------------
--
-- A base charge becomes a charge line, "Package (legacy)", so the record of it
-- survives (PRD v2 Q-33 = A). Charges are internal now, so it moves no money.
-- One live bill carried one (₹20,000) on 2026-09-22.

INSERT INTO public.patient_charges (
  patient_billing_id, patient_id, charge_type, description, amount, qty,
  billing_mode, charge_date, created_by, updated_by)
SELECT
  b.id, b.patient_id, 'Package (legacy)',
  'The base package, kept as a line when packages were removed (PRD v2 CR-15)',
  b.base_charge, 1, 'one_time',
  COALESCE(b.joined_date, (b.created_at AT TIME ZONE 'Asia/Kolkata')::date),
  b.created_by, b.created_by
FROM public.patient_billing b
WHERE b.base_charge > 0;

UPDATE public.patient_billing
   SET base_charge = 0,
       doctor_fees_included_in_package = false,
       referral_commission_included_in_package = false
 WHERE base_charge <> 0
    OR doctor_fees_included_in_package
    OR referral_commission_included_in_package;

-- total_charges now means "services used" — the charges alone. Doctor fees stay
-- in total_doctor_fees, where they are the patient's expense, not a charge.
UPDATE public.patient_billing b
   SET patient_charges_total = COALESCE(c.total, 0),
       total_charges = COALESCE(c.total, 0)
  FROM (
    SELECT pb.id, SUM(pc.amount * COALESCE(pc.qty, 1)) AS total
      FROM public.patient_billing pb
      LEFT JOIN public.patient_charges pc ON pc.patient_billing_id = pb.id
     GROUP BY pb.id
  ) c
 WHERE c.id = b.id;
