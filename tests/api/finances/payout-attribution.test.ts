/**
 * Who paid, who carried the cash, and who changed what — on a doctor fee or a
 * referral commission (PRD v2 CR-13, as revised 2026-09-24).
 *
 * A payout writes no ledger entry any more, so the settlement row is the only
 * record that the money left at all. The client asked for the name against
 * each of the three fields that matter: *"keep the name who changed 3 of the
 * most important fields like amount, status and given by only"*.
 *
 * `GET /api/users` fills the "Handed over by" picker. It shipped reading an
 * `is_active` column that `users` does not have, so the picker was empty in
 * production — the first describe block is the test that would have caught it.
 */

import { describe, it, expect } from 'vitest'
import { GET as listUsers } from '@/app/api/users/route'
import { PATCH as updateBilling } from '@/app/api/patients/[id]/billing/route'
import { PUT as priceFee } from '@/app/api/doctor-settlements/[settlementId]/route'
import { validatePayout } from '@/lib/billing/payouts'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aBilling, aPatient, aSettlement, aUser } from '../../helpers/seed'
import { NOW } from '../../setup'

const users = () => call(listUsers, 'GET', '/api/users')
const updateBill = (body: unknown) =>
  call(updateBilling, 'PATCH', '/api/patients/p1/billing', { body, params: { id: 'p1' } })
const putFee = (id: string, body: unknown) =>
  call(priceFee, 'PUT', `/api/doctor-settlements/${id}`, { body, params: { settlementId: id } })

const bill = () => db.find('patient_billing', (r) => r.id === 'b1')!
const fee = (id: string) => db.find('doctor_visit_settlements', (r) => r.id === id)!

describe('GET /api/users — the "Handed over by" picker', () => {
  it('needs a session', async () => {
    signOut()
    expect((await users()).status).toBe(401)
  })

  // Whoever may pay one out may name who carried it (payout:write, Q-19).
  it.each(['ADMIN', 'RECEPTIONIST'] as const)('lets %s list the names', async (role) => {
    await signInAs(role)
    expect((await users()).status).toBe(200)
  })

  it.each(['DOCTOR', 'NURSE', 'LAB_TECHNICIAN'] as const)('refuses %s, who cannot pay out', async (role) => {
    await signInAs(role)
    expect((await users()).status).toBe(403)
  })

  it('lists active users by name, admins and reception alike', async () => {
    await signInAs('RECEPTIONIST')
    aUser({ id: 'u2', username: 'ravi', role: 'RECEPTIONIST' })
    aUser({ id: 'u1', username: 'asha', role: 'ADMIN' })
    aUser({ id: 'u3', username: 'gone', role: 'RECEPTIONIST', status: 'INACTIVE' })

    const { status, body } = await users()

    expect(status).toBe(200)
    expect(body.users).toEqual([
      { id: 'u1', username: 'asha', role: 'ADMIN' },
      { id: 'u2', username: 'ravi', role: 'RECEPTIONIST' },
    ])
  })

  // Reception cannot see the user register (§3.2), so this returns only what
  // a picker needs to show a name.
  it('returns a name and a role, and nothing a picker has no use for', async () => {
    await signInAs('RECEPTIONIST')
    aUser({ id: 'u1', username: 'asha', role: 'ADMIN' })

    const [only] = (await users()).body.users

    expect(Object.keys(only).sort()).toEqual(['id', 'role', 'username'])
  })
})

describe('validatePayout — given by', () => {
  it('keeps a picked user, and drops a typed name sent beside it', () => {
    const result = validatePayout({ payment_method: 'cash', given_by_user_id: 'u2', given_by: 'Ravi' })

    expect(result.ok && result.value).toMatchObject({ given_by_user_id: 'u2', given_by: null })
  })

  it('keeps a typed name when no user is picked', () => {
    const result = validatePayout({ payment_method: 'cash', given_by: '  Ravi (ward boy)  ' })

    expect(result.ok && result.value).toMatchObject({ given_by_user_id: null, given_by: 'Ravi (ward boy)' })
  })

  it('leaves both empty when nothing is said, for the payout to default', () => {
    const result = validatePayout({ payment_method: 'cash' })

    expect(result.ok && result.value).toMatchObject({ given_by_user_id: null, given_by: null })
  })
})

describe("a commission paid from the patient's Billing tab", () => {
  function aBillWithCommission(settled = false) {
    aPatient({ id: 'p1' })
    aBilling({
      id: 'b1',
      patient_id: 'p1',
      referral_commission_amount: 2000,
      referral_settled: settled,
      referral_settlement_date: settled ? '2026-03-10T06:00:00.000Z' : null,
    })
  }

  it('records the payer as the one who carried it, unless told otherwise', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aBillWithCommission()

    const { status } = await updateBill({
      billing_id: 'b1',
      referral_settled: true,
      referral_settlement_payment_method: 'cash',
    })

    expect(status).toBe(200)
    expect(bill()).toMatchObject({
      referral_settled: true,
      referral_status_set_by: 'u-recep',
      referral_status_set_at: NOW.toISOString(),
      referral_given_by_user_id: 'u-recep',
      referral_given_by_set_by: 'u-recep',
    })
    expect(db.count('daily_ledger_transactions')).toBe(0)
  })

  it('records a different user as having carried it', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aBillWithCommission()

    await updateBill({
      billing_id: 'b1',
      referral_settled: true,
      referral_settlement_payment_method: 'cash',
      referral_given_by_user_id: 'u-admin',
    })

    expect(bill()).toMatchObject({
      referral_given_by_user_id: 'u-admin',
      // …and who says so, which is a different fact.
      referral_given_by_set_by: 'u-recep',
    })
  })

  it('records a typed name for someone with no login', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aBillWithCommission()

    await updateBill({
      billing_id: 'b1',
      referral_settled: true,
      referral_settlement_payment_method: 'cash',
      referral_settlement_given_by: 'Ravi (ward boy)',
    })

    expect(bill()).toMatchObject({
      referral_settlement_given_by: 'Ravi (ward boy)',
      referral_given_by_user_id: null,
    })
  })

  /**
   * "Who un-paid this?" had no answer before: nothing recorded who changed a
   * commission's status. Un-paying stamps the status and clears the carrier —
   * nobody handed anything over any more.
   */
  it('says who un-paid it, and forgets who carried it', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aBillWithCommission(true)
    db.patchRow('patient_billing', (r) => r.id === 'b1', {
      referral_given_by_user_id: 'u-recep',
      referral_status_set_by: 'u-recep',
    })

    const { status } = await updateBill({ billing_id: 'b1', referral_settled: false })

    expect(status).toBe(200)
    expect(bill()).toMatchObject({
      referral_settled: false,
      referral_settlement_date: null,
      referral_status_set_by: 'u-admin',
      referral_given_by_user_id: null,
      referral_settlement_given_by: null,
    })
  })

  it('stamps who changed the amount, and when', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aBillWithCommission()

    await updateBill({ billing_id: 'b1', referral_commission_amount: 2500 })

    expect(bill()).toMatchObject({
      referral_commission_amount: 2500,
      referral_commission_set_by: 'u-recep',
      referral_commission_set_at: NOW.toISOString(),
    })
  })

  // Changing who carried an already-settled commission is its own act, stamped
  // with its own name — not folded into "last edited by".
  it('lets an admin correct who carried a settled commission', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aBillWithCommission(true)

    await updateBill({
      billing_id: 'b1',
      referral_settlement_given_by: '',
      referral_given_by_user_id: 'u-recep',
    })

    expect(bill()).toMatchObject({
      referral_settled: true,
      referral_given_by_user_id: 'u-recep',
      referral_given_by_set_by: 'u-admin',
    })
  })
})

describe('a doctor fee — the stamps on each change', () => {
  it('stamps who priced it, and when', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aSettlement({ id: 's1', visit_count: 2, amount_per_visit: 0, settled: false })

    await putFee('s1', { pricing_mode: 'per_visit', amount_per_visit: 1000 })

    expect(fee('s1')).toMatchObject({ total_amount: 2000, amount_set_by: 'u-recep' })
  })

  it('stamps who paid it, and when, and defaults the carrier to them', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aSettlement({ id: 's1', visit_count: 1, amount_per_visit: 500, total_amount: 500, settled: false })

    await putFee('s1', { settled: true, payment_method: 'cash' })

    expect(fee('s1')).toMatchObject({
      settled: true,
      settled_by: 'u-recep',
      status_set_by: 'u-recep',
      status_set_at: NOW.toISOString(),
      given_by_user_id: 'u-recep',
      given_by_set_by: 'u-recep',
      given_by_set_at: NOW.toISOString(),
    })
  })

  it('records a different carrier on the patient-tab path too', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aSettlement({ id: 's1', visit_count: 1, amount_per_visit: 500, total_amount: 500, settled: false })

    await putFee('s1', { settled: true, payment_method: 'cash', given_by_user_id: 'u-admin' })

    expect(fee('s1')).toMatchObject({ given_by_user_id: 'u-admin', given_by_set_by: 'u-recep' })
  })
})

/**
 * Q-88: once settled, a fee or a commission is the admin's alone — *"reception
 * can do nothing, not even un-settle"*. The guards used to watch only the
 * price and the paid flag, so everything else on a settled payout was still
 * writable by the desk. Each field is checked here on its own, because a guard
 * that forgets one field is exactly how this was missed.
 */
describe('Q-88 — a settled payout is the admin’s alone, every field of it', () => {
  function aSettledCommission() {
    aPatient({ id: 'p1' })
    aBilling({
      id: 'b1', patient_id: 'p1',
      referral_commission_amount: 2000, referral_settled: true,
      referral_settlement_date: '2026-03-10T06:00:00.000Z',
      referral_settlement_notes: 'March', referral_settlement_payment_method: 'cash',
      referral_transaction_ref: null, referral_given_by_user_id: 'u-admin', referral_settlement_given_by: null,
    })
  }

  it.each([
    ['who carried it', { referral_given_by_user_id: 'u-recep' }],
    ['a typed carrier', { referral_settlement_given_by: 'Someone else' }],
    ['the notes', { referral_settlement_notes: 'changed' }],
    ['the payment mode', { referral_settlement_payment_method: 'upi' }],
    ['the reference', { referral_settlement_transaction_ref: 'REF-9' }],
    ['the date paid', { referral_settlement_date: '2026-03-01T06:00:00.000Z' }],
  ])('refuses reception changing %s on a settled commission', async (_what, change) => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aSettledCommission()
    const before = { ...bill() }

    const { status, body } = await updateBill({ billing_id: 'b1', ...change })

    expect(status).toBe(403)
    expect(body.code).toBe('ADMIN_ONLY')
    expect(bill()).toMatchObject(before)
  })

  // The dialog resends every field on save. Resending a value unchanged is not
  // a change, and must not be refused.
  it('lets reception resend a settled commission’s values unchanged', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aSettledCommission()

    const { status } = await updateBill({
      billing_id: 'b1',
      referral_settlement_notes: 'March',
      referral_settlement_payment_method: 'cash',
      referral_given_by_user_id: 'u-admin',
    })

    expect(status).toBe(200)
  })

  function aSettledFee() {
    aSettlement({
      id: 's1', visit_count: 1, amount_per_visit: 500, total_amount: 500,
      settled: true, settlement_amount: 500, settlement_date: '2026-03-10T06:00:00.000Z',
      payment_method: 'cash', transaction_reference: null, settlement_notes: 'paid',
      given_by_user_id: 'u-admin', given_by: null, settlement_type: 'regular',
    })
  }

  it.each([
    ['the amount paid', { settlement_amount: 400 }],
    ['who carried it', { given_by_user_id: 'u-recep' }],
    ['a typed carrier', { given_by: 'Someone else' }],
    ['the notes', { settlement_notes: 'changed' }],
    ['the payment mode', { payment_method: 'upi' }],
    ['the reference', { transaction_reference: 'REF-9' }],
    ['the settlement type', { settlement_type: 'advance' }],
  ])('refuses reception changing %s on a settled fee', async (_what, change) => {
    await signInAs('RECEPTIONIST', { userId: 'u-recep' })
    aSettledFee()
    const before = { ...fee('s1') }

    const { status, body } = await putFee('s1', change)

    expect(status).toBe(403)
    expect(body.code).toBe('ADMIN_ONLY')
    expect(fee('s1')).toMatchObject(before)
  })

  it('lets an admin restate a settled fee’s amount, keeping both columns and the stamp in step', async () => {
    await signInAs('ADMIN', { userId: 'u-admin' })
    aSettledFee()

    const { status } = await putFee('s1', { settlement_amount: 450 })

    expect(status).toBe(200)
    expect(fee('s1')).toMatchObject({
      settled: true,
      settlement_amount: 450,
      total_amount: 450,
      amount_set_by: 'u-admin',
      amount_set_at: NOW.toISOString(),
    })
  })

  it('lets an admin correct who carried a settled fee, with its own stamp', async () => {
    await signInAs('ADMIN', { userId: 'u-admin2' })
    aSettledFee()

    const { status } = await putFee('s1', { given_by_user_id: 'u-recep' })

    expect(status).toBe(200)
    expect(fee('s1')).toMatchObject({
      given_by_user_id: 'u-recep',
      given_by: null,
      given_by_set_by: 'u-admin2',
      given_by_set_at: NOW.toISOString(),
    })
  })
})
