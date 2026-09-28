/**
 * /api/doctors/[id]/unpaid — pay a doctor from the doctor's page (client,
 * 28 Sep). Lists what is still owed per patient and purpose; POST first syncs
 * any visit not yet on a fee row, exactly as the patient's "Sync Visits" does.
 */

import { describe, it, expect } from 'vitest'
import { GET as listUnpaid, POST as syncUnpaid } from '@/app/api/doctors/[id]/unpaid/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'
import { aBilling, aConsultation, aDoctor, aPatient, aSettlement, aVisitPurpose } from '../../helpers/seed'

const get = () => call(listUnpaid, 'GET', '/api/doctors/d1/unpaid', { params: { id: 'd1' } })
const post = () => call(syncUnpaid, 'POST', '/api/doctors/d1/unpaid', { params: { id: 'd1' } })

function world() {
  aDoctor({ id: 'd1', name: 'Dr Rao' })
  aVisitPurpose({ id: 'vp1', code: 'consultation', name: 'Consultation' })
  aPatient({ id: 'p1', patient_id: '5/26', name: 'Chiru' })
  aPatient({ id: 'p2', patient_id: '4/26', name: 'Ravi' })
  aBilling({ id: 'b1', patient_id: 'p1' })
  aBilling({ id: 'b2', patient_id: 'p2' })
}

describe('/api/doctors/[id]/unpaid', () => {
  it('needs a session, and the desk to sync', async () => {
    signOut()
    expect((await get()).status).toBe(401)
    await signInAs('NURSE')
    expect((await post()).status).toBe(403)
  })

  it('lists the unpaid fee rows per patient, and the visits not billed yet', async () => {
    await signInAs('RECEPTIONIST')
    world()
    aSettlement({ id: 's1', patient_id: 'p1', patient_billing_id: 'b1', doctor_id: 'd1', visit_purpose_id: 'vp1', visit_count: 2, amount_per_visit: 600, total_amount: 1200, settled: false })
    aSettlement({ id: 'paid', patient_id: 'p1', patient_billing_id: 'b1', doctor_id: 'd1', visit_purpose_id: 'vp1', visit_count: 1, total_amount: 600, settled: true })
    aConsultation({ patient_id: 'p2', doctor_id: 'd1', billing_id: 'b2', visit_purpose_id: 'vp1', settlement_id: null })

    const { status, body } = await get()

    expect(status).toBe(200)
    expect(body.fees).toEqual([
      expect.objectContaining({ id: 's1', visit_count: 2, total_amount: 1200, purpose: 'Consultation', patient: expect.objectContaining({ patient_id: '5/26' }) }),
    ])
    expect(body.unbilled_visits).toBe(1)
  })

  it('syncs unbilled visits into fee rows before listing them', async () => {
    await signInAs('RECEPTIONIST', { userId: 'u-desk' })
    world()
    aConsultation({ id: 'c1', patient_id: 'p2', doctor_id: 'd1', billing_id: 'b2', visit_purpose_id: 'vp1', settlement_id: null })
    aConsultation({ id: 'c2', patient_id: 'p2', doctor_id: 'd1', billing_id: 'b2', visit_purpose_id: 'vp1', settlement_id: null })

    const { status, body } = await post()

    expect(status).toBe(200)
    expect(body.synced_bills).toBe(1)
    expect(body.unbilled_visits).toBe(0)
    expect(body.fees).toEqual([
      expect.objectContaining({ patient_id: 'p2', visit_count: 2, patient: expect.objectContaining({ name: 'Ravi' }) }),
    ])
    const row = db.rows('doctor_visit_settlements')[0]
    expect(db.rows('patient_consultations').every((c) => c.settlement_id === row.id)).toBe(true)
  })
})
