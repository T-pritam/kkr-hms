/**
 * Who may see and use the ledger (PRD v2, §3.2 and CR-05).
 *
 * The ledger used to be guarded route by route, each one re-deriving the token
 * and then filtering to `created_by = me` for anyone who wasn't an admin. That
 * filter is exactly what the client asked us to remove: *"It should show all
 * entries, so others don't have to guess whether a payment was received."*
 *
 * So access is a role question asked once, here:
 *
 *   ledger:read   the desk and the clinicians — the whole log, everyone's rows.
 *                 A lab technician has no business in the money log (Q-06).
 *   ledger:write  adding an OPD receipt or a payout, and editing your own row.
 *                 Whether *this* row is yours is lib/authz/ownership.ts.
 *   ledger:close  marking rows Closed, and reopening them. Admin only — closing
 *                 is the admin's count of the day (Q-25, Q-28).
 */

import type { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, sendForbidden, sendUnauthorized } from '@/lib/auth/verify'
import type { UserRole } from '@/types/auth'

export type LedgerCapability = 'ledger:read' | 'ledger:write' | 'ledger:close'

/** Everyone who works with the desk's money. Not the lab (Q-06). */
const LEDGER_USERS: UserRole[] = ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']

export const LEDGER_CAPABILITIES: Record<LedgerCapability, UserRole[]> = {
  'ledger:read': LEDGER_USERS,
  'ledger:write': LEDGER_USERS,
  'ledger:close': ['ADMIN'],
}

export interface LedgerUser {
  id: string
  email: string
  role: string
}

type Guard =
  | { user: LedgerUser; response?: undefined }
  | { user?: undefined; response: NextResponse }

export function hasLedgerCapability(
  role: string | undefined | null,
  capability: LedgerCapability,
): boolean {
  if (!role) return false
  return (LEDGER_CAPABILITIES[capability] as string[]).includes(role)
}

export async function requireLedger(
  request: NextRequest,
  capability: LedgerCapability,
): Promise<Guard> {
  const auth = await verifyAuth(request)

  if (!auth.isValid || !auth.user) {
    return { response: sendUnauthorized(auth.error || 'Unauthorized') }
  }

  if (!hasLedgerCapability(auth.user.role, capability)) {
    return {
      response: sendForbidden(
        `Your role (${auth.user.role}) is not permitted to perform this action`,
      ),
    }
  }

  return { user: auth.user as LedgerUser }
}
