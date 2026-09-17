/**
 * Authorisation for the employee, payroll and advance routes.
 *
 * Two things this replaces.
 *
 * The first is a two-line block copy-pasted into fourteen handlers:
 *
 *     // Admin only
 *     if (payload.role !== 'ADMIN' && payload.role !== 'DOCTOR') {
 *       return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
 *     }
 *
 * The comment says admin, the message says admin, and the condition lets
 * DOCTOR through (BUGS.md #53). That behaviour is preserved here rather than
 * quietly tightened — it is existing functionality, and narrowing it is a
 * one-line change to the table below when someone decides to.
 *
 * The second is worse: `POST /api/employees/[id]/salary/advances` and
 * `GET .../advances/validation` had **no role check at all**. They ran the
 * token preamble, never read `payload.role`, and went straight to work — so any
 * signed-in user, a lab technician included, could pay an advance out of any
 * employee's salary and read their payroll figures. `advance:write` closes that.
 *
 * Reception has no capability in this module at all — no employee records, no
 * salary figures, no advance log, no paying an advance out.
 */

import type { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, sendForbidden, sendUnauthorized } from '@/lib/auth/verify'
import type { UserRole } from '@/types/auth'

export type EmployeeCapability =
  | 'employee:read'
  | 'employee:write'
  | 'employee:delete'
  | 'salary:read'
  | 'salary:write'
  | 'salary:settle'
  | 'salary:list'
  | 'advance:read'
  | 'advance:write'

/** What the existing guard actually admits, kept as-is. */
const PAYROLL: UserRole[] = ['ADMIN', 'DOCTOR']

export const EMPLOYEE_CAPABILITIES: Record<EmployeeCapability, UserRole[]> = {
  // Staff records.
  'employee:read':   PAYROLL,
  'employee:write':  PAYROLL,
  'employee:delete': PAYROLL,

  // Salary records, the monthly credit grid, and settling.
  'salary:read':     PAYROLL,
  'salary:write':    PAYROLL,
  'salary:settle':   PAYROLL,

  // The employee-salary list.
  'salary:list':     PAYROLL,

  // Reading the advance log.
  'advance:read':    PAYROLL,

  // Paying one out.
  'advance:write':   PAYROLL,
}

export interface EmployeeUser {
  id: string
  email: string
  role: string
}

type Guard =
  | { user: EmployeeUser; response?: undefined }
  | { user?: undefined; response: NextResponse }

export function hasEmployeeCapability(
  role: string | undefined | null,
  capability: EmployeeCapability,
): boolean {
  if (!role) return false
  return (EMPLOYEE_CAPABILITIES[capability] as string[]).includes(role)
}

/**
 * Authenticates the request and checks one capability.
 *
 *   const auth = await requireEmployee(request, 'advance:write')
 *   if (auth.response) return auth.response
 *   const { user } = auth
 */
export async function requireEmployee(
  request: NextRequest,
  capability: EmployeeCapability,
): Promise<Guard> {
  const auth = await verifyAuth(request)

  if (!auth.isValid || !auth.user) {
    return { response: sendUnauthorized(auth.error || 'Unauthorized') }
  }

  if (!hasEmployeeCapability(auth.user.role, capability)) {
    return {
      response: sendForbidden(
        `Your role (${auth.user.role}) is not permitted to perform this action`,
      ),
    }
  }

  return { user: auth.user as EmployeeUser }
}
