import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Recalculates patient_billing totals from source tables.
 * Call after any charge, settlement, or billing field mutation.
 *
 * ── On the package flags ────────────────────────────────────────────────────
 *
 * `base_charge` is the agreed all-in price for an admission — a package. The two
 * `*_included_in_package` flags say whether the doctor fees and the referral
 * commission are already inside that figure, and so must not be added on top.
 *
 * A base charge is no longer required. A patient can be billed purely from
 * itemised charges, and when they are there is no package for anything to be
 * "included in" — so both flags are ignored rather than trusted. Reading them
 * literally with no base charge would silently drop the doctor's fees off the
 * bill, because the flag would claim they were covered by a package worth zero.
 *
 * The referral commission is the sharper case. It is money the hospital pays the
 * referrer, and the old formula added it to what the *patient* owed whenever the
 * tick was off. With a package that is a pricing decision: the commission is
 * being recovered from the patient as part of the deal. Without one there is no
 * deal to recover it through, so the commission is a payout only — recorded,
 * listed in Finance, settled as a ledger debit, and not billed to anybody.
 */
export async function recalculatePatientBilling(
  supabase: SupabaseClient,
  billingId: string
) {
  // 1. Get billing record
  const { data: billing, error: billingError } = await supabase
    .from('patient_billing')
    .select('base_charge, referral_commission_amount, referral_commission_included_in_package, doctor_fees_included_in_package')
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
  const doctorFeesIncluded = billing.doctor_fees_included_in_package === true

  // The flags only mean something when there is a package to be inside of.
  const hasPackage = baseCharge > 0

  const doctorFeesOnBill = hasPackage && doctorFeesIncluded ? 0 : totalDoctorFees

  // No package: the commission is a payout to the referrer, not a patient charge.
  const commissionOnBill = hasPackage && !commissionIncluded ? referralCommission : 0

  const totalCharges = baseCharge
    + patientChargesTotal
    + doctorFeesOnBill
    + commissionOnBill

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
