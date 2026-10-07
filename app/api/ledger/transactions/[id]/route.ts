import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canModify } from '@/lib/authz/ownership'
import { normaliseLedgerCategoryDetail, validateLedgerExpenseCategory } from '@/lib/finances/validate'
import { requireLedger } from '@/lib/ledger/authz'
import { paymentLinks } from '@/lib/billing/payments'
import {
  OPD_FEE_PAID,
  checkOpdDate,
  moveOpdVisits,
  opdHasPaidFee,
  parseOpdExtras,
  readOpdExtras,
  writeOpdExtras,
} from '@/lib/ledger/opd'

/**
 * A patient payment's ledger credit is changed through the payment, never here
 * (PRD v2 CR-12). Editing or deleting it on its own is how the bill's "Paid" and
 * the cash book used to drift apart (G-02) — deleting it even unlinked the
 * payment, which then counted as paid with nothing in the ledger.
 */
async function assertNotPaymentEntry(supabase: any, existing: any): Promise<NextResponse | null> {
  // An unlinked `patient` row is an orphan left by an old payment delete; it
  // stays editable so an admin can clean it up. A registration or lab row never
  // is one — both are only ever written with their payment.
  const linked = (await paymentLinks(supabase, [existing.id])).has(existing.id)
  if (!linked && existing.source !== 'registration' && existing.source !== 'lab') return null

  return NextResponse.json(
    {
      error:
        "This entry is a patient payment. Change or delete it from the patient's Payments tab, so the bill and the ledger stay the same.",
      code: 'LEDGER_ENTRY_IS_PAYMENT',
    },
    { status: 409 }
  )
}

/**
 * GET /api/ledger/transactions/[id] — an OPD receipt's doctors and medicine,
 * for its edit form (client, 28 Sep).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireLedger(request, 'ledger:read')
    if (auth.response) return auth.response
    const supabase = await createClient()
    return NextResponse.json({ success: true, data: await readOpdExtras(supabase, id) })
  } catch (error: any) {
    console.error('Read transaction error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/ledger/transactions/[id]
 * Updates a transaction (amount, payment_mode, reference_number, description;
 * an OPD receipt's date too)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireLedger(request, 'ledger:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json()

    const supabase = await createClient()

    // Get existing transaction
    const { data: existing, error: fetchError } = await supabase
      .from('daily_ledger_transactions')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // One rule for every money entry (CR-01 §3.2): your own row, and only while
    // it is still Open. A closed row is reopened by an admin first (Q-04 = B).
    const allowed = canModify(user, {
      created_by: existing.created_by,
      locked: existing.status === 'closed',
      lockReason:
        'This entry is closed. An admin reopens it on the ledger before it can be changed.',
    })
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.error, code: allowed.code }, { status: allowed.status })
    }

    const paymentEntry = await assertNotPaymentEntry(supabase, existing)
    if (paymentEntry) return paymentEntry

    // Build update object
    const updates: any = {}
    if (body.amount !== undefined) {
      if (body.amount <= 0) {
        return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
      }
      updates.amount = parseFloat(body.amount)
    }
    if (body.payment_mode !== undefined) {
      if (!['cash', 'upi', 'card', 'bank_transfer', 'cheque'].includes(body.payment_mode)) {
        return NextResponse.json({ error: 'Invalid payment mode' }, { status: 400 })
      }
      updates.payment_mode = body.payment_mode
    }
    if (body.reference_number !== undefined) {
      updates.reference_number = body.reference_number || null
    }
    if (body.description !== undefined) {
      if (!body.description || body.description.trim() === '') {
        return NextResponse.json({ error: 'Description cannot be empty' }, { status: 400 })
      }
      updates.description = body.description
    }
    if (body.notes !== undefined) {
      updates.notes = body.notes || null
    }
    // An OPD receipt's day can be corrected while it is Open (Oct 2026) — the
    // Closed check above already refused a closed one. Other rows keep theirs.
    if (existing.source === 'opd' && body.transaction_date !== undefined) {
      const dateError = checkOpdDate(body.transaction_date)
      if (dateError) return NextResponse.json({ error: dateError }, { status: 400 })
      updates.transaction_date = body.transaction_date
    }
    // Only an expense row has a category. Silently ignoring these on a credit or
    // an OPD row is deliberate — the alternative is a 400 for a field the edit
    // form does not even show on those rows.
    if (existing.source === 'expense') {
      if (body.expense_category !== undefined) {
        const categoryError = validateLedgerExpenseCategory(body.expense_category)
        if (categoryError) {
          return NextResponse.json({ error: categoryError }, { status: 400 })
        }
        updates.expense_category = body.expense_category
      }
      if (body.expense_category_detail !== undefined) {
        updates.expense_category_detail = body.expense_category_detail || null
      }
    }

    // Validate UPI requirement
    const finalPaymentMode = updates.payment_mode || existing.payment_mode
    const finalReference = updates.reference_number !== undefined ? updates.reference_number : existing.reference_number

    if (finalPaymentMode === 'upi' && (!finalReference || finalReference.trim() === '')) {
      return NextResponse.json({ error: 'Reference number required for UPI payments' }, { status: 400 })
    }

    // Same reconciliation as UPI above: resolve what the row will actually hold
    // after the merge, so switching a row to 'other' cannot leave the detail
    // behind, and switching away from it cannot strand one.
    if (existing.source === 'expense') {
      const finalCategory = updates.expense_category ?? existing.expense_category
      const finalDetail = updates.expense_category_detail !== undefined
        ? updates.expense_category_detail
        : existing.expense_category_detail

      const detail = normaliseLedgerCategoryDetail(finalCategory, finalDetail)
      if ('error' in detail) {
        return NextResponse.json({ error: detail.error }, { status: 400 })
      }
      if (detail.value !== finalDetail) {
        updates.expense_category_detail = detail.value
      }
    }

    /**
     * An OPD receipt's doctors and medicine (client, 28 Sep). Once a doctor's
     * fee on it is paid, its doctors are fixed; the medicine stays editable.
     */
    let opdExtras: ReturnType<typeof parseOpdExtras> | null = null
    if (existing.source === 'opd' && (body.doctors !== undefined || body.medicine_expense !== undefined)) {
      opdExtras = parseOpdExtras(body)
      if (!opdExtras.ok) {
        return NextResponse.json({ error: opdExtras.error }, { status: opdExtras.status })
      }
      if (body.doctors !== undefined && (await opdHasPaidFee(supabase, id))) {
        const current = await readOpdExtras(supabase, id)
        const key = (list: { doctor_id: string; fee: number }[]) =>
          list.map(d => `${d.doctor_id}:${Number(d.fee)}`).sort().join(',')
        if (key(current.doctors) !== key(opdExtras.value.doctors)) {
          return NextResponse.json({ error: OPD_FEE_PAID, code: 'OPD_FEE_PAID' }, { status: 409 })
        }
        // Same doctors: only the medicine may change.
        await supabase
          .from('daily_ledger_transactions')
          .update({ medicine_expense: opdExtras.value.medicine_expense })
          .eq('id', id)
        opdExtras = null
      }
    }

    // Update transaction
    const { data, error } = await supabase
      .from('daily_ledger_transactions')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        created_by_user:users!created_by(id, username),
        closed_by_user:users!closed_by(id, username),
        patient:patients(id, name)
      `)
      .single()

    if (error) {
      console.error('Update transaction error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // The doctors' visits follow the receipt to its new day — also when a paid
    // fee has fixed the doctors and they are not rewritten below.
    if (updates.transaction_date && updates.transaction_date !== existing.transaction_date) {
      await moveOpdVisits(supabase, id, updates.transaction_date)
    }

    if (opdExtras?.ok) {
      const written = await writeOpdExtras(supabase, {
        ledgerId: id,
        transactionDate: data.transaction_date,
        extras: opdExtras.value,
        userId: user.id,
      })
      if (!written.ok) return NextResponse.json({ error: written.error }, { status: written.status })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Transaction updated successfully',
      data 
    })
  } catch (error: any) {
    console.error('Update transaction error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/ledger/transactions/[id]
 * Deletes a transaction
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireLedger(request, 'ledger:write')
    if (auth.response) return auth.response
    const { user } = auth

    const supabase = await createClient()

    // Get existing transaction
    const { data: existing, error: fetchError } = await supabase
      .from('daily_ledger_transactions')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // One rule for every money entry (CR-01 §3.2): your own row, and only while
    // it is still Open. A closed row is reopened by an admin first (Q-04 = B).
    const allowed = canModify(user, {
      created_by: existing.created_by,
      locked: existing.status === 'closed',
      lockReason:
        'This entry is closed. An admin reopens it on the ledger before it can be changed.',
    })
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.error, code: allowed.code }, { status: allowed.status })
    }

    const paymentEntry = await assertNotPaymentEntry(supabase, existing)
    if (paymentEntry) return paymentEntry

    // Its unpaid visits and fees go with it (on delete cascade); a paid fee
    // keeps it (client, 28 Sep).
    if (existing.source === 'opd' && (await opdHasPaidFee(supabase, id))) {
      return NextResponse.json({ error: OPD_FEE_PAID, code: 'OPD_FEE_PAID' }, { status: 409 })
    }

    // Delete transaction
    const { error } = await supabase
      .from('daily_ledger_transactions')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Delete transaction error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Transaction deleted successfully'
    })
  } catch (error: any) {
    console.error('Delete transaction error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
