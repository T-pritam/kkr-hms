/**
 * GET /api/registration-fee — the amount the registration form pre-fills.
 *
 * It is the Charge Catalogue entry flagged `is_registration_fee` (PRD v2 Q-40).
 * `registrationFee` is null when no active entry is flagged, and the form then
 * shows no fee block.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { getRegistrationFeeItem } from '@/lib/billing/registration-fee'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'charge:read')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const item = await getRegistrationFeeItem(supabase)

    return NextResponse.json({ registrationFee: item })
  } catch (error: any) {
    console.error('Error fetching the registration fee:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch the registration fee' },
      { status: 500 }
    )
  }
}
