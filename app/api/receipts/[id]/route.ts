import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { updateReceipt, validateOldReceipt } from '@/lib/billing/receipts'

type Params = { params: Promise<{ id: string }> }

async function findReceipt(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase.from('payment_receipts').select('id, subject_type').eq('id', id).maybeSingle()
  return data
}

/**
 * Save an old patient's receipt again. A registered patient's receipt is not
 * edited here: its rows are payments, checked against that patient's bill, so
 * it goes through /api/patients/[id]/receipts/[receiptId].
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireBilling(request, 'receipt:write')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const receipt = await findReceipt(supabase, id)
    if (!receipt) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    if (receipt.subject_type !== 'old') {
      return NextResponse.json(
        { error: "This is a registered patient's receipt; open it from the patient's Payments tab or with Open on this page." },
        { status: 409 },
      )
    }

    const checked = validateOldReceipt(body)
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error, fieldErrors: checked.fieldErrors }, { status: checked.status })
    }

    const saved = await updateReceipt(supabase, { receiptId: id, fields: checked.value, userId: auth.user.id })
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status })

    return NextResponse.json({ id: saved.id })
  } catch (error) {
    console.error('Error updating receipt:', error)
    return NextResponse.json({ error: 'Failed to save the receipt' }, { status: 500 })
  }
}

/** Delete a receipt of either kind. A registered patient's payments are untouched. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireBilling(request, 'receipt:write')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const { id } = await params

    if (!(await findReceipt(supabase, id))) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })

    await supabase.from('payment_receipt_lines').delete().eq('receipt_id', id)
    const { error } = await supabase.from('payment_receipts').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting receipt:', error)
    return NextResponse.json({ error: 'Failed to delete the receipt' }, { status: 500 })
  }
}
