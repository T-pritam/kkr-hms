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
        { error: 'Only admins can settle doctor visits' },
        { status: 403 }
      );
    }

    const supabase = await createClient();
    const body = await request.json();

    // Handle single settlement settle endpoint
    if (body.settlement_id) {
      return await settleSingleSettlement(supabase, body, authResult.user.id);
    }

    // Handle multiple settlements settle endpoint
    if (Array.isArray(body.settlement_ids) && body.settlement_ids.length > 0) {
      return await settleMultipleSettlements(supabase, body, authResult.user.id);
    }

    return NextResponse.json(
      { error: 'Either settlement_id or settlement_ids must be provided' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error settling doctor visits:', error);
    return NextResponse.json(
      { error: 'Failed to settle doctor visits', details: String(error) },
      { status: 500 }
    );
  }
}

async function settleSingleSettlement(
  supabase: any,
  body: any,
  userId: string
) {
  // Validate required fields
  if (!body.settlement_id || !body.settlement_amount) {
    return NextResponse.json(
      { error: 'settlement_id and settlement_amount are required' },
      { status: 400 }
    );
  }

  if (body.settlement_amount <= 0) {
    return NextResponse.json(
      { error: 'settlement_amount must be greater than 0' },
      { status: 400 }
    );
  }

  // Fetch the settlement
  const { data: settlement } = await supabase
    .from('doctor_visit_settlements')
    .select('*')
    .eq('id', body.settlement_id)
    .single();

  if (!settlement) {
    return NextResponse.json(
      { error: 'Settlement not found' },
      { status: 404 }
    );
  }

  // Calculate amount_per_visit
  const amountPerVisit =
    body.settlement_amount / settlement.visit_count;

  // Update settlement with settlement details
  const { data: updatedSettlement, error } = await supabase
    .from('doctor_visit_settlements')
    .update({
      settled: true,
      settlement_date: new Date().toISOString(),
      settlement_amount: body.settlement_amount,
      amount_per_visit: amountPerVisit,
      payment_method: body.payment_method || null,
      transaction_reference: body.transaction_reference || null,
      settlement_notes: body.settlement_notes || null,
      settlement_type: body.settlement_type || 'regular',
      updated_by: userId,
    })
    .eq('id', body.settlement_id)
    .select(`
      *,
      doctor:doctors(id, name, specialist),
      patient:patients(id, patient_id, name)
    `)
    .single();

  if (error) throw error;

  // Recalculate billing totals
  if (updatedSettlement?.patient_billing_id) {
    await recalculatePatientBilling(supabase, updatedSettlement.patient_billing_id);
  }

  return NextResponse.json(
    {
      success: true,
      data: updatedSettlement,
      message: 'Doctor visit fees settled successfully',
    },
    { status: 200 }
  );
}

async function settleMultipleSettlements(
  supabase: any,
  body: any,
  userId: string
) {
  // Validate required fields
  if (!Array.isArray(body.settlement_ids) || body.settlement_ids.length === 0) {
    return NextResponse.json(
      { error: 'settlement_ids must be a non-empty array' },
      { status: 400 }
    );
  }

  if (!body.settlement_amount_each) {
    return NextResponse.json(
      { error: 'settlement_amount_each is required' },
      { status: 400 }
    );
  }

  if (body.settlement_amount_each <= 0) {
    return NextResponse.json(
      { error: 'settlement_amount_each must be greater than 0' },
      { status: 400 }
    );
  }

  // Fetch all settlements
  const { data: settlements } = await supabase
    .from('doctor_visit_settlements')
    .select('*')
    .in('id', body.settlement_ids);

  if (!settlements || settlements.length === 0) {
    return NextResponse.json(
      { error: 'Settlements not found' },
      { status: 404 }
    );
  }

  const updatePromises = settlements.map((settlement: any) => {
    const amountPerVisit = body.settlement_amount_each / settlement.visit_count;

    return supabase
      .from('doctor_visit_settlements')
      .update({
        settled: true,
        settlement_date: new Date().toISOString(),
        settlement_amount: body.settlement_amount_each,
        amount_per_visit: amountPerVisit,
        payment_method: body.payment_method || null,
        transaction_reference: body.transaction_reference || null,
        settlement_notes: body.settlement_notes || null,
        settlement_type: body.settlement_type || 'regular',
        updated_by: userId,
      })
      .eq('id', settlement.id)
      .select(`
        *,
        doctor:doctors(id, name, specialist),
        patient:patients(id, patient_id, name)
      `);
  });

  const results = await Promise.all(updatePromises);

  const settledSettlements = results
    .filter((r) => !r.error)
    .flatMap((r) => r.data);

  // Recalculate billing totals for all affected billings
  const billingIds = new Set(
    settledSettlements
      .map((s: any) => s.patient_billing_id)
      .filter(Boolean)
  );
  for (const billingId of billingIds) {
    await recalculatePatientBilling(supabase, billingId as string);
  }

  return NextResponse.json(
    {
      success: true,
      settled_count: settledSettlements.length,
      data: settledSettlements,
      message: `Successfully settled ${settledSettlements.length} doctor visit(s)`,
    },
    { status: 200 }
  );
}
