import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireBilling } from '@/lib/billing/authz';
import { recalculatePatientBilling } from '@/lib/recalculate-billing';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBilling(request, 'doctor-fee:write');
    if (auth.response) return auth.response;
    const authResult = { user: auth.user };

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

    // …and the same doctor. The merged row takes the first row's doctor, so
    // merging two doctors' fees silently moved every visit to the first and
    // the second doctor's fee disappeared (BUGS #45).
    if (new Set(settlements.map((s) => s.doctor_id)).size > 1) {
      return NextResponse.json(
        { error: 'Cannot merge fees for different doctors' },
        { status: 400 }
      );
    }

    // A paid fee is a record that money left: merging it into a new, unpaid row
    // and retiring the original would erase the payout from money out. And a
    // deleted row is not there to merge.
    if (settlements.some((s) => s.settled === true)) {
      return NextResponse.json(
        { error: 'A paid fee cannot be merged. Un-pay it first, or merge only unpaid fees.' },
        { status: 409 }
      );
    }
    if (settlements.some((s) => s.deleted_at)) {
      return NextResponse.json({ error: 'A deleted fee cannot be merged' }, { status: 409 });
    }

    // Calculate merged totals
    const totalVisits = settlements.reduce((sum, s) => sum + (s.visit_count || 0), 0);
    const totalAmount = settlements.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
    // Rows straight out of sync have no visits yet; dividing by that wrote NaN
    // into the rate (BUGS #44). Zero visits counts as one, as `payDoctorFee` does.
    const ratePer = totalAmount / Math.max(totalVisits, 1);

    const mergedSettlementData = {
      patient_id: settlements[0].patient_id,
      patient_billing_id: body.merged_settlement?.patient_billing_id || settlements[0].patient_billing_id,
      doctor_id: settlements[0].doctor_id,
      visit_count: body.merged_settlement?.visit_count || totalVisits,
      amount_per_visit: body.merged_settlement?.amount_per_visit || ratePer,
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

    // Point every visit that was billed under one of the merged-away rows at the
    // new one instead — otherwise they'd be left referencing a row that is about
    // to be soft-deleted, invisible to any future sync.
    const { error: relinkError } = await supabase
      .from('patient_consultations')
      .update({ settlement_id: mergedSettlement.id })
      .in('settlement_id', body.settlement_ids);

    if (relinkError) throw relinkError;

    // Soft delete old settlements
    const { error: deleteError } = await supabase
      .from('doctor_visit_settlements')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', body.settlement_ids);

    if (deleteError) throw deleteError;

    // Recalculate billing totals
    if (mergedSettlement.patient_billing_id) {
      await recalculatePatientBilling(supabase, mergedSettlement.patient_billing_id);
    }

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
