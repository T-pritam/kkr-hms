/**
 * lib/recalculate-billing.ts — the single place patient billing totals are derived.
 *
 * Every charge, settlement and billing mutation calls this. It is therefore the most
 * load-bearing function in the money path.
 *
 * ⚠️ It is currently broken against the live schema — see BUGS.md #16. It selects
 * `referral_commission_included_in_package` and `doctor_fees_included_in_package`, and
 * `patient_billing` has neither column, so the first query errors, the function returns
 * early, and no total is ever written. The tests below are grouped accordingly: the ones
 * describing what it *should* compute are marked as expected failures.
 */

import { describe, it, expect } from 'vitest'
import { recalculatePatientBilling } from '@/lib/recalculate-billing'
import { db, createFakeClient } from '../helpers/fake-supabase'
import { aBilling, aCharge, aSettlement } from '../helpers/seed'

const supabase = () => createFakeClient(db) as any
const billingRow = (id = 'b1') => db.find('patient_billing', (r) => r.id === id)!

describe('recalculatePatientBilling — schema contract', () => {
  it('fails to read the billing row because two selected columns do not exist', async () => {
    aBilling({ id: 'b1', base_charge: 5000 })

    const { error } = await supabase()
      .from('patient_billing')
      .select(
        'base_charge, referral_commission_amount, referral_commission_included_in_package, doctor_fees_included_in_package'
      )
      .eq('id', 'b1')
      .single()

    expect(error).toMatchObject({ code: '42703' })
    expect(error.message).toContain('referral_commission_included_in_package')
  })

  it('writes nothing at all — the error is swallowed and the function returns', async () => {
    aBilling({ id: 'b1', base_charge: 5000, total_charges: 0, patient_charges_total: 0 })
    aCharge({ patient_billing_id: 'b1', amount: 1200, qty: 1 })

    await recalculatePatientBilling(supabase(), 'b1')

    expect(billingRow()).toMatchObject({ total_charges: 0, patient_charges_total: 0 })
  })

  it('does not throw, so callers see a silent no-op rather than a 500', async () => {
    aBilling({ id: 'b1' })
    await expect(recalculatePatientBilling(supabase(), 'b1')).resolves.toBeUndefined()
  })

  it('is equally silent for a billing id that does not exist', async () => {
    await expect(recalculatePatientBilling(supabase(), 'missing')).resolves.toBeUndefined()
  })
})

describe('recalculatePatientBilling — intended totals (blocked by BUGS.md #16)', () => {
  it.fails('sums charges as amount × qty', async () => {
    aBilling({ id: 'b1', base_charge: 0 })
    aCharge({ patient_billing_id: 'b1', amount: 500, qty: 3 })
    aCharge({ patient_billing_id: 'b1', amount: 200, qty: 1 })

    await recalculatePatientBilling(supabase(), 'b1')

    expect(Number(billingRow().patient_charges_total)).toBe(1700)
  })

  it.fails('treats a null qty as 1', async () => {
    aBilling({ id: 'b1' })
    aCharge({ patient_billing_id: 'b1', amount: 500, qty: null })

    await recalculatePatientBilling(supabase(), 'b1')

    expect(Number(billingRow().patient_charges_total)).toBe(500)
  })

  it.fails('sums doctor fees from non-deleted settlements only', async () => {
    aBilling({ id: 'b1' })
    aSettlement({ patient_billing_id: 'b1', total_amount: 4500 })
    aSettlement({ patient_billing_id: 'b1', total_amount: 2000 })
    aSettlement({ patient_billing_id: 'b1', total_amount: 9999, deleted_at: '2026-03-01T00:00:00.000Z' })

    await recalculatePatientBilling(supabase(), 'b1')

    expect(Number(billingRow().total_doctor_fees)).toBe(6500)
  })

  it.fails('adds base charge, charges, doctor fees and commission into total_charges', async () => {
    aBilling({ id: 'b1', base_charge: 20000, referral_commission_amount: 3000 })
    aCharge({ patient_billing_id: 'b1', amount: 1000, qty: 2 })
    aSettlement({ patient_billing_id: 'b1', total_amount: 6500 })

    await recalculatePatientBilling(supabase(), 'b1')

    expect(Number(billingRow().total_charges)).toBe(31500)
  })

  it.fails('ignores charges and settlements belonging to another billing cycle', async () => {
    aBilling({ id: 'b1', base_charge: 500 })
    aBilling({ id: 'b2', base_charge: 0 })
    aCharge({ patient_billing_id: 'b1', amount: 100, qty: 1 })
    aCharge({ patient_billing_id: 'b2', amount: 9999, qty: 1 })
    aSettlement({ patient_billing_id: 'b2', total_amount: 8888 })

    await recalculatePatientBilling(supabase(), 'b1')

    expect(Number(billingRow().total_charges)).toBe(600)
  })

  it.fails('clears stale totals when everything attached has been removed', async () => {
    // The state left behind after the last charge on a billing record is deleted.
    aBilling({
      id: 'b1',
      base_charge: 0,
      referral_commission_amount: 0,
      patient_charges_total: 4500,
      total_doctor_fees: 2000,
      total_charges: 6500,
    })

    await recalculatePatientBilling(supabase(), 'b1')

    expect(billingRow()).toMatchObject({
      patient_charges_total: 0,
      total_doctor_fees: 0,
      total_charges: 0,
    })
  })

  it.fails('treats a settlement with a null total_amount as zero', async () => {
    aBilling({ id: 'b1', base_charge: 1000 })
    aSettlement({ patient_billing_id: 'b1', total_amount: null })

    await recalculatePatientBilling(supabase(), 'b1')

    expect(Number(billingRow().total_charges)).toBe(1000)
  })
})
