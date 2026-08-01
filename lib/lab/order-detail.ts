/**
 * Assembles a complete lab order: header, tests, values, parameter definitions
 * and the reference intervals that applied to this patient.
 *
 * Fetched as explicit steps rather than one deeply nested PostgREST select. The
 * values → parameters → ranges chain does not follow the conventional foreign
 * key naming, and the report needs the parameters of tests that have no values
 * yet, which an embedded select cannot express.
 */

import { resolveRange } from './ranges'
import type { ParameterRange, ResolvedRange, TestParameter } from './types'

export interface LoadedValue {
  id: string
  order_item_id: string
  parameter_id: string
  value: number | null
  text_value: string | null
  unit: string | null
  ref_display: string | null
  ref_min: number | null
  ref_max: number | null
  abnormal: 'H' | 'L' | 'A' | null
  is_critical: boolean
  notes: string | null
}

export interface LoadedParameter extends TestParameter {
  ranges: ParameterRange[]
  /** The interval that applies to this order's patient. */
  resolved: ResolvedRange
}

export interface LoadedItem {
  id: string
  order_id: string
  test_id: string
  test_name: string
  test_code: string
  category: string | null
  specimen: string | null
  method: string | null
  price: number
  status: string
  interpretation: string | null
  interpretation_by_name: string | null
  interpretation_at: string | null
  entered_by_name: string | null
  entered_at: string | null
  authorised_by_name: string | null
  authorised_at: string | null
  display_order: number
  parameters: LoadedParameter[]
  values: LoadedValue[]
}

export interface LoadedOrder {
  [key: string]: any
  id: string
  order_no: string
  referring_doctor_name: string | null
  created_by_name: string | null
  collected_by_name: string | null
  items: LoadedItem[]
}

/** Minimal shape of the Supabase client methods used here. */
type Client = { from: (table: string) => any }

export async function loadOrderDetail(supabase: Client, orderId: string): Promise<LoadedOrder | null> {
  const { data: order, error: orderError } = await supabase
    .from('lab_orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (orderError || !order) return null

  const { data: itemRows, error: itemsError } = await supabase
    .from('lab_order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('display_order', { ascending: true })

  if (itemsError) throw itemsError
  const items = itemRows || []

  // ── Values ─────────────────────────────────────────────────────────────────
  const itemIds = items.map((i: any) => i.id)
  let values: LoadedValue[] = []
  if (itemIds.length > 0) {
    const { data, error } = await supabase
      .from('lab_result_values')
      .select('*')
      .in('order_item_id', itemIds)
    if (error) throw error
    values = (data || []) as LoadedValue[]
  }

  // ── Parameter definitions ──────────────────────────────────────────────────
  const testIds = [...new Set(items.map((i: any) => i.test_id))]
  let parameters: any[] = []
  if (testIds.length > 0) {
    const { data, error } = await supabase
      .from('test_parameters')
      .select('*')
      .in('test_id', testIds)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
    if (error) throw error
    parameters = data || []
  }

  const parameterIds = parameters.map((p: any) => p.id)
  let ranges: ParameterRange[] = []
  if (parameterIds.length > 0) {
    const { data, error } = await supabase
      .from('test_parameter_ranges')
      .select('*')
      .in('parameter_id', parameterIds)
      .order('display_order', { ascending: true })
    if (error) throw error
    ranges = (data || []) as ParameterRange[]
  }

  // ── People ─────────────────────────────────────────────────────────────────
  const userIds = [...new Set([
    order.created_by,
    order.collected_by,
    ...items.flatMap((i: any) => [i.entered_by, i.authorised_by, i.interpretation_by]),
  ].filter(Boolean))]

  const userNames = new Map<string, string>()
  if (userIds.length > 0) {
    const { data } = await supabase.from('users').select('id, username').in('id', userIds)
    for (const u of data || []) userNames.set(u.id, u.username)
  }

  let doctorName: string | null = order.referring_doctor_name ?? null
  if (order.referring_doctor_id) {
    const { data: doctor } = await supabase
      .from('doctors')
      .select('id, name, designation')
      .eq('id', order.referring_doctor_id)
      .single()
    if (doctor?.name) doctorName = doctor.name
  }

  // ── Assemble ───────────────────────────────────────────────────────────────
  const patient = { ageYears: order.patient_age ?? null, gender: order.patient_gender ?? null }

  const loadedItems: LoadedItem[] = items.map((item: any) => {
    const testParams = parameters
      .filter((p: any) => p.test_id === item.test_id)
      .map((p: any) => {
        const own = ranges.filter(r => r.parameter_id === p.id)
        return {
          ...(p as TestParameter),
          ranges: own,
          resolved: resolveRange(p as TestParameter, own, patient),
        }
      })

    // Parameter order governs the report; values follow their parameter.
    const order$ = new Map(testParams.map((p, i) => [p.id, i]))
    const itemValues = values
      .filter(v => v.order_item_id === item.id)
      .sort((a, b) => (order$.get(a.parameter_id) ?? 0) - (order$.get(b.parameter_id) ?? 0))

    return {
      ...item,
      interpretation_by_name: item.interpretation_by ? userNames.get(item.interpretation_by) ?? null : null,
      entered_by_name:        item.entered_by        ? userNames.get(item.entered_by)        ?? null : null,
      authorised_by_name:     item.authorised_by     ? userNames.get(item.authorised_by)     ?? null : null,
      parameters: testParams,
      values: itemValues,
    }
  })

  return {
    ...order,
    referring_doctor_name: doctorName,
    created_by_name:   order.created_by   ? userNames.get(order.created_by)   ?? null : null,
    collected_by_name: order.collected_by ? userNames.get(order.collected_by) ?? null : null,
    items: loadedItems,
  }
}
