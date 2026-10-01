import { describe, it, expect } from 'vitest'
import { ageSexFor, lineDefaults, receiptDefaults, titleFor, validateReceipt } from '@/lib/billing/receipts'

/**
 * What a new payment receipt starts with, and what the desk may type into it
 * (client, 1 Oct). The amount is not here at all: it is the payment's own.
 */
const NOW = new Date('2026-10-01T06:00:00Z')

describe('what a new receipt starts with', () => {
  const patient = {
    name: 'Chandan Nikshith Sai', patient_id: '214/26', gender: 'Male', date_of_birth: '2015-03-02',
    phone: '7997116180', alternate_phone: '9160486367', address: 'Chalam Naidu Valasa, Manyam Dist',
  }

  it('titles the patient from their gender', () => {
    expect(titleFor('Male')).toBe('Mr.')
    expect(titleFor('female')).toBe('Ms.')
    expect(titleFor('Other')).toBe('')
    expect(titleFor(null)).toBe('')
  })

  it('writes age and sex the way the desk does', () => {
    expect(ageSexFor(patient, NOW)).toBe('11yrs/Male')
    expect(ageSexFor({ gender: 'Female' }, NOW)).toBe('Female')
    expect(ageSexFor({ age_years: 40, age_recorded_on: '2026-09-01', gender: null }, NOW)).toBe('40yrs')
  })

  it('fills the patient details from the record', () => {
    expect(receiptDefaults(patient, [], NOW)).toEqual({
      heading: 'Cash Receipt',
      patient_name: 'Mr. Chandan Nikshith Sai',
      age_sex: '11yrs/Male',
      mobile: '7997116180, 9160486367',
      address: 'Chalam Naidu Valasa, Manyam Dist',
      ip_no: '214/26',
      doctors: [],
      department: '',
    })
  })

  it('leaves empty what the record does not have', () => {
    const bare = receiptDefaults({ name: 'Sita', gender: 'Female', patient_id: '9/26' }, [], NOW)
    expect(bare).toMatchObject({ patient_name: 'Ms. Sita', mobile: '', address: '', age_sex: 'Female' })
  })

  it('names every doctor who visited, once each, in the order they first came', () => {
    const ramesh = { id: 'd1', name: 'Dr Ramesh Naidu', department: 'General Medicine' }
    const krishna = { id: 'd2', name: 'Dr Krishna Chaitanya', department: 'Cardiology' }
    const defaults = receiptDefaults(patient, [
      { consultation_date: '2026-07-15T04:00:00Z', doctor: krishna },
      { consultation_date: '2026-07-13T04:00:00Z', doctor: ramesh },
      { consultation_date: '2026-07-16T04:00:00Z', doctor: ramesh },
      { consultation_date: '2026-07-17T04:00:00Z', doctor: null },
    ], NOW)

    expect(defaults.doctors).toEqual(['Dr Ramesh Naidu', 'Dr Krishna Chaitanya'])
    // the first doctor's department
    expect(defaults.department).toBe('General Medicine')
  })

  it('starts each row from its payment', () => {
    expect(lineDefaults({ id: 'i1', payment_date: '2026-07-13', payment_method: 'upi', kind: 'advance', remarks: null })).toEqual({
      installment_id: 'i1', line_date: '2026-07-13', payment_mode: 'UPI', transaction_type: 'transfer', remarks: 'Advance',
    })
    expect(lineDefaults({ id: 'i2', payment_date: '2026-07-14', payment_method: 'cash', kind: 'payment', remarks: 'part' })).toEqual({
      installment_id: 'i2', line_date: '2026-07-14', payment_mode: 'Cash', transaction_type: 'cash', remarks: 'Regular - part',
    })
    expect(lineDefaults({ id: 'i3', payment_method: 'bank_transfer', kind: 'lab' })).toMatchObject({
      line_date: null, payment_mode: 'Bank transfer', transaction_type: 'transfer', remarks: 'Lab',
    })
  })
})

describe('what the desk may save on a receipt', () => {
  const mine = new Set(['i1', 'i2'])
  const good = {
    receipt_no: ' 287(A) ', heading: '', patient_name: 'Mr. Chandan', age_sex: '11yrs/Male', mobile: '', address: '',
    ip_no: '214/26', doctors: ['Dr Ramesh Naidu', '  ', 'Dr Krishna'], department: 'General Medicine', created_by_label: 'Madhu.P',
    lines: [{ installment_id: 'i1', line_date: '2026-07-13', payment_mode: 'Phone pay', transaction_type: 'transfer', remarks: 'advance' }],
  }

  it('accepts a typed receipt, tidied', () => {
    const checked = validateReceipt(good, mine)
    expect(checked.ok).toBe(true)
    if (!checked.ok) return
    expect(checked.value.receipt_no).toBe('287(A)')
    // an emptied heading falls back, and blank doctor lines go
    expect(checked.value.heading).toBe('Cash Receipt')
    expect(checked.value.doctors).toEqual(['Dr Ramesh Naidu', 'Dr Krishna'])
    expect(checked.value.lines).toEqual([
      { installment_id: 'i1', line_date: '2026-07-13', payment_mode: 'Phone pay', transaction_type: 'transfer', remarks: 'advance' },
    ])
  })

  it('needs the receipt number and the patient name', () => {
    expect(validateReceipt({ ...good, receipt_no: '  ' }, mine)).toMatchObject({ ok: false, status: 400, fieldErrors: { receipt_no: expect.any(String) } })
    expect(validateReceipt({ ...good, patient_name: '' }, mine)).toMatchObject({ ok: false, fieldErrors: { patient_name: expect.any(String) } })
  })

  it('needs at least one payment, each once, and only this patient\'s', () => {
    expect(validateReceipt({ ...good, lines: [] }, mine)).toMatchObject({ ok: false, error: expect.stringMatching(/at least one payment/) })
    expect(validateReceipt({ ...good, lines: [{ installment_id: 'someone-elses' }] }, mine)).toMatchObject({ ok: false, error: expect.stringMatching(/not one of this patient/) })
    expect(validateReceipt({ ...good, lines: [good.lines[0], good.lines[0]] }, mine)).toMatchObject({ ok: false, error: expect.stringMatching(/twice/) })
  })

  it('lets a row\'s date be changed or left blank, but not be nonsense', () => {
    const blank = validateReceipt({ ...good, lines: [{ installment_id: 'i1', line_date: '' }] }, mine)
    expect(blank.ok && blank.value.lines[0].line_date).toBeNull()
    expect(validateReceipt({ ...good, lines: [{ installment_id: 'i1', line_date: '13.07.26' }] }, mine)).toMatchObject({ ok: false })
  })

  it('refuses text that would not fit the slip', () => {
    expect(validateReceipt({ ...good, address: 'x'.repeat(301) }, mine)).toMatchObject({ ok: false, fieldErrors: { address: expect.any(String) } })
    expect(validateReceipt({ ...good, doctors: Array(9).fill('Dr A') }, mine)).toMatchObject({ ok: false, fieldErrors: { doctors: expect.any(String) } })
  })
})
