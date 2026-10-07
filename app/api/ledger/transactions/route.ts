/**
 * POST /api/ledger/transactions — add one entry to the ledger.
 *
 * The listing that used to live here moved to `GET /api/ledger/entries`
 * (PRD v2 CR-05): one endpoint, filters, paging and totals, and — the point of
 * the requirement — every user's rows rather than only your own.
 *
 * What's left is the write. Validation and the insert live in lib/ledger, so the
 * settlement routes that also write here are held to the same rules, and the
 * token refresh dance each ledger route used to hand-roll is now one guard.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLedger } from '@/lib/ledger/authz'
import { createLedgerTransaction } from '@/lib/ledger/transactions'
import { checkOpdDate, parseOpdExtras, writeOpdExtras } from '@/lib/ledger/opd'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireLedger(request, 'ledger:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json()
    const supabase = await createClient()

    // The desk picks the OPD day: today by default, or yesterday's or any
    // earlier walk-in entered late (Oct 2026). Never a day still to come.
    if (body.transaction_date !== undefined && body.transaction_date !== '') {
      const dateError = checkOpdDate(body.transaction_date)
      if (dateError) return NextResponse.json({ error: dateError }, { status: 400 })
    }

    // An OPD receipt may carry the doctors who saw the walk-in and a medicine
    // amount (client, 28 Sep) — checked before anything is written.
    const opd = body.source === 'opd' ? parseOpdExtras(body) : null
    if (opd && !opd.ok) {
      return NextResponse.json({ error: opd.error }, { status: opd.status })
    }

    const result = await createLedgerTransaction(supabase, {
      transaction_date: body.transaction_date,
      transaction_type: body.transaction_type,
      source: body.source,
      amount: body.amount,
      payment_mode: body.payment_mode,
      reference_number: body.reference_number,
      patient_id: body.patient_id,
      description: body.description,
      notes: body.notes,
      expense_category: body.expense_category,
      expense_category_detail: body.expense_category_detail,
      created_by: user.id,
      // Every entry is born Open, the admin's included (26 Sep).
      created_by_role: user.role,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.code ? { code: result.code } : {}) },
        { status: result.status },
      )
    }

    const row = result.rows[0]
    if (opd?.ok && (opd.value.doctors.length > 0 || opd.value.medicine_expense !== null)) {
      const extras = await writeOpdExtras(supabase, {
        ledgerId: row.id,
        transactionDate: row.transaction_date,
        extras: opd.value,
        userId: user.id,
      })
      if (!extras.ok) {
        // All or nothing: the receipt goes too, so a retry never doubles it.
        await supabase.from('daily_ledger_transactions').delete().eq('id', row.id)
        return NextResponse.json({ error: extras.error }, { status: extras.status })
      }
    }

    return NextResponse.json(
      { success: true, message: 'Transaction created successfully', data: row },
      { status: 201 },
    )
  } catch (error: any) {
    console.error('Create transaction error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
