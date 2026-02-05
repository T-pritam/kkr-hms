import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
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
    const supabase = await createClient()

    // Get current user for created_by field
    const {
      data: { user },
    } = await supabase.auth.getUser()

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
        created_by: user?.id,
        updated_by: user?.id,
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
