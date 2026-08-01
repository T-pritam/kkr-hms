import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLab } from '@/lib/lab/authz'
import { deriveAbnormal, resolveRange } from '@/lib/lab/ranges'
import { computeCalculated } from '@/lib/lab/formula'
import { deriveOrderStatus } from '@/lib/lab/status'
import type { ItemStatus, OrderStatus } from '@/lib/lab/status'
import type { ParameterRange, TestParameter } from '@/lib/lab/types'

type Params = { params: Promise<{ id: string }> }

// GET /api/lab/order-items/:id/results
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'order:read')
    if (auth.response) return auth.response

    const { id } = await params
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('lab_result_values')
      .select('*')
      .eq('order_item_id', id)

    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('Error fetching result values:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch result values' },
      { status: 500 },
    )
  }
}

/**
 * POST /api/lab/order-items/:id/results — save the values for one test.
 *
 * Everything clinical is derived here and never taken from the request: the
 * reference interval that applies to this patient, whether the result is out of
 * range, and whether it is critical. The old endpoint accepted
 * `flag: v.flag || computed`, which let the client overrule the lab.
 *
 * Re-submitting is how results get corrected, so this is an upsert, and any
 * parameter submitted blank has its stored value removed.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireLab(request, 'result:write')
    if (auth.response) return auth.response

    const { id } = await params
    const body = await request.json()
    const submitted = body?.values

    if (!Array.isArray(submitted)) {
      return NextResponse.json(
        { success: false, error: 'values must be an array' },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    // ── Context ──────────────────────────────────────────────────────────────
    const { data: item, error: itemError } = await supabase
      .from('lab_order_items')
      .select('id, order_id, test_id, status')
      .eq('id', id)
      .single()

    if (itemError || !item) {
      return NextResponse.json({ success: false, error: 'Test not found on any order' }, { status: 404 })
    }

    if (item.status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: 'This test was cancelled and cannot take results' },
        { status: 400 },
      )
    }

    const { data: order, error: orderError } = await supabase
      .from('lab_orders')
      .select('id, status, patient_age, patient_gender')
      .eq('id', item.order_id)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
    }

    if (order.status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: 'This order was cancelled and cannot take results' },
        { status: 400 },
      )
    }

    // ── Definitions ──────────────────────────────────────────────────────────
    const { data: paramRows, error: paramError } = await supabase
      .from('test_parameters')
      .select('*')
      .eq('test_id', item.test_id)
      .eq('is_active', true)

    if (paramError) throw paramError
    const parameters = (paramRows || []) as TestParameter[]
    const byId = new Map(parameters.map(p => [p.id, p]))

    const unknown = submitted
      .map((v: any) => v?.parameter_id)
      .filter((pid: string) => pid && !byId.has(pid))
    if (unknown.length > 0) {
      return NextResponse.json(
        { success: false, error: 'One or more parameters do not belong to this test' },
        { status: 400 },
      )
    }

    let ranges: ParameterRange[] = []
    if (parameters.length > 0) {
      const { data, error } = await supabase
        .from('test_parameter_ranges')
        .select('*')
        .in('parameter_id', parameters.map(p => p.id))
      if (error) throw error
      ranges = (data || []) as ParameterRange[]
    }

    // ── Entered values ───────────────────────────────────────────────────────
    const enteredNumeric: Record<string, number | null> = {}
    const enteredText: Record<string, string | null> = {}
    const noteFor: Record<string, string | null> = {}
    const cleared: string[] = []

    for (const v of submitted) {
      const pid = v?.parameter_id
      if (!pid) continue

      const num = v.value === null || v.value === undefined || v.value === '' ? null : Number(v.value)
      const text = typeof v.text_value === 'string' ? v.text_value.trim() : null

      if (num === null && !text) { cleared.push(pid); continue }
      if (num !== null && !isFinite(num)) {
        return NextResponse.json(
          { success: false, error: `"${byId.get(pid)?.name ?? 'A parameter'}" has a value that is not a number` },
          { status: 400 },
        )
      }

      enteredNumeric[pid] = num
      enteredText[pid] = text
      noteFor[pid] = typeof v.notes === 'string' && v.notes.trim() ? v.notes.trim() : null
    }

    // ── Calculated parameters ────────────────────────────────────────────────
    const computed = computeCalculated(parameters, enteredNumeric)
    for (const [pid, value] of Object.entries(computed)) {
      if (value === null) {
        // A calculated parameter whose inputs are incomplete must not keep a
        // stale figure from an earlier save.
        if (!(pid in enteredNumeric)) cleared.push(pid)
        continue
      }
      enteredNumeric[pid] = value
      enteredText[pid] = enteredText[pid] ?? null
    }

    // ── Derive and write ─────────────────────────────────────────────────────
    const patient = { ageYears: order.patient_age ?? null, gender: order.patient_gender ?? null }

    const rows = Object.keys(enteredNumeric).map(pid => {
      const parameter = byId.get(pid)!
      const resolved = resolveRange(parameter, ranges, patient)
      const value = enteredNumeric[pid]
      const textValue = enteredText[pid] ?? null
      const { abnormal, isCritical } = deriveAbnormal({ value, textValue }, resolved)

      return {
        order_item_id: id,
        parameter_id: pid,
        value,
        text_value: textValue,
        unit: parameter.unit ?? null,
        ref_display: resolved.display,
        ref_min: resolved.refMin,
        ref_max: resolved.refMax,
        abnormal,
        is_critical: isCritical,
        notes: noteFor[pid] ?? null,
      }
    })

    if (cleared.length > 0) {
      const { error } = await supabase
        .from('lab_result_values')
        .delete()
        .eq('order_item_id', id)
        .in('parameter_id', cleared)
      if (error) throw error
    }

    let saved: any[] = []
    if (rows.length > 0) {
      const { data, error } = await supabase
        .from('lab_result_values')
        .upsert(rows, { onConflict: 'order_item_id,parameter_id' })
        .select()
      if (error) throw error
      saved = data || []
    }

    // ── Item status ──────────────────────────────────────────────────────────
    // Authorising and then editing puts the test back to "results entered", so
    // the report cannot claim a sign-off that predates the current numbers.
    const nextItemStatus: ItemStatus = rows.length > 0 ? 'results_entered' : 'pending'
    const itemUpdate: Record<string, any> = { status: nextItemStatus }

    if (rows.length > 0) {
      itemUpdate.entered_by = auth.user.id
      itemUpdate.entered_at = new Date().toISOString()
      if (item.status === 'authorised') {
        itemUpdate.authorised_by = null
        itemUpdate.authorised_at = null
      }
    }

    const { error: itemUpdateError } = await supabase
      .from('lab_order_items')
      .update(itemUpdate)
      .eq('id', id)
    if (itemUpdateError) throw itemUpdateError

    // ── Order status ─────────────────────────────────────────────────────────
    const { data: siblings } = await supabase
      .from('lab_order_items')
      .select('id, status')
      .eq('order_id', item.order_id)

    const nextOrderStatus = deriveOrderStatus(
      order.status as OrderStatus,
      (siblings || []).map((s: any) => ({ status: s.status as ItemStatus })),
    )

    if (nextOrderStatus) {
      const orderUpdate: Record<string, any> = { status: nextOrderStatus }
      if (nextOrderStatus === 'reported') orderUpdate.reported_at = new Date().toISOString()
      await supabase.from('lab_orders').update(orderUpdate).eq('id', item.order_id)
    }

    return NextResponse.json({
      success: true,
      message: rows.length > 0 ? 'Results saved' : 'Results cleared',
      data: {
        values: saved,
        item_status: nextItemStatus,
        order_status: nextOrderStatus ?? order.status,
        critical: saved.filter((v: any) => v.is_critical).length,
      },
    })
  } catch (error: any) {
    console.error('Error saving result values:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save result values' },
      { status: 500 },
    )
  }
}
