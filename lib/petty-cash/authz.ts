/**
 * Who may see and use petty cash (PRD v2, CR-02 and §3.2).
 *
 * The client: *"It is only a log, visible to both admin and receptionists."*
 * So reading is open to the desk and the clinicians who work beside it, and the
 * split that matters is on writing:
 *
 *   petty-cash:read   everyone who might spend from the float, or check it.
 *   petty-cash:write   adding an expense, and changing your own (Q-12 = A).
 *   petty-cash:topup   the opening balance and top-ups. The admin hands over
 *                      the cash, so only the admin records it (Q-13).
 */

import type { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, sendForbidden, sendUnauthorized } from '@/lib/auth/verify'
import type { UserRole } from '@/types/auth'

export type PettyCashCapability = 'petty-cash:read' | 'petty-cash:write' | 'petty-cash:topup'

const DESK: UserRole[] = ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']

export const PETTY_CASH_CAPABILITIES: Record<PettyCashCapability, UserRole[]> = {
  'petty-cash:read': DESK,
  'petty-cash:write': DESK,
  'petty-cash:topup': ['ADMIN'],
}

export interface PettyCashUser {
  id: string
  email: string
  role: string
}

type Guard =
  | { user: PettyCashUser; response?: undefined }
  | { user?: undefined; response: NextResponse }

export function hasPettyCashCapability(
  role: string | undefined | null,
  capability: PettyCashCapability,
): boolean {
  if (!role) return false
  return (PETTY_CASH_CAPABILITIES[capability] as string[]).includes(role)
}

export async function requirePettyCash(
  request: NextRequest,
  capability: PettyCashCapability,
): Promise<Guard> {
  const auth = await verifyAuth(request)

  if (!auth.isValid || !auth.user) {
    return { response: sendUnauthorized(auth.error || 'Unauthorized') }
  }

  if (!hasPettyCashCapability(auth.user.role, capability)) {
    return {
      response: sendForbidden(
        `Your role (${auth.user.role}) is not permitted to perform this action`,
      ),
    }
  }

  return { user: auth.user as PettyCashUser }
}
