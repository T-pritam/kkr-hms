/**
 * Salary Advance Validation Logic
 * Handles validation for salary advances based on two scenarios:
 * 1. No salary record created yet (advance limited by base salary)
 * 2. Salary record exists (advance limited by remaining calculated salary)
 */

export interface AdvanceValidationResult {
  isAllowed: boolean
  maxAllowedAdvance: number
  currentAdvanceTotal: number
  baseSalary: number
  calculatedSalary: number
  settledAmount: number
  remainingAmount: number
  reason?: string
}

export interface SalaryData {
  baseSalary: number
  salaryRecord?: {
    calculated_salary: number
    total_advance: number
    status: string
    settled_on?: string | null
  } | null
  currentAdvances: Array<{ amount: number }>
}

/**
 * Validate if an advance can be added and calculate maximum allowed amount
 * 
 * Scenario 1: No salary record - allow up to base_salary
 * Scenario 2: Salary record exists - allow up to (calculated_salary - advances - settled amounts)
 * Scenario 3: Salary is settled - no advances allowed
 */
export function validateSalaryAdvance(
  salaryData: SalaryData,
  proposedAmount?: number
): AdvanceValidationResult {
  const baseSalary = salaryData.baseSalary || 0
  const currentAdvances = salaryData.currentAdvances || []
  
  // Calculate total of current advances
  const currentAdvanceTotal = currentAdvances.reduce(
    (sum, adv) => sum + parseFloat(adv.amount.toString()),
    0
  )

  // Scenario 1: No salary record created yet
  if (!salaryData.salaryRecord) {
    const maxAllowedAdvance = baseSalary - currentAdvanceTotal
    const isAllowed = maxAllowedAdvance > 0

    return {
      isAllowed,
      maxAllowedAdvance: Math.max(0, maxAllowedAdvance),
      currentAdvanceTotal,
      baseSalary,
      calculatedSalary: 0,
      settledAmount: 0,
      remainingAmount: maxAllowedAdvance,
      reason: isAllowed
        ? undefined
        : 'Maximum advance limit (base salary) has been reached'
    }
  }

  // Scenario 2: Salary record exists
  const salaryRecord = salaryData.salaryRecord
  
  // Check if salary is settled - no advances allowed
  if (salaryRecord.status === 'settled') {
    return {
      isAllowed: false,
      maxAllowedAdvance: 0,
      currentAdvanceTotal,
      baseSalary,
      calculatedSalary: parseFloat(salaryRecord.calculated_salary?.toString() || '0'),
      settledAmount: 0,
      remainingAmount: 0,
      reason: 'Salary is already settled. No further advances can be added.'
    }
  }

  const calculatedSalary = parseFloat(salaryRecord.calculated_salary?.toString() || '0')
  
  // If calculated salary is 0 or negative, no advances allowed
  if (calculatedSalary <= 0) {
    return {
      isAllowed: false,
      maxAllowedAdvance: 0,
      currentAdvanceTotal,
      baseSalary,
      calculatedSalary,
      settledAmount: 0,
      remainingAmount: 0,
      reason: 'No calculated salary available for advances'
    }
  }

  // Calculate settled amount (using total_advance field which tracks all advances)
  const totalAdvances = parseFloat(salaryRecord.total_advance?.toString() || '0')
  
  // Remaining = calculated_salary - total_advances
  const remainingAmount = calculatedSalary - totalAdvances
  const isAllowed = remainingAmount > 0

  return {
    isAllowed,
    maxAllowedAdvance: Math.max(0, remainingAmount),
    currentAdvanceTotal: totalAdvances,
    baseSalary,
    calculatedSalary,
    settledAmount: 0, // You can track settled amounts separately if needed
    remainingAmount: Math.max(0, remainingAmount),
    reason: isAllowed
      ? undefined
      : 'Full calculated salary has been claimed through advances'
  }
}

/**
 * Check if the proposed advance amount is within allowed limits
 */
export function isAdvanceAmountValid(
  salaryData: SalaryData,
  proposedAmount: number
): { valid: boolean; reason?: string } {
  if (proposedAmount <= 0) {
    return { valid: false, reason: 'Advance amount must be greater than 0' }
  }

  const validation = validateSalaryAdvance(salaryData)

  if (!validation.isAllowed) {
    return { valid: false, reason: validation.reason }
  }

  if (proposedAmount > validation.maxAllowedAdvance) {
    return {
      valid: false,
      reason: `Advance amount cannot exceed ₹${validation.maxAllowedAdvance.toFixed(2)}`
    }
  }

  return { valid: true }
}

/**
 * Format validation message for display
 */
export function getValidationMessage(validation: AdvanceValidationResult): string {
  if (validation.isAllowed) {
    return `Maximum advance allowed: ₹${validation.maxAllowedAdvance.toFixed(2)}`
  }
  return validation.reason || 'Cannot add advance at this time'
}
