/**
 * Authorisation for the doctor registry.
 *
 * `POST /api/doctors` grew a role guard during the case sheet work, but
 * `PUT /api/doctors/[id]` and `DELETE /api/doctors/[id]` still had none at all
 * — any authenticated user, a lab technician included, could rename or destroy
 * a consultant (BUGS.md #47/#48). This is the same list, now applied to every
 * handler.
 *
 * Writing stays open to reception because the doctors list feeds the
 * referring-doctor and consulting-doctor pickers across the app: it is clinical
 * reference data that gets added to at the desk, not a scratchpad.
 */

import type { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, sendForbidden, sendUnauthorized } from '@/lib/auth/verify'
import type { UserRole } from '@/types/auth'

export type DoctorCapability =
  | 'doctor:read'
  | 'doctor:write'
  | 'doctor:delete'

const EVERYONE: UserRole[] = ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'LAB_TECHNICIAN']

const REGISTRARS: UserRole[] = ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']

export const DOCTOR_CAPABILITIES: Record<DoctorCapability, UserRole[]> = {
  // Every picker in the app reads this list.
  'doctor:read':   EVERYONE,

  // Adding, editing, and deactivating — all reversible.
  'doctor:write':  REGISTRARS,

  // Destroying the row, which is only ever permitted when nothing references
  // it. Admin only.
  'doctor:delete': ['ADMIN'],
}

export interface DoctorUser {
  id: string
  email: string
  role: string
}

type Guard =
  | { user: DoctorUser; response?: undefined }
  | { user?: undefined; response: NextResponse }

export function hasDoctorCapability(
  role: string | undefined | null,
  capability: DoctorCapability,
): boolean {
  if (!role) return false
  return (DOCTOR_CAPABILITIES[capability] as string[]).includes(role)
}

/**
 * Authenticates the request and checks one capability.
 *
 *   const auth = await requireDoctor(request, 'doctor:write')
 *   if (auth.response) return auth.response
 *   const { user } = auth
 */
export async function requireDoctor(
  request: NextRequest,
  capability: DoctorCapability,
): Promise<Guard> {
  const auth = await verifyAuth(request)

  if (!auth.isValid || !auth.user) {
    return { response: sendUnauthorized(auth.error || 'Unauthorized') }
  }

  if (!hasDoctorCapability(auth.user.role, capability)) {
    return {
      response: sendForbidden(
        `Your role (${auth.user.role}) is not permitted to perform this action`,
      ),
    }
  }

  return { user: auth.user as DoctorUser }
}
