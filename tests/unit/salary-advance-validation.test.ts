/**
 * lib/salary-advance-validation.ts — how much an employee may still draw as an advance.
 *
 * Two regimes:
 *   - before the month's salary is calculated, the cap is the base salary
 *   - after it exists, the cap is the calculated salary less what has already been drawn
 *   - once settled, nothing further can be drawn
 */

import { describe, it, expect } from 'vitest'
import {
  validateSalaryAdvance,
  isAdvanceAmountValid,
  getValidationMessage,
  type SalaryData,
} from '@/lib/salary-advance-validation'

const noRecord = (baseSalary: number, advances: number[] = []): SalaryData => ({
  baseSalary,
  salaryRecord: null,
  currentAdvances: advances.map((amount) => ({ amount })),
})

const withRecord = (
  baseSalary: number,
  record: { calculated_salary: number; total_advance: number; status: string },
  advances: number[] = []
): SalaryData => ({
  baseSalary,
  salaryRecord: record,
  currentAdvances: advances.map((amount) => ({ amount })),
})

describe('validateSalaryAdvance — before a salary record exists', () => {
  it('allows up to the base salary', () => {
    const result = validateSalaryAdvance(noRecord(27000))

    expect(result).toMatchObject({ isAllowed: true, maxAllowedAdvance: 27000, currentAdvanceTotal: 0 })
    expect(result.reason).toBeUndefined()
  })

  it('subtracts advances already drawn', () => {
    expect(validateSalaryAdvance(noRecord(27000, [5000, 2000]))).toMatchObject({
      isAllowed: true,
      maxAllowedAdvance: 20000,
      currentAdvanceTotal: 7000,
    })
  })

  it('blocks once the base salary is exhausted', () => {
    const result = validateSalaryAdvance(noRecord(27000, [27000]))

    expect(result.isAllowed).toBe(false)
    expect(result.maxAllowedAdvance).toBe(0)
    expect(result.reason).toBe('Maximum advance limit (base salary) has been reached')
  })

  it('never reports a negative allowance', () => {
    expect(validateSalaryAdvance(noRecord(27000, [30000])).maxAllowedAdvance).toBe(0)
  })

  it('handles amounts stored as strings', () => {
    const data = { baseSalary: 27000, salaryRecord: null, currentAdvances: [{ amount: '5000' as any }] }
    expect(validateSalaryAdvance(data).maxAllowedAdvance).toBe(22000)
  })

  it('treats a missing base salary as zero', () => {
    expect(validateSalaryAdvance(noRecord(0))).toMatchObject({ isAllowed: false, maxAllowedAdvance: 0 })
  })
})

describe('validateSalaryAdvance — once a salary record exists', () => {
  it('allows up to the calculated salary less advances drawn', () => {
    const result = validateSalaryAdvance(
      withRecord(27000, { calculated_salary: 25000, total_advance: 10000, status: 'pending' })
    )

    expect(result).toMatchObject({ isAllowed: true, maxAllowedAdvance: 15000, calculatedSalary: 25000 })
  })

  it('uses the record’s running total rather than the advance rows', () => {
    const result = validateSalaryAdvance(
      withRecord(27000, { calculated_salary: 25000, total_advance: 10000, status: 'pending' }, [999999])
    )

    expect(result.currentAdvanceTotal).toBe(10000)
    expect(result.maxAllowedAdvance).toBe(15000)
  })

  it('blocks when the full calculated salary has been drawn', () => {
    const result = validateSalaryAdvance(
      withRecord(27000, { calculated_salary: 25000, total_advance: 25000, status: 'pending' })
    )

    expect(result.isAllowed).toBe(false)
    expect(result.reason).toBe('Full calculated salary has been claimed through advances')
  })

  it('blocks a settled salary outright', () => {
    const result = validateSalaryAdvance(
      withRecord(27000, { calculated_salary: 25000, total_advance: 0, status: 'settled' })
    )

    expect(result.isAllowed).toBe(false)
    expect(result.maxAllowedAdvance).toBe(0)
    expect(result.reason).toBe('Salary is already settled. No further advances can be added.')
  })

  it('blocks when the calculated salary is zero or negative', () => {
    for (const calculated of [0, -500]) {
      const result = validateSalaryAdvance(
        withRecord(27000, { calculated_salary: calculated, total_advance: 0, status: 'pending' })
      )
      expect(result.isAllowed).toBe(false)
      expect(result.reason).toBe('No calculated salary available for advances')
    }
  })

  it('never reports a negative allowance when over-drawn', () => {
    const result = validateSalaryAdvance(
      withRecord(27000, { calculated_salary: 25000, total_advance: 30000, status: 'pending' })
    )

    expect(result.maxAllowedAdvance).toBe(0)
    expect(result.remainingAmount).toBe(0)
  })
})

describe('isAdvanceAmountValid', () => {
  it('rejects a zero or negative request', () => {
    for (const amount of [0, -100]) {
      expect(isAdvanceAmountValid(noRecord(27000), amount)).toEqual({
        valid: false,
        reason: 'Advance amount must be greater than 0',
      })
    }
  })

  it('accepts an amount within the cap', () => {
    expect(isAdvanceAmountValid(noRecord(27000), 5000)).toEqual({ valid: true })
  })

  it('accepts an amount exactly at the cap', () => {
    expect(isAdvanceAmountValid(noRecord(27000), 27000)).toEqual({ valid: true })
  })

  it('rejects an amount over the cap, quoting the remaining allowance', () => {
    expect(isAdvanceAmountValid(noRecord(27000), 30000)).toEqual({
      valid: false,
      reason: 'Advance amount cannot exceed ₹27000.00',
    })
  })

  it('passes through the blocking reason when nothing may be drawn', () => {
    const settled = withRecord(27000, { calculated_salary: 25000, total_advance: 0, status: 'settled' })

    expect(isAdvanceAmountValid(settled, 100)).toEqual({
      valid: false,
      reason: 'Salary is already settled. No further advances can be added.',
    })
  })
})

describe('getValidationMessage', () => {
  it('quotes the allowance when an advance is possible', () => {
    expect(getValidationMessage(validateSalaryAdvance(noRecord(27000)))).toBe('Maximum advance allowed: ₹27000.00')
  })

  it('quotes the blocking reason otherwise', () => {
    expect(getValidationMessage(validateSalaryAdvance(noRecord(27000, [27000])))).toBe(
      'Maximum advance limit (base salary) has been reached'
    )
  })
})
