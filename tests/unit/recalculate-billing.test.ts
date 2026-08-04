/**
 * lib/recalculate-billing.ts — the single place patient billing totals are derived.
 *
 * Every charge, settlement and billing mutation calls this. It is therefore the most
 * load-bearing function in the money path.
 *
 * `referral_commission_included_in_package` and `doctor_fees_included_in_package` now
 * exist on `patient_billing` (see BUGS.md #16, resolved by
 * supabase/migrations/20260805000001_patient_billing_package_flags.sql) — the function
 * ran unconditionally into a `42703` on its first query before that, returned early, and
 * never wrote a total. The tests that documented that failure are gone; what follows is
 * what the function actually computes now that its query succeeds.
 */

import { describe, it, expect } from 'vitest'
import { recalculatePatientBilling } from '@/lib/recalculate-billing'
import { db, createFakeClient } from '../helpers/fake-supabase'
import { aBilling, aCharge, aSettlement } from '../helpers/seed'

const supabase = () => createFakeClient(db) as any
const billingRow = (id = 'b1') => db.find('patient_billing', (r) => r.id === id)!

describe('recalculatePatientBilling — schema contract', () => {
  it('reads the billing row cleanly — both package-flag columns exist', async () => {
    aBilling({ id: 'b1', base_charge: 5000 })

    const { error } = await supabase()
      .from('patient_billing')
      .select(
        'base_charge, referral_commission_amount, referral_commission_included_in_package, doctor_fees_included_in_package'
      )
      .eq('id', 'b1')
      .single()

    expect(error).toBeNull()
  })

  it('does not throw, so callers see a silent no-op rather than a 500', async () => {
    aBilling({ id: 'b1' })
    await expect(recalculatePatientBilling(supabase(), 'b1')).resolves.toBeUndefined()
  })

  it('is equally silent for a billing id that does not exist', async () => {
    await expect(recalculatePatientBilling(supabase(), 'missing')).resolves.toBeUndefined()
  })
})

describe('recalculatePatientBilling — intended totals', () => {
  it('sums charges as amount × qty', async () => {
    aBilling({ id: 'b1', base_charge: 0 })
    aCharge({ patient_billing_id: 'b1', amount: 500, qty: 3 })
    aCharge({ patient_billing_id: 'b1', amount: 200, qty: 1 })

    await recalculatePatientBilling(supabase(), 'b1')

    expect(Number(billingRow().patient_charges_total)).toBe(1700)
  })

  it('treats a null qty as 1', async () => {
    aBilling({ id: 'b1' })
    aCharge({ patient_billing_id: 'b1', amount: 500, qty: null })

    await recalculatePatientBilling(supabase(), 'b1')

    expect(Number(billingRow().patient_charges_total)).toBe(500)
  })

  it('sums doctor fees from non-deleted settlements only', async () => {
    aBilling({ id: 'b1' })
    aSettlement({ patient_billing_id: 'b1', total_amount: 4500 })
    aSettlement({ patient_billing_id: 'b1', total_amount: 2000 })
    aSettlement({ patient_billing_id: 'b1', total_amount: 9999, deleted_at: '2026-03-01T00:00:00.000Z' })

    await recalculatePatientBilling(supabase(), 'b1')

    expect(Number(billingRow().total_doctor_fees)).toBe(6500)
  })

  it('adds base charge, charges, doctor fees and commission into total_charges', async () => {
    aBilling({ id: 'b1', base_charge: 20000, referral_commission_amount: 3000 })
    aCharge({ patient_billing_id: 'b1', amount: 1000, qty: 2 })
    aSettlement({ patient_billing_id: 'b1', total_amount: 6500 })

    await recalculatePatientBilling(supabase(), 'b1')

    expect(Number(billingRow().total_charges)).toBe(31500)
  })

  it('ignores charges and settlements belonging to another billing cycle', async () => {
    aBilling({ id: 'b1', base_charge: 500 })
    aBilling({ id: 'b2', base_charge: 0 })
    aCharge({ patient_billing_id: 'b1', amount: 100, qty: 1 })
    aCharge({ patient_billing_id: 'b2', amount: 9999, qty: 1 })
    aSettlement({ patient_billing_id: 'b2', total_amount: 8888 })

    await recalculatePatientBilling(supabase(), 'b1')

    expect(Number(billingRow().total_charges)).toBe(600)
  })

  it('clears stale totals when everything attached has been removed', async () => {
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

  it('treats a settlement with a null total_amount as zero', async () => {
    aBilling({ id: 'b1', base_charge: 1000 })
    aSettlement({ patient_billing_id: 'b1', total_amount: null })

    await recalculatePatientBilling(supabase(), 'b1')

    expect(Number(billingRow().total_charges)).toBe(1000)
  })
})
