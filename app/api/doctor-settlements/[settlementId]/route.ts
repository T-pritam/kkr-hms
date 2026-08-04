import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';
import { recalculatePatientBilling } from '@/lib/recalculate-billing';

// Complete improved PUT route with settled settlement handling
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

    console.log('=== SETTLEMENT UPDATE ===');
    console.log('Settlement ID:', settlementId);
    console.log('Request body:', body);

    // =====================================================
    // Fetch current settlement
    // =====================================================
    const { data: currentSettlement, error: fetchError } = await supabase
      .from('doctor_visit_settlements')
      .select('*')
      .eq('id', settlementId)
      .single();

    if (fetchError || !currentSettlement) {
      console.error('Settlement not found:', fetchError);
      return NextResponse.json(
        { error: 'Settlement not found', details: fetchError?.message },
        { status: 404 }
      );
    }

    console.log('Current settlement:', {
      id: currentSettlement.id,
      settled: currentSettlement.settled,
      amount_per_visit: currentSettlement.amount_per_visit,
      visit_count: currentSettlement.visit_count,
      total_amount: currentSettlement.total_amount,
    });

    // =====================================================
    // Determine if this is a pricing update
    // =====================================================
    const isPricingModeRequest = body.pricing_mode !== undefined;
    const hasPricingFieldUpdate = 
      body.amount_per_visit !== undefined || 
      body.visit_count !== undefined;
    
    const isPricingUpdate = isPricingModeRequest || hasPricingFieldUpdate || body.pricing_mode === 'total';

    console.log('Is pricing update:', isPricingUpdate);
    console.log('Settlement is settled:', currentSettlement.settled);

    // =====================================================
    // CRITICAL: If settlement is settled and we're updating pricing,
    // we need to unsettle it first
    // =====================================================
    let wasSettled = false;
    if (currentSettlement.settled === true && isPricingUpdate) {
      console.log('⚠️  Settlement is settled. Unsettling for pricing update...');
      
      wasSettled = true;
      const { error: unsetError } = await supabase
        .from('doctor_visit_settlements')
        .update({
          settled: false,
          settlement_date: null,
          settlement_amount: null,
          updated_by: authResult.user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settlementId);

      if (unsetError) {
        console.error('Error unsettling:', unsetError);
        throw unsetError;
      }

      console.log('✓ Settlement unsettled successfully');
    }

    // =====================================================
    // Prepare update data
    // =====================================================
    const updateData: any = {
      updated_by: authResult.user.id,
      updated_at: new Date().toISOString(),
    };

    // Handle pricing updates
    if (body.pricing_mode === 'per_visit') {
      console.log('Pricing mode: per_visit');
      
      if (body.amount_per_visit !== undefined) {
        const newAmount = parseFloat(body.amount_per_visit);
        console.log(`amount_per_visit: ${currentSettlement.amount_per_visit} → ${newAmount}`);
        updateData.amount_per_visit = newAmount;
      }
      
      if (body.visit_count !== undefined) {
        const newCount = parseInt(body.visit_count);
        console.log(`visit_count: ${currentSettlement.visit_count} → ${newCount}`);
        updateData.visit_count = newCount;
      }
    } else if (body.pricing_mode === 'total') {
      console.log('Pricing mode: total');
      
      const totalAmount = parseFloat(body.total_amount);
      const visitCount = parseInt(body.visit_count);
      
      if (isNaN(totalAmount) || isNaN(visitCount)) {
        return NextResponse.json(
          { error: 'Invalid total_amount or visit_count values' },
          { status: 400 }
        );
      }
      
      if (visitCount <= 0) {
        return NextResponse.json(
          { error: 'visit_count must be greater than 0' },
          { status: 400 }
        );
      }

      const calculatedAmount = totalAmount / visitCount;
      console.log(`Calculated amount_per_visit: ${totalAmount} / ${visitCount} = ${calculatedAmount}`);
      
      updateData.amount_per_visit = calculatedAmount;
      updateData.visit_count = visitCount;
    } else if (body.amount_per_visit !== undefined || body.visit_count !== undefined) {
      console.log('Pricing mode: legacy (individual fields)');

      if (body.amount_per_visit !== undefined) {
        const newAmount = parseFloat(body.amount_per_visit);
        console.log(`amount_per_visit: ${currentSettlement.amount_per_visit} → ${newAmount}`);
        updateData.amount_per_visit = newAmount;
      }

      if (body.visit_count !== undefined) {
        const newCount = parseInt(body.visit_count);
        console.log(`visit_count: ${currentSettlement.visit_count} → ${newCount}`);
        updateData.visit_count = newCount;
      }
    }

    // total_amount is a stored column, not derived — every branch above that
    // touches amount_per_visit or visit_count must keep it in sync, or it's
    // exactly the gap that left it null forever (BUGS.md #26).
    if (updateData.amount_per_visit !== undefined || updateData.visit_count !== undefined) {
      const amt = updateData.amount_per_visit ?? currentSettlement.amount_per_visit ?? 0;
      const count = updateData.visit_count ?? currentSettlement.visit_count ?? 0;
      updateData.total_amount = Math.floor(amt * count);
    }

    // =====================================================
    // Handle settlement status
    // =====================================================
    if (body.settled !== undefined) {
      console.log(`Updating settled: ${currentSettlement.settled} → ${body.settled}`);
      updateData.settled = body.settled;
      
      if (body.settled === true) {
        const settlementDate = body.settlement_date || new Date().toISOString();
        console.log('Settlement date:', settlementDate);
        updateData.settlement_date = settlementDate;
        
        // If not provided, use calculated total_amount as settlement_amount
        if (body.settlement_amount === undefined && updateData.amount_per_visit) {
          const newTotal = (updateData.visit_count || currentSettlement.visit_count) * updateData.amount_per_visit;
          console.log('Auto-calculated settlement_amount:', newTotal);
          updateData.settlement_amount = newTotal;
        }
      } else if (body.settled === false) {
        console.log('Clearing settlement details');
        updateData.settlement_date = null;
        updateData.settlement_amount = null;
        updateData.payment_method = null;
        updateData.transaction_reference = null;
      }
    }

    // =====================================================
    // Handle other settlement details
    // =====================================================
    if (body.settlement_amount !== undefined) {
      const newAmount = parseFloat(body.settlement_amount);
      console.log(`settlement_amount: ${currentSettlement.settlement_amount} → ${newAmount}`);
      updateData.settlement_amount = newAmount;
    }

    if (body.payment_method !== undefined && body.payment_method !== '') {
      console.log(`payment_method: ${currentSettlement.payment_method} → ${body.payment_method}`);
      updateData.payment_method = body.payment_method;
    }

    if (body.transaction_reference !== undefined && body.transaction_reference !== '') {
      console.log(`transaction_reference: ${currentSettlement.transaction_reference} → ${body.transaction_reference}`);
      updateData.transaction_reference = body.transaction_reference;
    }

    if (body.settlement_notes !== undefined && body.settlement_notes !== '') {
      console.log(`settlement_notes: ${currentSettlement.settlement_notes} → ${body.settlement_notes}`);
      updateData.settlement_notes = body.settlement_notes;
    }

    // Who physically handled the payout — optional, same convention as
    // advances' given_by.
    if (body.given_by !== undefined) {
      updateData.given_by = body.given_by?.trim() || null;
    }

    if (body.settlement_type !== undefined) {
      console.log(`settlement_type: ${currentSettlement.settlement_type} → ${body.settlement_type}`);
      updateData.settlement_type = body.settlement_type;
    }

    // =====================================================
    // Check if there's anything to update
    // =====================================================
    const meaningfulFields = Object.keys(updateData).filter(
      k => k !== 'updated_by' && k !== 'updated_at'
    );

    if (meaningfulFields.length === 0 && !wasSettled) {
      console.warn('No data to update');
      return NextResponse.json(
        { error: 'No data provided to update', data: currentSettlement },
        { status: 400 }
      );
    }

    console.log('Fields to update:', meaningfulFields);
    console.log('Update payload:', updateData);

    // =====================================================
    // Execute the update
    // =====================================================
    console.log('Executing update...');
    const { data, error } = await supabase
      .from('doctor_visit_settlements')
      .update(updateData)
      .eq('id', settlementId)
      .select(`
        *,
        doctor:doctors(id, name, specialist),
        patient:patients(id, name),
        created_by_user:users!created_by(id, username),
        updated_by_user:users!updated_by(id, username)
      `)
      .single();

    if (error) {
      console.error('Update error:', error);
      throw error;
    }

    if (!data) {
      console.error('No data returned after update');
      return NextResponse.json(
        { error: 'Settlement not found after update' },
        { status: 404 }
      );
    }

    console.log('✓ Update successful');
    console.log('Updated settlement:', {
      id: data.id,
      settled: data.settled,
      amount_per_visit: data.amount_per_visit,
      visit_count: data.visit_count,
      total_amount: data.total_amount,
    });

    // Recalculate billing totals
    if (data.patient_billing_id) {
      await recalculatePatientBilling(supabase, data.patient_billing_id);
    }

    // =====================================================
    // Prepare response
    // =====================================================
    let message = 'Settlement updated successfully';
    
    if (wasSettled && isPricingUpdate) {
      message = 'Settled settlement was unsettled and pricing updated. Call with settled: true to resettle.';
    }

    return NextResponse.json(
      {
        success: true,
        data,
        message,
        metadata: {
          wasSettled,
          pricingUpdated: isPricingUpdate,
          updatedFields: meaningfulFields,
          needsResettle: wasSettled && isPricingUpdate,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('=== ERROR ===');
    console.error('Error updating settlement:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to update settlement', 
        details: String(error),
        message: error instanceof Error ? error.message : 'Unknown error'
      },
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

    // Fetch billing_id before deleting
    const { data: settlement } = await supabase
      .from('doctor_visit_settlements')
      .select('patient_billing_id')
      .eq('id', settlementId)
      .single();

    const billingId = settlement?.patient_billing_id;

    // Check if soft delete or hard delete
    const useSoftDelete = body.soft_delete !== false; // Default to soft delete

    if (useSoftDelete) {
      // Soft delete: mark as deleted
      const { error } = await supabase
        .from('doctor_visit_settlements')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', settlementId);

      if (error) throw error;
    } else {
      // Hard delete
      const { error } = await supabase
        .from('doctor_visit_settlements')
        .delete()
        .eq('id', settlementId);

      if (error) throw error;
    }

    // Recalculate billing totals
    if (billingId) {
      await recalculatePatientBilling(supabase, billingId);
    }

    return NextResponse.json(
      {
        success: true,
        message: useSoftDelete ? 'Settlement soft deleted successfully' : 'Settlement deleted permanently',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting settlement:', error);
    return NextResponse.json(
      { error: 'Failed to delete settlement', details: String(error) },
      { status: 500 }
    );
  }
}
