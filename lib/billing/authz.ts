/**
 * Authorisation for billing, the charge catalogue and charge sheets.
 *
 * There was none. `app/api/patients/[id]/charges/*` checked only that the caller
 * was signed in, so a lab technician could add a ten-thousand-rupee charge to any
 * patient (BUGS.md #18's neighbourhood), and `app/api/referrals` checked nothing
 * at all (#49). This is the same `requireX(request, capability)` shape as
 * lib/doctors/authz.ts and lib/case-sheet/authz.ts.
 *
 * The split that matters is between *placing* a charge and *settling* money.
 * Putting a charge on a patient, and maintaining the catalogue it comes from,
 * is desk work — reception does both, and both are visible and reversible.
 * Settling money out of the hospital is final. That stays admin.
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
  | 'payment:write'
  | 'payout:read'
  | 'payout:write'
  | 'finance:read'
  | 'expense:write'

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

  // Recording, correcting or deleting a patient payment. It used to check only
  // that the caller was signed in, so a lab technician could take money against
  // any bill (PRD v2 gap G-08). The desk that places charges takes the payments.
  'payment:write': BILLERS,

  // The price list. Reception maintains it day to day — new charges, price
  // corrections — the same desk that already places charges from it.
  'charge-catalogue:write': ['ADMIN', 'RECEPTIONIST'],

  // A quote is not money. Reception raises these for walk-ins.
  'charge-sheet:write': BILLERS,

  // Forwarding turns a quote into a real, due-bearing charge. That is the moment
  // it stops being reversible bookkeeping, so it is admin.
  'charge-sheet:forward': ['ADMIN'],

  // The referral person, the commission, and the settled flags. Reception sets
  // these (Q-19 e). Who may change a *particular* one is no longer the own-row
  // rule: an unsettled commission is anyone's at the desk, a settled one the
  // admin's alone (Q-88, replacing Q-20) — see `canAmendPayout`.
  'billing:write': ['ADMIN', 'RECEPTIONIST'],

  // What kinds of visit exist. Reception manages these (Q-19 h, Q-72): they are
  // the list it prices against, and a new purpose is desk work.
  'visit-purpose:write': ['ADMIN', 'RECEPTIONIST'],

  // What a doctor is paid. Reception prices these at the desk (Q-19 a–c); a
  // doctor still cannot set their own rate, which is why DOCTOR is absent.
  'doctor-fee:write': ['ADMIN', 'RECEPTIONIST'],

  // Revenue, profit and the general expenses log. Hidden from reception
  // (Q-05); a doctor keeps the access they already had.
  'finance:read': ['ADMIN', 'DOCTOR'],

  // Recording what the hospital spent. A general expense is the admin's, and
  // never petty cash — that is the desk's float (requirement 7, CR-07).
  'expense:write': ['ADMIN'],

  // The payout worklists: which fees and commissions are still to be paid.
  // Whoever may pay one needs to see it, and nobody else does — this is the
  // hospital's money leaving, not a patient's bill.
  'payout:read': ['ADMIN', 'DOCTOR', 'RECEPTIONIST'],

  // Handing the money over — a doctor's fee or a referral commission (Q-19 f).
  // Nothing reaches the ledger: the admin hands the cash over directly, and the
  // settlement row, with who paid it and who carried it, is the whole record
  // (client revision, 2026-09-24).
  'payout:write': ['ADMIN', 'RECEPTIONIST'],
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
