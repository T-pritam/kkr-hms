/**
 * Authorisation for the lab module.
 *
 * The previous module had none: every handler verified the token and then never
 * read `payload.role`, so a receptionist could rewrite the price list, alter
 * reference intervals, enter results and delete tests (BUGS.md #57). Each lab
 * route now declares the capability it needs.
 */

import type { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, sendForbidden, sendUnauthorized } from '@/lib/auth/verify'
import type { UserRole } from '@/types/auth'

export type LabCapability =
  | 'catalogue:read'
  | 'catalogue:write'
  | 'order:read'
  | 'order:write'
  | 'result:write'
  | 'interpretation:write'
  | 'authorise'

const ALL_CLINICAL: UserRole[] = ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'LAB_TECHNICIAN']

/**
 * INTERIM POLICY — deliberately permissive.
 *
 * The lab is currently run by whoever is on shift, so admin, lab technician and
 * nurse can all see and update lab work. Tighten this table when the roles are
 * split properly; every route already routes through it, so narrowing a list
 * here is the only change needed.
 */
export const LAB_CAPABILITIES: Record<LabCapability, UserRole[]> = {
  // Anyone working in the hospital needs to look things up.
  'catalogue:read':       ALL_CLINICAL,
  'order:read':           ALL_CLINICAL,

  // The price list and reference intervals are clinical configuration: change a
  // reference interval and every future result is judged against it.
  'catalogue:write':      ['ADMIN', 'LAB_TECHNICIAN'],

  // Registering orders and recording collection / receipt.
  'order:write':          ['ADMIN', 'RECEPTIONIST', 'LAB_TECHNICIAN', 'NURSE'],

  // Entering results.
  'result:write':         ['ADMIN', 'LAB_TECHNICIAN', 'NURSE'],

  // The clinical summary.
  'interpretation:write': ['ADMIN', 'DOCTOR', 'LAB_TECHNICIAN', 'NURSE'],

  // Releasing a report is a clinical sign-off. Optional in this deployment, and
  // the one capability worth keeping narrow even now.
  'authorise':            ['ADMIN', 'DOCTOR'],
}

export interface LabUser {
  id: string
  email: string
  role: string
}

type Guard =
  | { user: LabUser; response?: undefined }
  | { user?: undefined; response: NextResponse }

export function hasCapability(role: string | undefined | null, capability: LabCapability): boolean {
  if (!role) return false
  return (LAB_CAPABILITIES[capability] as string[]).includes(role)
}

/**
 * Authenticates the request and checks one capability.
 *
 *   const auth = await requireLab(request, 'result:write')
 *   if (auth.response) return auth.response
 *   const { user } = auth
 */
export async function requireLab(request: NextRequest, capability: LabCapability): Promise<Guard> {
  const auth = await verifyAuth(request)

  if (!auth.isValid || !auth.user) {
    return { response: sendUnauthorized(auth.error || 'Unauthorized') }
  }

  if (!hasCapability(auth.user.role, capability)) {
    return {
      response: sendForbidden(
        `Your role (${auth.user.role}) is not permitted to perform this action`,
      ),
    }
  }

  return { user: auth.user as LabUser }
}
