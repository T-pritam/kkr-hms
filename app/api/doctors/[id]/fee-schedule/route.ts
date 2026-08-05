/**
 * A doctor's rate card: what they are paid for each kind of visit.
 *
 * GET returns every active purpose with the doctor's fee against it, including
 * the ones they have no row for — the form needs the full grid, and a missing
 * row is a real state ("no agreed rate") rather than an absence to hide.
 *
 * PUT replaces the whole card in one request, which is how the form edits it.
 * Upsert on the (doctor_id, visit_purpose_id) unique constraint rather than
 * delete-then-insert: the latter would briefly leave a doctor with no rates, and
 * a failure halfway through would leave them that way.
 *
 * ADMIN only. A doctor must not be able to set their own fee, which is why this
 * uses `doctor-fee:write` and not the doctor registry's `doctor:write` (which
 * reception holds).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBilling } from '@/lib/billing/authz'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireBilling(request, 'charge:read')
    if (auth.response) return auth.response

    const { id: doctorId } = await params
    const supabase = await createClient()

    const { data: doctor } = await supabase
      .from('doctors')
      .select('id, name')
      .eq('id', doctorId)
      .maybeSingle()

    if (!doctor) return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })

    const { data: purposes, error: purposeError } = await supabase
      .from('visit_purposes')
      .select('id, code, name, default_fee, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (purposeError) throw purposeError

    const { data: rates, error: rateError } = await supabase
      .from('doctor_fee_schedule')
      .select('id, visit_purpose_id, fee, is_active')
      .eq('doctor_id', doctorId)

    if (rateError) throw rateError

    const byPurpose = new Map((rates || []).map(r => [r.visit_purpose_id, r]))

    const schedule = (purposes || []).map(purpose => {
      const rate = byPurpose.get(purpose.id)
      return {
        visit_purpose_id: purpose.id,
        code: purpose.code,
        name: purpose.name,
        // null, not 0 — "no agreed rate" and "free" are different answers, and
        // the form must be able to show the difference.
        fee: rate ? Number(rate.fee) : null,
        default_fee: Number(purpose.default_fee) || 0,
        is_active: rate ? rate.is_active !== false : true,
      }
    })

    return NextResponse.json({ doctor, schedule })
  } catch (error: any) {
    console.error('Error fetching the fee schedule:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch the fee schedule' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireBilling(request, 'doctor-fee:write')
    if (auth.response) return auth.response
    const { user } = auth

    const { id: doctorId } = await params
    const body = await request.json().catch(() => ({}))
    const entries = Array.isArray(body.schedule) ? body.schedule : null

    if (!entries) {
      return NextResponse.json({ error: 'A schedule array is required' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: doctor } = await supabase
      .from('doctors')
      .select('id')
      .eq('id', doctorId)
      .maybeSingle()

    if (!doctor) return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })

    // A null or blank fee means "no agreed rate" and clears the row; a number
    // sets one. Zero is a real rate, so it must survive the filter below.
    const toSet: { visit_purpose_id: string; fee: number }[] = []
    const toClear: string[] = []

    for (const entry of entries) {
      const purposeId = entry?.visit_purpose_id
      if (!purposeId || typeof purposeId !== 'string') continue

      const raw = entry.fee
      if (raw === null || raw === undefined || raw === '') {
        toClear.push(purposeId)
        continue
      }

      const fee = Number(raw)
      if (!Number.isFinite(fee) || fee < 0) {
        return NextResponse.json(
          {
            error: 'Every fee must be zero or more',
            fieldErrors: { [`fee.${purposeId}`]: 'Must be zero or more' },
          },
          { status: 400 }
        )
      }

      toSet.push({ visit_purpose_id: purposeId, fee })
    }

    if (toSet.length > 0) {
      const { error } = await supabase.from('doctor_fee_schedule').upsert(
        toSet.map(entry => ({
          doctor_id: doctorId,
          visit_purpose_id: entry.visit_purpose_id,
          fee: entry.fee,
          is_active: true,
          created_by: user.id,
          updated_by: user.id,
        })),
        { onConflict: 'doctor_id,visit_purpose_id' }
      )

      if (error) throw error
    }

    if (toClear.length > 0) {
      const { error } = await supabase
        .from('doctor_fee_schedule')
        .delete()
        .eq('doctor_id', doctorId)
        .in('visit_purpose_id', toClear)

      if (error) throw error
    }

    return NextResponse.json({
      message: 'Fee schedule saved',
      set: toSet.length,
      cleared: toClear.length,
    })
  } catch (error: any) {
    console.error('Error saving the fee schedule:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save the fee schedule' },
      { status: 500 }
    )
  }
}
