import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { createClient } from '@/lib/supabase/server'

// GET /api/lab-tests/:id - Get single lab test
export async function GET(
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

    const { data, error } = await supabase
      .from('lab_tests')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Lab test not found' },
          { status: 404 }
        )
      }
      throw error
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    console.error('Error fetching lab test:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch lab test' },
      { status: 500 }
    )
  }
}

// PUT /api/lab-tests/:id - Update lab test
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
    if (body.code !== undefined) updateData.code = body.code
    if (body.category !== undefined) updateData.category = body.category
    if (body.description !== undefined) updateData.description = body.description
    if (body.sample_type !== undefined) updateData.sample_type = body.sample_type
    if (body.price !== undefined) updateData.price = body.price
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    updateData.updated_at = new Date().toISOString()

    const supabase = await createClient()

    // If code is being updated, check for duplicates
    if (body.code) {
      const { data: existing } = await supabase
        .from('lab_tests')
        .select('id')
        .eq('code', body.code)
        .neq('id', id)
        .single()

      if (existing) {
        return NextResponse.json(
          { success: false, error: 'Test code already exists' },
          { status: 400 }
        )
      }
    }

    const { data, error } = await supabase
      .from('lab_tests')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Lab test not found' },
          { status: 404 }
        )
      }
      throw error
    }

    return NextResponse.json({
      success: true,
      message: 'Lab test updated successfully',
      data
    })
  } catch (error: any) {
    console.error('Error updating lab test:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update lab test' },
      { status: 500 }
    )
  }
}

// DELETE /api/lab-tests/:id - Delete lab test
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
      .from('lab_tests')
      .delete()
      .eq('id', id)

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      message: 'Lab test deleted successfully'
    })
  } catch (error: any) {
    console.error('Error deleting lab test:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete lab test' },
      { status: 500 }
    )
  }
}
