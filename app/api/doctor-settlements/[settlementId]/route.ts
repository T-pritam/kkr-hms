import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ settlementId: string }> }
) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (authResult.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only admins can update settlements' },
        { status: 403 }
      );
    }

    const supabase = await createClient();
    const { settlementId } = await params;
    const body = await request.json();

    const updateData: any = {
      updated_by: authResult.user.id,
    };

    // Handle pricing mode: price_per_visit or total_amount
    if (body.pricing_mode === 'per_visit') {
      // User provided price_per_visit, calculate total_amount
      if (body.amount_per_visit !== undefined && body.visit_count !== undefined) {
        updateData.amount_per_visit = body.amount_per_visit;
        updateData.total_amount = body.amount_per_visit * body.visit_count;
        updateData.visit_count = body.visit_count;
      }
    } else if (body.pricing_mode === 'total') {
      // User provided total_amount, calculate amount_per_visit
      if (body.total_amount !== undefined && body.visit_count !== undefined && body.visit_count > 0) {
        updateData.total_amount = body.total_amount;
        updateData.amount_per_visit = body.total_amount / body.visit_count;
        updateData.visit_count = body.visit_count;
      }
    } else {
      // Legacy mode: accept individual fields
      if (body.amount_per_visit !== undefined) {
        updateData.amount_per_visit = body.amount_per_visit;
      }
      if (body.total_amount !== undefined) {
        updateData.total_amount = body.total_amount;
      }
      if (body.visit_count !== undefined) {
        updateData.visit_count = body.visit_count;
      }
    }

    // Handle settlement status separately from pricing
    if (body.settled !== undefined) {
      updateData.settled = body.settled;
      if (body.settled) {
        updateData.settlement_date = body.settlement_date || new Date().toISOString();
      } else {
        // Unsettling: clear settlement fields
        updateData.settlement_date = null;
        updateData.settlement_amount = null;
        updateData.payment_method = null;
        updateData.transaction_reference = null;
      }
    }

    if (body.settlement_amount !== undefined) {
      updateData.settlement_amount = body.settlement_amount;
    }

    if (body.payment_method !== undefined) {
      updateData.payment_method = body.payment_method;
    }

    if (body.transaction_reference !== undefined) {
      updateData.transaction_reference = body.transaction_reference;
    }

    if (body.settlement_notes !== undefined) {
      updateData.settlement_notes = body.settlement_notes;
    }

    if (body.settlement_type !== undefined) {
      updateData.settlement_type = body.settlement_type;
    }

    const { data, error } = await supabase
      .from('doctor_visit_settlements')
      .update(updateData)
      .eq('id', settlementId)
      .select(`
        *,
        doctor:doctors(id, name, specialist),
        patient:patients(id, patient_id, name)
      `)
      .single();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: 'Settlement not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data,
        message: 'Settlement updated successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating settlement:', error);
    return NextResponse.json(
      { error: 'Failed to update settlement', details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ settlementId: string }> }
) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (authResult.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only admins can delete settlements' },
        { status: 403 }
      );
    }

    const supabase = await createClient();
    const { settlementId } = await params;
    const body = await request.json();

    // Check if soft delete or hard delete
    const useSoftDelete = body.soft_delete !== false; // Default to soft delete

    if (useSoftDelete) {
      // Soft delete: mark as deleted
      const { error } = await supabase
        .from('doctor_visit_settlements')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', settlementId);

      if (error) throw error;

      return NextResponse.json(
        {
          success: true,
          message: 'Settlement soft deleted successfully',
        },
        { status: 200 }
      );
    } else {
      // Hard delete
      const { error } = await supabase
        .from('doctor_visit_settlements')
        .delete()
        .eq('id', settlementId);

      if (error) throw error;

      return NextResponse.json(
        {
          success: true,
          message: 'Settlement deleted permanently',
        },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error('Error deleting settlement:', error);
    return NextResponse.json(
      { error: 'Failed to delete settlement', details: String(error) },
      { status: 500 }
    );
  }
}
