/**
 * The roles and statuses the Admin panel may give an account.
 *
 * ADMIN is not among them — admins are not made through the panel. The API
 * refused only `'ADMIN'` and stored any other string as a role, so a typo or a
 * crafted value became an account no screen or capability recognised; and
 * LAB_TECHNICIAN, which every lab capability names, could not be chosen at all
 * (BUGS #72).
 */
export const ASSIGNABLE_ROLES = ['RECEPTIONIST', 'NURSE', 'DOCTOR', 'LAB_TECHNICIAN'] as const
export const ACCOUNT_STATUSES = ['ACTIVE', 'INACTIVE'] as const

export const ROLE_LABELS: Record<(typeof ASSIGNABLE_ROLES)[number], string> = {
  RECEPTIONIST: 'Receptionist',
  NURSE: 'Nurse',
  DOCTOR: 'Doctor',
  LAB_TECHNICIAN: 'Lab technician',
}

/** A refusal message, or null when role and status (each optional) are acceptable. */
export function accountFieldsError(fields: { role?: unknown; status?: unknown }): string | null {
  if (fields.role !== undefined && !(ASSIGNABLE_ROLES as readonly unknown[]).includes(fields.role)) {
    return `Role must be one of ${ASSIGNABLE_ROLES.join(', ')}`
  }
  if (fields.status !== undefined && !(ACCOUNT_STATUSES as readonly unknown[]).includes(fields.status)) {
    return 'Status must be ACTIVE or INACTIVE'
  }
  return null
}
