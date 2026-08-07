/**
 * Temporary charge sheets — list and create.
 *
 * A sheet is an estimate, not a bill. Reception needs to put a list of charges
 * together before there is anything to bill it to: a walk-in who is not
 * registered, or a registered patient asking the cost before agreeing to it.
 * Until now the only place to put a charge was patient_charges, which
 * immediately moves total_charges and creates a due — so quotes were either not
 * written down, or written down as real charges someone had to remember to
 * delete.
 *
 * Nothing here touches patient_billing, installments or the ledger. That happens
 * only on forward, and only deliberately.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'
import {
  normaliseChargeSheetBody,
  normaliseChargeSheetItems,
  validateChargeSheet,
} from '@/lib/billing/validate'
import { firstError } from '@/lib/patients/validate'
import { pageMeta, parsePaging, safeSearch } from '@/lib/api/query'

const LIST_SELECT = `
  id, sheet_no, subject_type, patient_id, opd_name, opd_phone, opd_age, opd_gender,
  status, total_amount, notes, forwarded_at, forwarded_billing_id, created_at, updated_at,
  patient:patients(id, patient_id, name, phone),
  created_by_user:users!created_by(id, username)
`

export async function GET(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'charge:read')
    if (auth.response) return auth.response

    const params = request.nextUrl.searchParams
    const paging = parsePaging(params)
    const search = safeSearch(params.get('search'))

    const supabase = await createClient()
    let query = supabase.from('charge_sheets').select(LIST_SELECT, { count: 'exact' })

    if (search) {
      query = query.or(`sheet_no.ilike.%${search}%,opd_name.ilike.%${search}%`)
    }

    const status = params.get('status')
    if (status && ['draft', 'forwarded', 'cancelled'].includes(status)) {
      query = query.eq('status', status)
    }

    const subject = params.get('subject_type')
    if (subject === 'patient' || subject === 'opd') query = query.eq('subject_type', subject)

    const patientId = params.get('patient_id')
    if (patientId) query = query.eq('patient_id', patientId)

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(paging.from, paging.to)

    if (error) throw error

    return NextResponse.json({ chargeSheets: data || [], ...pageMeta(count, paging) })
  } catch (error: any) {
    console.error('Error fetching charge sheets:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch charge sheets' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'charge-sheet:write')
    if (auth.response) return auth.response
    const { user } = auth

    const body = await request.json().catch(() => ({}))
    const values = normaliseChargeSheetBody(body)
    const items = normaliseChargeSheetItems(body.items)

    const check = validateChargeSheet(values, items, 'create')
    if (!check.ok) {
      return NextResponse.json(
        { error: firstError(check.errors), fieldErrors: check.errors },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    if (values.subject_type === 'patient') {
      const { data: patient } = await supabase
        .from('patients')
        .select('id')
        .eq('id', values.patient_id)
        .maybeSingle()

      if (!patient) {
        return NextResponse.json(
          { error: 'Patient not found', fieldErrors: { patient_id: 'Unknown patient' } },
          { status: 404 }
        )
      }
    }

    // Concurrency-safe, and consumes a number — see next_charge_sheet_no().
    const { data: sheetNo, error: numberError } = await supabase.rpc('next_charge_sheet_no')
    if (numberError) throw numberError

    // Computed here rather than summed from the generated line_total, because the
    // rows do not exist yet and a second round trip to read them back would be a
    // window in which the sheet has a total of zero.
    const total = items.reduce((sum, i) => sum + (i.unit_price ?? 0) * (i.qty ?? 1), 0)

    const { data: sheet, error } = await supabase
      .from('charge_sheets')
      .insert({
        ...values,
        sheet_no: sheetNo,
        status: 'draft',
        total_amount: total,
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single()

    if (error) throw error

    if (items.length > 0) {
      const { error: itemError } = await supabase.from('charge_sheet_items').insert(
        items.map(item => ({
          charge_sheet_id: sheet.id,
          charge_item_id: item.charge_item_id,
          charge_name: item.charge_name,
          description: item.description,
          billing_mode: item.billing_mode,
          unit_price: item.unit_price,
          qty: item.qty,
          service_date: item.service_date,
        }))
      )

      // The sheet without its lines is a worse artefact than no sheet at all —
      // it would show a total with nothing behind it. There are no transactions
      // through PostgREST, so unwind by hand.
      if (itemError) {
        await supabase.from('charge_sheets').delete().eq('id', sheet.id)
        throw itemError
      }
    }

    return NextResponse.json(
      { message: `Charge sheet ${sheetNo} created`, chargeSheet: sheet },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating charge sheet:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create the charge sheet' },
      { status: 500 }
    )
  }
}
