import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';
import { recalculatePatientBilling } from '@/lib/recalculate-billing';

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (authResult.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only admins can create manual settlements' },
        { status: 403 }
      );
    }

    const supabase = await createClient();
    const body = await request.json();

    // Validate required fields
    if (!body.patient_id || !body.doctor_id) {
      return NextResponse.json(
        { error: 'patient_id and doctor_id are required' },
        { status: 400 }
      );
    }

    if (body.visit_count === undefined || body.visit_count < 0) {
      return NextResponse.json(
        { error: 'visit_count must be >= 0' },
        { status: 400 }
      );
    }

    if (body.amount_per_visit === undefined || body.amount_per_visit < 0) {
      return NextResponse.json(
        { error: 'amount_per_visit must be >= 0' },
        { status: 400 }
      );
    }

    // Calculate total_amount if not provided
    let totalAmount = body.total_amount;
    if (!totalAmount || totalAmount === 0) {
      totalAmount = body.visit_count * body.amount_per_visit;
    }

    const settlementData = {
      patient_id: body.patient_id,
      patient_billing_id: body.patient_billing_id || null,
      doctor_id: body.doctor_id,
      visit_count: body.visit_count,
      amount_per_visit: body.amount_per_visit,
      total_amount: totalAmount,
      settlement_type: body.settlement_type || 'regular',
      settlement_notes: body.notes || null,
      created_by: authResult.user.id,
    };

    const { data, error } = await supabase
      .from('doctor_visit_settlements')
      .insert(settlementData)
      .select(`
        *,
        doctor:doctors(id, name, specialist),
        patient:patients(id, patient_id, name)
      `)
      .single();

    if (error) throw error;

    // Recalculate billing totals
    if (data?.patient_billing_id) {
      await recalculatePatientBilling(supabase, data.patient_billing_id);
    }

    return NextResponse.json(
      {
        success: true,
        data,
        message: 'Manual settlement created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating manual settlement:', error);
    return NextResponse.json(
      { error: 'Failed to create manual settlement', details: String(error) },
      { status: 500 }
    );
  }
}
