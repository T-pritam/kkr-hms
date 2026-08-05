/**
 * Authorisation for billing, the charge catalogue and charge sheets.
 *
 * There was none. `app/api/patients/[id]/charges/*` checked only that the caller
 * was signed in, so a lab technician could add a ten-thousand-rupee charge to any
 * patient (BUGS.md #18's neighbourhood), and `app/api/referrals` checked nothing
 * at all (#49). This is the same `requireX(request, capability)` shape as
 * lib/doctors/authz.ts and lib/case-sheet/authz.ts.
 *
 * The split that matters is between *placing* a charge and *pricing* one. Putting
 * a charge on a patient is desk work — reception does it all day, and it is
 * visible and reversible. Editing the catalogue sets what everything costs for
 * everyone, and settling money out of the hospital is final. Those are admin.
 */

import type { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, sendForbidden, sendUnauthorized } from '@/lib/auth/verify'
import type { UserRole } from '@/types/auth'

export type BillingCapability =
  | 'charge:read'
  | 'charge:write'
  | 'charge-catalogue:write'
  | 'charge-sheet:write'
  | 'charge-sheet:forward'
  | 'billing:write'
  | 'visit-purpose:write'
  | 'doctor-fee:write'
  | 'pharmacy-charge:write'

const EVERYONE: UserRole[] = ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'LAB_TECHNICIAN']

/** The desk. Reception places charges; a doctor or nurse may correct one. */
const BILLERS: UserRole[] = ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']

export const BILLING_CAPABILITIES: Record<BillingCapability, UserRole[]> = {
  // Reading a bill is not sensitive — every tab in the patient record shows it.
  'charge:read': EVERYONE,

  // Placing and correcting a charge on a patient. Reversible and attributed.
  'charge:write': BILLERS,

  // Fetching a pharmacy bill by id and attaching it as a charge. Same desk as
  // charge:write — reception routinely looks up and attaches these.
  'pharmacy-charge:write': BILLERS,

  // The price list. One edit here changes what every future charge costs, so it
  // is admin only — same reasoning as app/api/lab-tests/route.ts, which calls
  // itself "the price list and clinical config".
  'charge-catalogue:write': ['ADMIN'],

  // A quote is not money. Reception raises these for walk-ins.
  'charge-sheet:write': BILLERS,

  // Forwarding turns a quote into a real, due-bearing charge. That is the moment
  // it stops being reversible bookkeeping, so it is admin.
  'charge-sheet:forward': ['ADMIN'],

  // The package: base charge, referral commission, and the settled flags.
  'billing:write': ['ADMIN'],

  // What kinds of visit exist. Config, and settlements group on it — renaming or
  // retiring one reshapes every future payout.
  'visit-purpose:write': ['ADMIN'],

  // What a doctor is paid. Admin only for the obvious reason: a doctor must not
  // be able to set their own rate.
  'doctor-fee:write': ['ADMIN'],
}

export interface BillingUser {
  id: string
  email: string
  role: string
}

type Guard =
  | { user: BillingUser; response?: undefined }
  | { user?: undefined; response: NextResponse }

export function hasBillingCapability(
  role: string | undefined | null,
  capability: BillingCapability,
): boolean {
  if (!role) return false
  return (BILLING_CAPABILITIES[capability] as string[]).includes(role)
}

/**
 * Authenticates the request and checks one capability.
 *
 *   const auth = await requireBilling(request, 'charge:write')
 *   if (auth.response) return auth.response
 *   const { user } = auth
 */
export async function requireBilling(
  request: NextRequest,
  capability: BillingCapability,
): Promise<Guard> {
  const auth = await verifyAuth(request)

  if (!auth.isValid || !auth.user) {
    return { response: sendUnauthorized(auth.error || 'Unauthorized') }
  }

  if (!hasBillingCapability(auth.user.role, capability)) {
    return {
      response: sendForbidden(
        `Your role (${auth.user.role}) is not permitted to perform this action`,
      ),
    }
  }

  return { user: auth.user as BillingUser }
}
