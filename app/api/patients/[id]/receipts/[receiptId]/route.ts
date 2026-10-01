import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import { patientPayments, updateReceipt, validateReceipt } from '@/lib/billing/receipts'

type Params = { params: Promise<{ id: string; receiptId: string }> }

async function findReceipt(supabase: Awaited<ReturnType<typeof createClient>>, patientId: string, receiptId: string) {
  const { data } = await supabase
    .from('payment_receipts')
    .select('id, patient_id')
    .eq('id', receiptId)
    .eq('patient_id', patientId)
    .maybeSingle()
  return data
}

/** Save a receipt again: whatever the desk changed, and which payments it carries. */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireBilling(request, 'receipt:write')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const { id: patientId, receiptId } = await params
    const body = await request.json().catch(() => ({}))

    if (!(await findReceipt(supabase, patientId, receiptId))) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    const payments = await patientPayments(supabase, patientId)
    const checked = validateReceipt(body, new Set(payments.map(p => p.id)))
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error, fieldErrors: checked.fieldErrors }, { status: checked.status })
    }

    const saved = await updateReceipt(supabase, { receiptId, fields: checked.value, userId: auth.user.id })
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status })

    return NextResponse.json({ id: saved.id })
  } catch (error) {
    console.error('Error updating receipt:', error)
    return NextResponse.json({ error: 'Failed to save the receipt' }, { status: 500 })
  }
}

/** Delete a saved receipt. The payments it listed are untouched. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireBilling(request, 'receipt:write')
    if (auth.response) return auth.response

    const supabase = await createClient()
    const { id: patientId, receiptId } = await params

    if (!(await findReceipt(supabase, patientId, receiptId))) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    await supabase.from('payment_receipt_lines').delete().eq('receipt_id', receiptId)
    const { error } = await supabase.from('payment_receipts').delete().eq('id', receiptId)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting receipt:', error)
    return NextResponse.json({ error: 'Failed to delete the receipt' }, { status: 500 })
  }
}
