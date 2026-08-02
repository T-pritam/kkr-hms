/**
 * The employee registry's vocabularies.
 *
 * `GENDERS`, `ID_PROOF_TYPES` and `RELATIONS` are re-exported from the patient
 * registry rather than copied. They are the same lists, backed by the same
 * CHECK constraints, and a second copy is how two screens end up offering
 * different options for the same column.
 */

import type { BadgeVariant } from '@/components/ui/badge'

export { GENDERS, ID_PROOF_TYPES, RELATIONS } from '@/lib/patients/constants'
export type { Gender } from '@/lib/patients/constants'

/**
 * The eight roles the form has always offered. Unchanged — the brief was
 * explicitly not to alter existing functionality, and these values are already
 * stored on live rows.
 */
export const DESIGNATIONS = [
  'Nurse',
  'Wardboy',
  'Compounder',
  'OT Boy',
  'Watchman',
  'Cleaner',
  'Lab Technician',
  'Pharmacist',
] as const

export type Designation = (typeof DESIGNATIONS)[number]

/** Inactive is the soft delete. The row stays so payroll history stays readable. */
export const EMPLOYEE_STATUSES = ['Active', 'Inactive'] as const
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number]

export const STATUS_VARIANTS: Record<EmployeeStatus, BadgeVariant> = {
  Active: 'success',
  Inactive: 'outline',
}

/** Payroll rows, which use a separate lowercase vocabulary of their own. */
export const SALARY_STATUSES = ['pending', 'settled'] as const
export type SalaryStatus = (typeof SALARY_STATUSES)[number]

export const SALARY_STATUS_LABELS: Record<SalaryStatus, string> = {
  pending: 'Pending',
  settled: 'Settled',
}

export const SALARY_STATUS_VARIANTS: Record<SalaryStatus, BadgeVariant> = {
  pending: 'warning',
  settled: 'success',
}

/** Labels for validation messages, so an error names the field the way the form does. */
export const FIELD_LABELS: Record<string, string> = {
  employee_code: 'Employee code',
  name: 'Name',
  designation: 'Designation',
  base_salary: 'Base salary',
  join_date: 'Joining date',
  status: 'Status',
  phone: 'Phone',
  address: 'Address',
  emergency_contact_name: 'Emergency contact name',
  emergency_contact_relation: 'Relation',
  emergency_contact_phone: 'Emergency contact phone',
  date_of_birth: 'Date of birth',
  gender: 'Gender',
  id_proof_type: 'ID proof type',
  id_proof_number: 'ID proof number',
  bank_account_no: 'Bank account number',
  bank_ifsc: 'IFSC',
  amount: 'Amount',
  date_given: 'Date',
  month_year: 'Month',
  given_by: 'Given by',
  remarks: 'Remarks',
}

/** Sort keys the list endpoint accepts, mapped to their columns. */
export const EMPLOYEE_SORTS = {
  employee_code: 'employee_code',
  name: 'name',
  designation: 'designation',
  base_salary: 'base_salary',
  join_date: 'join_date',
} as const

export type EmployeeSort = keyof typeof EMPLOYEE_SORTS

/**
 * Share of monthly salary already drawn as advances, past which the log shows a
 * warning chip. Purely a display cue — the enforced cap lives in
 * `lib/salary-advance-validation.ts` and is not changed by any of this.
 */
export const ADVANCE_WARN_PERCENT = 75
