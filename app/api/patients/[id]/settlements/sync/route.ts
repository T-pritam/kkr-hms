import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';
import { recalculatePatientBilling } from '@/lib/recalculate-billing';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (authResult.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only admins can sync doctor visits' },
        { status: 403 }
      );
    }

    const supabase = await createClient();
    const { id: patientId } = await params;
    const body = await request.json();
    const billingId = body.billing_id;

    if (!billingId) {
      return NextResponse.json(
        { error: 'billing_id is required' },
        { status: 400 }
      );
    }

    // Fetch all consultations for this patient
    const { data: consultations } = await supabase
      .from('patient_consultations')
      .select('*')
      .eq('patient_id', patientId)
      .eq('billing_id', billingId)
      .is('deleted_at', null)
      .order('consultation_date', { ascending: true });

    if (!consultations || consultations.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message: 'No consultations to sync',
          settlements: [],
        },
        { status: 200 }
      );
    }

    // Group consultations by doctor
    const consultationsByDoctor = consultations.reduce(
      (acc: Record<string, any[]>, consultation: any) => {
        if (!consultation.doctor_id) return acc;
        const doctorId = consultation.doctor_id;
        if (!acc[doctorId]) acc[doctorId] = [];
        acc[doctorId].push(consultation);
        return acc;
      },
      {}
    );

    console.log(`Found ${consultations.length} consultations for patient ${patientId} grouped by doctor:`, consultationsByDoctor);

    const createdSettlements = [];
    const updatedSettlements = [];

    // For each doctor, create or update settlement
    for (const doctorId in consultationsByDoctor) {
      const doctorConsultations = consultationsByDoctor[doctorId];
      const visitCount = doctorConsultations.length;

      // Check if settlement exists for this patient and doctor
      const { data: existingSettlements } = await supabase
        .from('doctor_visit_settlements')
        .select('*')
        .eq('patient_id', patientId)
        .eq('doctor_id', doctorId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
        console.log(`Existing settlements for patient ${patientId} and doctor ${doctorId}:`, existingSettlements);

      if (existingSettlements && existingSettlements.length > 0) {
        // Keep total_amount in step with the new visit_count — otherwise a
        // re-sync leaves it stale against the already-priced amount_per_visit.
        const existingAmountPerVisit = Number(existingSettlements[0].amount_per_visit) || 0;

        const { error: updateError } = await supabase
          .from('doctor_visit_settlements')
          .update({
            visit_count: visitCount,
            total_amount: Math.floor(existingAmountPerVisit * visitCount),
            updated_by: authResult.user.id,
          })
          .eq('id', existingSettlements[0].id);

        if (updateError) throw updateError;

        updatedSettlements.push({
          id: existingSettlements[0].id,
          doctor_id: doctorId,
          visit_count: visitCount,
          status: 'updated',
        });
      } else {
        // No settlement exists for this patient-doctor pair, create new one
        const { data: newSettlement, error: createError } = await supabase
          .from('doctor_visit_settlements')
          .insert({
            patient_id: patientId,
            doctor_id: doctorId,
            patient_billing_id: billingId,
            visit_count: visitCount,
            amount_per_visit: 0,
            total_amount: 0,
            settlement_type: 'regular',
            created_by: authResult.user.id,
          })
          .select()
          .single();

        if (createError) throw createError;

        createdSettlements.push({
          id: newSettlement.id,
          doctor_id: doctorId,
          visit_count: visitCount,
          status: 'created',
        });
      }
    }

    // Recalculate billing totals after sync
    await recalculatePatientBilling(supabase, billingId);

    return NextResponse.json(
      {
        success: true,
        created: createdSettlements,
        updated: updatedSettlements,
        total_doctors: Object.keys(consultationsByDoctor).length,
        message: `Doctor visits synced successfully. Created: ${createdSettlements.length}, Updated: ${updatedSettlements.length}`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error syncing doctor visits:', error);
    return NextResponse.json(
      { error: 'Failed to sync doctor visits', details: String(error) },
      { status: 500 }
    );
  }
}
