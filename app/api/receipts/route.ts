import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import {
  createOldReceipt,
  doctorOptions,
  listAllReceipts,
  validateOldReceipt,
  type ReceiptKind,
} from '@/lib/billing/receipts'

/**
 * The Receipts page (client, 3 Oct): every payment receipt, registered
 * patients' and old patients' alike, and the making of an old patient's.
 *
 * An old patient is someone not in the app. Their receipt is typed in full,
 * amounts included, and is print only — nothing here touches the Ledger,
 * Payments or Finances. A registered patient's receipt is still made through
 * /api/patients/[id]/receipts, from their payments. Reception and admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'receipt:write')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const rawKind = searchParams.get('kind')
    const kind: ReceiptKind = rawKind === 'old' || rawKind === 'patient' ? rawKind : 'all'

    const receipts = await listAllReceipts(supabase, { search: searchParams.get('search') ?? '', kind })
    const { data: me } = await supabase.from('users').select('id, username').eq('id', auth.user.id).maybeSingle()

    return NextResponse.json({
      receipts,
      // For the old-patient form: the Doctors list to pick from, and who is making it.
      doctor_options: await doctorOptions(supabase),
      me: me?.username ?? '',
    })
  } catch (error) {
    console.error('Error fetching receipts:', error)
    return NextResponse.json({ error: 'Failed to fetch receipts' }, { status: 500 })
  }
}

/** Save a new receipt for an old patient — everything typed, amounts included. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'receipt:write')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const body = await request.json().catch(() => ({}))

    const checked = validateOldReceipt(body)
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error, fieldErrors: checked.fieldErrors }, { status: checked.status })
    }

    const saved = await createOldReceipt(supabase, { fields: checked.value, userId: auth.user.id })
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status })

    return NextResponse.json({ id: saved.id }, { status: 201 })
  } catch (error) {
    console.error('Error saving receipt:', error)
    return NextResponse.json({ error: 'Failed to save the receipt' }, { status: 500 })
  }
}
