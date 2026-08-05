import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';
import { recalculatePatientBilling } from '@/lib/recalculate-billing';

/**
 * A single settlement — reprice it, settle or unsettle it, or remove it.
 *
 * `visit_count` used to be a number an admin could type into either a
 * "per visit" or a "total" pricing form, independent of how many visits actually
 * existed. That's how a settlement's count could drift from reality in the first
 * place. Now that `patient_consultations.settlement_id` records which visits a
 * settlement actually covers (20260809000002), the count is a fact derived from
 * those links, not an input — for a row with a `visit_purpose_id` (i.e., one the
 * sync endpoint created and tracks), only the rate is editable here, and
 * `total_amount` is always `amount_per_visit × the row's own stored visit_count`.
 *
 * A settlement with no `visit_purpose_id` — from `create-manual` or `merge` — was
 * never part of that tracking (it may deliberately span several purposes, or have
 * no linked visits at all), so it keeps the old freely-typed visit count.
 */
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

    const { data: currentSettlement, error: fetchError } = await supabase
      .from('doctor_visit_settlements')
      .select('*')
      .eq('id', settlementId)
      .single();

    if (fetchError || !currentSettlement) {
      return NextResponse.json({ error: 'Settlement not found' }, { status: 404 });
    }

    // Auto-tracked rows (sync created them) have a purpose and a count that must
    // stay honest against the visits linked to them. Manual/merged rows have
    // neither guarantee to begin with, so they keep the old free-form editing.
    const isAutoTracked = currentSettlement.visit_purpose_id !== null;

    if (isAutoTracked && body.visit_count !== undefined) {
      return NextResponse.json(
        {
          error:
            'This settlement\'s visit count comes from the visits billed under it and cannot be edited directly. Fix it by correcting the visit records and syncing again.',
        },
        { status: 400 }
      );
    }

    const wantsAmountChange = body.amount_per_visit !== undefined || body.total_amount !== undefined;
    const wantsVisitCountChange = !isAutoTracked && body.visit_count !== undefined;
    const isPricingUpdate = wantsAmountChange || wantsVisitCountChange;

    // A settled row's pricing is locked. Changing it — or plainly unsettling it —
    // both flip `settled` back to false, which conflicts with a newer pending row
    // for the same (cycle, doctor, purpose) if one has since been created by sync.
    // The partial unique index is what actually enforces "at most one live
    // unsettled row per key"; catch the 23505 it raises and explain rather than
    // 500.
    const wantsToUnsettle = body.settled === false || (currentSettlement.settled === true && isPricingUpdate);
    let wasSettled = false;

    if (currentSettlement.settled === true && wantsToUnsettle) {
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

      if (unsetError?.code === '23505') {
        return NextResponse.json(
          {
            error:
              'There is already a newer pending settlement for this doctor and purpose. Settle or merge that one first before reopening this one.',
          },
          { status: 409 }
        );
      }
      if (unsetError) throw unsetError;
    }

    const updateData: any = {
      updated_by: authResult.user.id,
      updated_at: new Date().toISOString(),
    };

    // The count this write's total is priced against — the row's own stored
    // count, unless this is a manual row and the caller is changing it.
    let effectiveVisitCount = currentSettlement.visit_count ?? 0;

    if (wantsVisitCountChange) {
      const newCount = parseInt(body.visit_count);
      if (!Number.isInteger(newCount) || newCount < 0) {
        return NextResponse.json({ error: 'visit_count must be a whole number, zero or more' }, { status: 400 });
      }
      updateData.visit_count = newCount;
      effectiveVisitCount = newCount;
    }

    if (wantsAmountChange) {
      let amount: number;

      if (body.amount_per_visit !== undefined) {
        amount = parseFloat(body.amount_per_visit);
      } else {
        // Converting a total needs a count to divide by. A row can legitimately
        // have zero visits (nothing left to bill after sync zeroed it out) — a
        // total makes no sense to price against that, so ask for a per-visit
        // rate instead.
        if (effectiveVisitCount <= 0) {
          return NextResponse.json(
            { error: 'This settlement has no visits to price a total against. Set a per-visit rate instead.' },
            { status: 400 }
          );
        }
        amount = parseFloat(body.total_amount) / effectiveVisitCount;
      }

      if (!Number.isFinite(amount) || amount < 0) {
        return NextResponse.json({ error: 'The amount must be a number, zero or more' }, { status: 400 });
      }

      updateData.amount_per_visit = amount;
    }

    // total_amount is a stored column, not derived by the database — every branch
    // above that touches the rate or the count must keep it in sync, or it's
    // exactly the gap that used to leave it null forever (BUGS.md #26).
    if (wantsAmountChange || wantsVisitCountChange) {
      const amt = updateData.amount_per_visit ?? currentSettlement.amount_per_visit ?? 0;
      updateData.total_amount = Math.floor(amt * effectiveVisitCount);
    }

    if (body.settled !== undefined) {
      updateData.settled = body.settled;

      if (body.settled === true) {
        updateData.settlement_date = body.settlement_date || new Date().toISOString();

        if (body.settlement_amount === undefined && updateData.amount_per_visit !== undefined) {
          updateData.settlement_amount = Math.floor(updateData.amount_per_visit * effectiveVisitCount);
        }
      } else if (body.settled === false) {
        updateData.settlement_date = null;
        updateData.settlement_amount = null;
        updateData.payment_method = null;
        updateData.transaction_reference = null;
      }
    }

    if (body.settlement_amount !== undefined) {
      updateData.settlement_amount = parseFloat(body.settlement_amount);
    }

    if (body.payment_method !== undefined && body.payment_method !== '') {
      updateData.payment_method = body.payment_method;
    }

    if (body.transaction_reference !== undefined && body.transaction_reference !== '') {
      updateData.transaction_reference = body.transaction_reference;
    }

    if (body.settlement_notes !== undefined && body.settlement_notes !== '') {
      updateData.settlement_notes = body.settlement_notes;
    }

    // Who physically handled the payout — optional, same convention as
    // advances' given_by.
    if (body.given_by !== undefined) {
      updateData.given_by = body.given_by?.trim() || null;
    }

    if (body.settlement_type !== undefined) {
      updateData.settlement_type = body.settlement_type;
    }

    const meaningfulFields = Object.keys(updateData).filter(
      k => k !== 'updated_by' && k !== 'updated_at'
    );

    if (meaningfulFields.length === 0 && !wasSettled) {
      return NextResponse.json(
        { error: 'No data provided to update', data: currentSettlement },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('doctor_visit_settlements')
      .update(updateData)
      .eq('id', settlementId)
      .select(`
        *,
        doctor:doctors(id, name, specialist),
        visit_purpose:visit_purposes(id, code, name),
        patient:patients(id, name),
        created_by_user:users!created_by(id, username),
        updated_by_user:users!updated_by(id, username)
      `)
      .single();

    if (error?.code === '23505') {
      return NextResponse.json(
        {
          error:
            'There is already a newer pending settlement for this doctor and purpose. Settle or merge that one first before reopening this one.',
        },
        { status: 409 }
      );
    }
    if (error) throw error;

    if (!data) {
      return NextResponse.json({ error: 'Settlement not found after update' }, { status: 404 });
    }

    if (data.patient_billing_id) {
      await recalculatePatientBilling(supabase, data.patient_billing_id);
    }

    const message = wasSettled && isPricingUpdate
      ? 'Settled settlement was unsettled and pricing updated. Call with settled: true to resettle.'
      : 'Settlement updated successfully';

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

    const { data: settlement } = await supabase
      .from('doctor_visit_settlements')
      .select('patient_billing_id')
      .eq('id', settlementId)
      .single();

    const billingId = settlement?.patient_billing_id;

    // Release the visits this settlement billed back into the unbilled pool —
    // otherwise they'd be permanently stuck pointing at a row that no longer
    // exists as an active settlement, invisible to every future sync.
    const { error: releaseError } = await supabase
      .from('patient_consultations')
      .update({ settlement_id: null })
      .eq('settlement_id', settlementId);

    if (releaseError) throw releaseError;

    const useSoftDelete = body.soft_delete !== false; // Default to soft delete

    if (useSoftDelete) {
      const { error } = await supabase
        .from('doctor_visit_settlements')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', settlementId);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('doctor_visit_settlements')
        .delete()
        .eq('id', settlementId);

      if (error) throw error;
    }

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
