import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';
import { recalculatePatientBilling } from '@/lib/recalculate-billing';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chargeId: string }> }
) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { chargeId } = await params;
    const body = await request.json();

    // Check if user is admin or created this charge
    const { data: charge } = await supabase
      .from('patient_charges')
      .select('created_by, patient_billing_id')
      .eq('id', chargeId)
      .single();

    if (!charge) {
      return NextResponse.json({ error: 'Charge not found' }, { status: 404 });
    }

    if (authResult.user.role !== 'ADMIN' && charge.created_by !== authResult.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('patient_charges')
      .update({
        charge_type: body.charge_type,
        description: body.description,
        amount: body.amount,
        charge_date: body.charge_date,
        updated_by: authResult.user.id,
      })
      .eq('id', chargeId)
      .select()
      .single();

    if (error) throw error;

    // Recalculate billing totals
    if (charge.patient_billing_id) {
      await recalculatePatientBilling(supabase, charge.patient_billing_id);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating charge:', error);
    return NextResponse.json(
      { error: 'Failed to update charge' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chargeId: string }> }
) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { chargeId } = await params;

    // Check if user is admin or created this charge
    const { data: charge } = await supabase
      .from('patient_charges')
      .select('created_by, patient_billing_id')
      .eq('id', chargeId)
      .single();

    if (!charge) {
      return NextResponse.json({ error: 'Charge not found' }, { status: 404 });
    }

    if (authResult.user.role !== 'ADMIN' && charge.created_by !== authResult.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('patient_charges')
      .delete()
      .eq('id', chargeId);

    if (error) throw error;

    // Recalculate billing totals
    if (charge.patient_billing_id) {
      await recalculatePatientBilling(supabase, charge.patient_billing_id);
    }

    return NextResponse.json({ message: 'Charge deleted successfully' });
  } catch (error) {
    console.error('Error deleting charge:', error);
    return NextResponse.json(
      { error: 'Failed to delete charge' },
      { status: 500 }
    );
  }
}
