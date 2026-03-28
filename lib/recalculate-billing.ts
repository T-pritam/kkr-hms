import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Recalculates patient_billing totals from source tables.
 * Call after any charge, settlement, or billing field mutation.
 */
export async function recalculatePatientBilling(
  supabase: SupabaseClient,
  billingId: string
) {
  // 1. Get billing record
  const { data: billing, error: billingError } = await supabase
    .from('patient_billing')
    .select('base_charge, referral_commission_amount, referral_commission_included_in_package')
    .eq('id', billingId)
    .single()

  if (billingError || !billing) {
    console.error('recalculatePatientBilling: failed to fetch billing', billingError)
    return
  }

  // 2. SUM patient_charges (amount * qty)
  const { data: charges } = await supabase
    .from('patient_charges')
    .select('amount, qty')
    .eq('patient_billing_id', billingId)

  const patientChargesTotal = charges?.reduce(
    (sum, c) => sum + Number(c.amount) * (Number(c.qty) || 1),
    0
  ) || 0

  // 3. SUM doctor_visit_settlements (total_amount) where not soft-deleted
  const { data: settlements } = await supabase
    .from('doctor_visit_settlements')
    .select('total_amount')
    .eq('patient_billing_id', billingId)
    .is('deleted_at', null)

  const totalDoctorFees = settlements?.reduce(
    (sum, s) => sum + (Number(s.total_amount) || 0),
    0
  ) || 0

  // 4. Calculate total_charges
  const baseCharge = Number(billing.base_charge) || 0
  const referralCommission = Number(billing.referral_commission_amount) || 0
  const commissionIncluded = billing.referral_commission_included_in_package === true

  const totalCharges = baseCharge
    + patientChargesTotal
    + totalDoctorFees
    + (commissionIncluded ? 0 : referralCommission)

  // 5. Update billing record
  const { error: updateError } = await supabase
    .from('patient_billing')
    .update({
      patient_charges_total: patientChargesTotal,
      total_doctor_fees: totalDoctorFees,
      total_charges: totalCharges,
    })
    .eq('id', billingId)

  if (updateError) {
    console.error('recalculatePatientBilling: failed to update billing', updateError)
  }
}
