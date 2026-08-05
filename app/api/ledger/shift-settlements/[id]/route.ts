import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyToken, getAccessToken, getRefreshToken, setAuthCookies, generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt'
import { recordAudit } from '@/lib/audit/log'

/**
 * DELETE /api/ledger/shift-settlements/[id]
 * Body: { reason }
 *
 * Reverses a shift settlement. Admin only.
 *
 * A reversal supersedes rather than deletes, on the same reasoning as reopening
 * a closed day: the settlement that was recorded — including the cash figure the
 * operator was signed off against — has to remain readable afterwards. The
 * partial unique index then allows a corrected settlement for the same day.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Token refresh logic
    let accessToken = await getAccessToken()
    if (!accessToken) {
      const refreshToken = await getRefreshToken()
      if (!refreshToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const refreshPayload = await verifyToken(refreshToken)
      if (!refreshPayload) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      accessToken = await generateAccessToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role
      })

      const newRefreshToken = await generateRefreshToken({
        userId: refreshPayload.userId,
        email: refreshPayload.email,
        role: refreshPayload.role
      })

      await setAuthCookies(accessToken, newRefreshToken)
    }

    const payload = await verifyToken(accessToken)
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (payload.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

    if (reason.length < 10) {
      return NextResponse.json(
        { error: 'A reason of at least 10 characters is required to reverse a settlement' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: existing } = await supabase
      .from('daily_ledger_shift_settlements')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Settlement not found' }, { status: 404 })
    }

    if (existing.status !== 'active') {
      return NextResponse.json({ error: 'This settlement has already been reversed' }, { status: 409 })
    }

    const { data: reversed, error } = await supabase
      .from('daily_ledger_shift_settlements')
      .update({
        status: 'reversed',
        reversed_at: new Date().toISOString(),
        reversed_by: payload.userId,
        reversal_reason: reason
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Reverse shift settlement error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await recordAudit(supabase, {
      entityType: 'ledger_shift',
      entityId: id,
      action: 'reopened',
      summary: `Reversed the shift settlement for ${existing.settlement_date}`,
      changes: {
        status: { from: 'active', to: 'reversed' },
        reason: { from: null, to: reason }
      },
      actor: { id: payload.userId, role: payload.role }
    })

    return NextResponse.json({
      success: true,
      message: 'Shift settlement reversed',
      data: reversed
    })
  } catch (error: any) {
    console.error('Reverse shift settlement error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
