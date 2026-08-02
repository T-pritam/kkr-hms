/**
 * Authorisation for the patient registry.
 *
 * Before this, `DELETE /api/patients/[id]` was the only handler in the whole
 * directory that read `user.role`. Listing, creating, editing and PATCHing a
 * patient — including flipping their status — needed nothing but a valid token,
 * so a lab technician could rewrite a patient record (BUGS.md #9).
 *
 * Writing is open to reception: registering patients is their job, and gating
 * it behind a clinician would put a queue at the desk. Destroying a patient and
 * everything hanging off them stays with Admin.
 */

import type { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, sendForbidden, sendUnauthorized } from '@/lib/auth/verify'
import type { UserRole } from '@/types/auth'

export type PatientCapability =
  | 'patient:read'
  | 'patient:write'
  | 'patient:delete'

const EVERYONE: UserRole[] = ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'LAB_TECHNICIAN']

/** Reception registers patients; the lab does not. */
const REGISTRARS: UserRole[] = ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']

export const PATIENT_CAPABILITIES: Record<PatientCapability, UserRole[]> = {
  // Every screen in the hospital starts from a patient.
  'patient:read':   EVERYONE,

  // Registering, editing, changing status.
  'patient:write':  REGISTRARS,

  // Hard delete, cascading to billing, charges, consultations, lab orders and
  // case sheets. Admin only.
  'patient:delete': ['ADMIN'],
}

export interface PatientUser {
  id: string
  email: string
  role: string
}

type Guard =
  | { user: PatientUser; response?: undefined }
  | { user?: undefined; response: NextResponse }

export function hasPatientCapability(
  role: string | undefined | null,
  capability: PatientCapability,
): boolean {
  if (!role) return false
  return (PATIENT_CAPABILITIES[capability] as string[]).includes(role)
}

/**
 * Authenticates the request and checks one capability.
 *
 *   const auth = await requirePatient(request, 'patient:write')
 *   if (auth.response) return auth.response
 *   const { user } = auth
 */
export async function requirePatient(
  request: NextRequest,
  capability: PatientCapability,
): Promise<Guard> {
  const auth = await verifyAuth(request)

  if (!auth.isValid || !auth.user) {
    return { response: sendUnauthorized(auth.error || 'Unauthorized') }
  }

  if (!hasPatientCapability(auth.user.role, capability)) {
    return {
      response: sendForbidden(
        `Your role (${auth.user.role}) is not permitted to perform this action`,
      ),
    }
  }

  return { user: auth.user as PatientUser }
}
