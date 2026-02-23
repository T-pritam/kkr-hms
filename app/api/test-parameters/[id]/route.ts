import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { createClient } from '@/lib/supabase/server'

// PUT /api/test-parameters/:id - Update test parameter
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const token = request.cookies.get('accessToken')?.value
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const updateData: any = {}

    // Only include fields that are provided
    if (body.name !== undefined) updateData.name = body.name
    if (body.unit !== undefined) updateData.unit = body.unit
    if (body.min_value !== undefined) updateData.min_value = body.min_value
    if (body.max_value !== undefined) updateData.max_value = body.max_value
    if (body.gender_specific !== undefined) updateData.gender_specific = body.gender_specific
    if (body.male_min !== undefined) updateData.male_min = body.male_min
    if (body.male_max !== undefined) updateData.male_max = body.male_max
    if (body.female_min !== undefined) updateData.female_min = body.female_min
    if (body.female_max !== undefined) updateData.female_max = body.female_max
    if (body.display_order !== undefined) updateData.display_order = body.display_order
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('test_parameters')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Test parameter not found' },
          { status: 404 }
        )
      }
      throw error
    }

    return NextResponse.json({
      success: true,
      message: 'Test parameter updated successfully',
      data
    })
  } catch (error: any) {
    console.error('Error updating test parameter:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update test parameter' },
      { status: 500 }
    )
  }
}

// DELETE /api/test-parameters/:id - Delete test parameter
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const token = request.cookies.get('accessToken')?.value
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { id } = await params
    const supabase = await createClient()

    const { error } = await supabase
      .from('test_parameters')
      .delete()
      .eq('id', id)

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      message: 'Test parameter deleted successfully'
    })
  } catch (error: any) {
    console.error('Error deleting test parameter:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete test parameter' },
      { status: 500 }
    )
  }
}
