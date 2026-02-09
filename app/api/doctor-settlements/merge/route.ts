import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (authResult.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only admins can merge settlements' },
        { status: 403 }
      );
    }

    const supabase = await createClient();
    const body = await request.json();

    // Validate settlement_ids
    if (!Array.isArray(body.settlement_ids) || body.settlement_ids.length === 0) {
      return NextResponse.json(
        { error: 'settlement_ids must be a non-empty array' },
        { status: 400 }
      );
    }

    if (body.settlement_ids.length < 2) {
      return NextResponse.json(
        { error: 'Must provide at least 2 settlement IDs to merge' },
        { status: 400 }
      );
    }

    // Fetch all settlements to merge
    const { data: settlements, error: fetchError } = await supabase
      .from('doctor_visit_settlements')
      .select('*')
      .in('id', body.settlement_ids);

    if (fetchError) throw fetchError;

    if (!settlements || settlements.length < 2) {
      return NextResponse.json(
        { error: 'Could not find all settlements to merge' },
        { status: 404 }
      );
    }

    // Validate all settlements belong to same patient
    const patientIds = new Set(settlements.map((s) => s.patient_id));
    if (patientIds.size > 1) {
      return NextResponse.json(
        { error: 'Cannot merge settlements from different patients' },
        { status: 400 }
      );
    }

    // Calculate merged totals
    const totalVisits = settlements.reduce((sum, s) => sum + (s.visit_count || 0), 0);
    const totalAmount = settlements.reduce((sum, s) => sum + (s.total_amount || 0), 0);

    const mergedSettlementData = {
      patient_id: settlements[0].patient_id,
      patient_billing_id: body.merged_settlement?.patient_billing_id || settlements[0].patient_billing_id,
      doctor_id: settlements[0].doctor_id,
      visit_count: body.merged_settlement?.visit_count || totalVisits,
      amount_per_visit: body.merged_settlement?.amount_per_visit || (totalAmount / totalVisits),
      total_amount: body.merged_settlement?.total_amount || totalAmount,
      settlement_type: body.merged_settlement?.settlement_type || 'regular',
      settlement_notes: body.merged_settlement?.notes || `Merged from ${settlements.length} settlements`,
      created_by: authResult.user.id,
    };

    // Create merged settlement
    const { data: mergedSettlement, error: createError } = await supabase
      .from('doctor_visit_settlements')
      .insert(mergedSettlementData)
      .select(`
        *,
        doctor:doctors(id, name, specialist),
        patient:patients(id, patient_id, name)
      `)
      .single();

    if (createError) throw createError;

    // Soft delete old settlements
    const { error: deleteError } = await supabase
      .from('doctor_visit_settlements')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', body.settlement_ids);

    if (deleteError) throw deleteError;

    return NextResponse.json(
      {
        success: true,
        merged_settlement_id: mergedSettlement.id,
        merged_settlement: mergedSettlement,
        deleted_settlement_ids: body.settlement_ids,
        message: `Successfully merged ${settlements.length} settlements`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error merging settlements:', error);
    return NextResponse.json(
      { error: 'Failed to merge settlements', details: String(error) },
      { status: 500 }
    );
  }
}
