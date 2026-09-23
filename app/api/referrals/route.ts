import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireBilling } from '@/lib/billing/authz'

/**
 * Referral people (PRD v2, CR-01 §3.2 row 3).
 *
 * Neither handler checked anything at all — not even that the caller was signed
 * in — so anyone who could reach the URL could add a referral person, and the
 * `created_by` it tried to record came from `supabase.auth.getUser()`, which is
 * always null here: this app signs users in with its own JWT cookie. Reading is
 * desk work, and so is adding one; editing and retiring stay with admin.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'charge:read')
    if (auth.response) return auth.response

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('referrals')
      .select('id, name, phone, status, created_at')
      .order('name', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'charge:write')
    if (auth.response) return auth.response
    const { user } = auth

    const supabase = await createClient()
    const body = await request.json()
    const { name, phone } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Referral name is required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('referrals')
      .insert({
        name,
        phone: phone || null,
        status: 'active',
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
