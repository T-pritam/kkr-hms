/**
 * Authorisation for the case sheet / discharge summary module.
 *
 * The previous module had almost none: all four handlers verified the token and
 * then never read `user.role`, so a receptionist could create, rewrite and
 * re-upload a discharge summary. Only DELETE was guarded.
 *
 * A discharge summary is a clinical document that goes home with the patient
 * and is read by whoever treats them next, so writing it is restricted to
 * ADMIN, DOCTOR and NURSE. Reading and downloading stays open to everyone
 * working in the hospital — reception hands the document over at the desk.
 */

import type { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, sendForbidden, sendUnauthorized } from '@/lib/auth/verify'
import type { UserRole } from '@/types/auth'

export type CaseSheetCapability =
  | 'casesheet:read'
  | 'casesheet:write'
  | 'casesheet:finalise'
  | 'casesheet:delete'
  | 'medicine:write'

const ALL_CLINICAL: UserRole[] = ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'LAB_TECHNICIAN']

/** Who may write the record, per the client's instruction. */
const CLINICAL_AUTHORS: UserRole[] = ['ADMIN', 'DOCTOR', 'NURSE']

export const CASE_SHEET_CAPABILITIES: Record<CaseSheetCapability, UserRole[]> = {
  // Anyone in the hospital can read a summary and print a copy for the patient.
  'casesheet:read':     ALL_CLINICAL,

  // Creating, editing, attaching scans.
  'casesheet:write':    CLINICAL_AUTHORS,

  // Signing it off — which is also what marks the patient discharged — and
  // reopening a finalised one.
  'casesheet:finalise': CLINICAL_AUTHORS,

  // Destroying a clinical record. Admin only, as before.
  'casesheet:delete':   ['ADMIN'],

  // Adding to the medicine master, which everyone else then sees.
  'medicine:write':     CLINICAL_AUTHORS,
}

export interface CaseSheetUser {
  id: string
  email: string
  role: string
}

type Guard =
  | { user: CaseSheetUser; response?: undefined }
  | { user?: undefined; response: NextResponse }

export function hasCapability(
  role: string | undefined | null,
  capability: CaseSheetCapability,
): boolean {
  if (!role) return false
  return (CASE_SHEET_CAPABILITIES[capability] as string[]).includes(role)
}

/**
 * Authenticates the request and checks one capability.
 *
 *   const auth = await requireCaseSheet(request, 'casesheet:write')
 *   if (auth.response) return auth.response
 *   const { user } = auth
 */
export async function requireCaseSheet(
  request: NextRequest,
  capability: CaseSheetCapability,
): Promise<Guard> {
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

  return { user: auth.user as CaseSheetUser }
}
