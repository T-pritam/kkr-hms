import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLab } from '@/lib/lab/authz'
import { ageFromDob } from '@/lib/lab/ranges'
import { ORDER_PRIORITIES } from '@/lib/lab/constants'
import { isOrderStatus } from '@/lib/lab/status'

const ORDER_LIST_SELECT = `
  *,
  updated_by_user:users!updated_by(id, username),
  lab_order_items (
    id, test_id, test_name, test_code, category, price, status, display_order
  )
`

// GET /api/lab/orders — worklist
export async function GET(request: NextRequest) {
  try {
    const auth = await requireLab(request, 'order:read')
    if (auth.response) return auth.response

    const sp = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') || '1'))
    const pageSize = Math.min(Math.max(1, parseInt(sp.get('pageSize') || '25')), 100)
    const status = sp.get('status')
    const priority = sp.get('priority')
    const patientId = sp.get('patient_id')
    const fromDate = sp.get('from_date')
    const toDate = sp.get('to_date')
    const search = sp.get('search')?.trim()

    const supabase = await createClient()
    let query = supabase.from('lab_orders').select(ORDER_LIST_SELECT, { count: 'exact' })

    if (status && isOrderStatus(status)) query = query.eq('status', status)
    if (priority) query = query.eq('priority', priority)
    if (patientId) query = query.eq('patient_id', patientId)
    if (fromDate) query = query.gte('registered_at', fromDate)
    if (toDate) query = query.lte('registered_at', `${toDate}T23:59:59.999Z`)

    if (search) {
      // Escape the PostgREST `or` separators so a comma or paren in the search
      // box cannot rewrite the filter expression.
      const safe = search.replace(/[,()]/g, ' ')
      query = query.or(
        `order_no.ilike.%${safe}%,patient_name.ilike.%${safe}%,` +
        `patient_phone.ilike.%${safe}%,patient_display_id.ilike.%${safe}%`,
      )
    }

    const from = (page - 1) * pageSize
    const { data, error, count } = await query
      .order('registered_at', { ascending: false })
      .range(from, from + pageSize - 1)

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: {
        data: data || [],
        pagination: {
          page,
          pageSize,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize),
        },
      },
    })
  } catch (error: any) {
    console.error('Error fetching lab orders:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch lab orders' },
      { status: 500 },
    )
  }
}

// POST /api/lab/orders — register an order with one or more tests
export async function POST(request: NextRequest) {
  try {
    const auth = await requireLab(request, 'order:write')
    if (auth.response) return auth.response

    const body = await request.json()
    const {
      patient_id,
      patient_name,
      patient_phone,
      patient_age,
      patient_gender,
      referring_doctor_id,
      referring_doctor_name,
      priority,
      registered_at,
      discount,
      notes,
      tests,
    } = body

    if (!Array.isArray(tests) || tests.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Select at least one test' },
        { status: 400 },
      )
    }

    const testIds: string[] = [...new Set(tests.map((t: any) => t?.test_id).filter(Boolean))]
    if (testIds.length !== tests.length) {
      return NextResponse.json(
        { success: false, error: 'Each test may only appear once in an order' },
        { status: 400 },
      )
    }

    if (priority && !ORDER_PRIORITIES.includes(priority)) {
      return NextResponse.json(
        { success: false, error: `Priority must be one of: ${ORDER_PRIORITIES.join(', ')}` },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    // ── Patient ──────────────────────────────────────────────────────────────
    // For a registered patient the demographics are read from the patient
    // record rather than trusted from the client, then frozen onto the order.
    let snapshot = {
      patient_id: null as string | null,
      patient_name: (patient_name || '').trim(),
      patient_phone: patient_phone || null,
      patient_age: patient_age ?? null,
      patient_gender: patient_gender || null,
      patient_display_id: null as string | null,
      patient_status: null as string | null,
    }

    if (patient_id) {
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .select('id, patient_id, name, phone, gender, date_of_birth, status')
        .eq('id', patient_id)
        .single()

      if (patientError || !patient) {
        return NextResponse.json(
          { success: false, error: 'Patient not found' },
          { status: 404 },
        )
      }

      snapshot = {
        patient_id: patient.id,
        patient_name: patient.name,
        patient_phone: patient.phone ?? null,
        patient_age: patient_age ?? ageFromDob(patient.date_of_birth),
        patient_gender: patient.gender ?? null,
        patient_display_id: patient.patient_id ?? null,
        patient_status: patient.status ?? null,
      }
    }

    if (!snapshot.patient_name) {
      return NextResponse.json(
        { success: false, error: 'Patient name is required' },
        { status: 400 },
      )
    }

    // ── Tests ────────────────────────────────────────────────────────────────
    const { data: catalogue, error: catalogueError } = await supabase
      .from('lab_tests')
      .select('id, name, code, category, sample_type, method, price, is_active')
      .in('id', testIds)

    if (catalogueError) throw catalogueError

    const byId = new Map((catalogue || []).map((t: any) => [t.id, t]))
    const missing = testIds.filter(id => !byId.has(id))
    if (missing.length > 0) {
      return NextResponse.json(
        { success: false, error: 'One or more selected tests no longer exist' },
        { status: 400 },
      )
    }

    const inactive = (catalogue || []).filter((t: any) => t.is_active === false)
    if (inactive.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `These tests are no longer offered: ${inactive.map((t: any) => t.name).join(', ')}`,
        },
        { status: 400 },
      )
    }

    const items = tests.map((t: any, index: number) => {
      const cat = byId.get(t.test_id)!
      const override = Number(t.price)
      const price = isFinite(override) && override >= 0 ? override : Number(cat.price || 0)
      return {
        test_id: cat.id,
        test_name: cat.name,
        test_code: cat.code,
        category: cat.category ?? null,
        specimen: cat.sample_type ?? null,
        method: cat.method ?? null,
        price,
        display_order: index,
      }
    })

    const total = items.reduce((sum, i) => sum + i.price, 0)
    const discountAmount = Math.min(Math.max(Number(discount) || 0, 0), total)

    // ── Write ────────────────────────────────────────────────────────────────
    const { data: generated, error: numberError } = await supabase.rpc('next_lab_order_no')
    if (numberError) throw numberError

    const orderNo = typeof generated === 'string' ? generated : generated?.[0]
    if (!orderNo) throw new Error('Could not generate an order number')

    const { data: order, error: orderError } = await supabase
      .from('lab_orders')
      .insert({
        order_no: orderNo,
        ...snapshot,
        referring_doctor_id: referring_doctor_id || null,
        referring_doctor_name: referring_doctor_name?.trim() || null,
        priority: priority || 'routine',
        status: 'registered',
        registered_at: registered_at || new Date().toISOString(),
        created_by: auth.user.id,
        total_amount: total,
        discount: discountAmount,
        net_amount: total - discountAmount,
        notes: notes || null,
      })
      .select()
      .single()

    if (orderError) throw orderError

    const { data: created, error: itemsError } = await supabase
      .from('lab_order_items')
      .insert(items.map(i => ({ ...i, order_id: order.id, status: 'pending' })))
      .select()

    if (itemsError) {
      // supabase-js has no transactions, so undo the header rather than leave an
      // order with no tests on it.
      await supabase.from('lab_orders').delete().eq('id', order.id)
      throw itemsError
    }

    return NextResponse.json(
      {
        success: true,
        message: `Order ${orderNo} created`,
        data: { ...order, lab_order_items: created || [] },
      },
      { status: 201 },
    )
  } catch (error: any) {
    console.error('Error creating lab order:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create lab order' },
      { status: 500 },
    )
  }
}
