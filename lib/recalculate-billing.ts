import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Recalculates patient_billing totals from source tables.
 * Call after any charge, settlement, or billing field mutation.
 *
 * ── What the totals mean (PRD v2, CR-15) ─────────────────────────────────────
 *
 * The client's model (2026-09-22): charges are recorded for internal knowledge —
 * what the patient used. They move no money, and nothing is owed against them:
 * there is no balance or "due". The patient's total bill is what they have paid.
 *
 *   patient_charges_total  Σ charges (amount × qty) — "services used"
 *   total_charges          the same figure. It used to be charges + doctor fees
 *                          (+ a base package), which is what made a Balance.
 *   total_doctor_fees      Σ doctor fee rows — the patient's expense, paid out
 *                          of their money, never a charge to them
 *
 * The base package and its "included in package" flags are gone
 * (20260923000001), so nothing here reads them.
 */
export async function recalculatePatientBilling(
  supabase: SupabaseClient,
  billingId: string
) {
  // 1. The bill must exist.
  const { data: billing, error: billingError } = await supabase
    .from('patient_billing')
    .select('id')
    .eq('id', billingId)
    .single()

  if (billingError || !billing) {
    console.error('recalculatePatientBilling: failed to fetch billing', billingError)
    return
  }

  // 2. SUM patient_charges (amount * qty) — services used.
  const { data: charges } = await supabase
    .from('patient_charges')
    .select('amount, qty')
    .eq('patient_billing_id', billingId)

  const patientChargesTotal = charges?.reduce(
    (sum, c) => sum + Number(c.amount) * (Number(c.qty) || 1),
    0
  ) || 0

  // 3. SUM doctor_visit_settlements (total_amount) where not soft-deleted — the
  //    patient's doctor-fee expense.
  const { data: settlements } = await supabase
    .from('doctor_visit_settlements')
    .select('total_amount')
    .eq('patient_billing_id', billingId)
    .is('deleted_at', null)

  const totalDoctorFees = settlements?.reduce(
    (sum, s) => sum + (Number(s.total_amount) || 0),
    0
  ) || 0

  // 4. Update billing record.
  const { error: updateError } = await supabase
    .from('patient_billing')
    .update({
      patient_charges_total: patientChargesTotal,
      total_doctor_fees: totalDoctorFees,
      total_charges: patientChargesTotal,
    })
    .eq('id', billingId)

  if (updateError) {
    console.error('recalculatePatientBilling: failed to update billing', updateError)
  }
}
