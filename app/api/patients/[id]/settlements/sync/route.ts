import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';

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

    // Get or create patient billing
    let { data: billing } = await supabase
      .from('patient_billing')
      .select('id')
      .eq('patient_id', patientId)
      .single();

    if (!billing) {
      const { data: newBilling } = await supabase
        .from('patient_billing')
        .insert({
          patient_id: patientId,
          base_charge: 0,
          referral_commission_amount: 0,
          created_by: authResult.user.id,
        })
        .select()
        .single();
      billing = newBilling;
    }

    // Fetch all consultations for this patient
    const { data: consultations } = await supabase
      .from('patient_consultations')
      .select('*')
      .eq('patient_id', patientId)
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

    const createdSettlements = [];
    const updatedSettlements = [];

    // For each doctor, create or update settlement
    for (const doctorId in consultationsByDoctor) {
      const doctorConsultations = consultationsByDoctor[doctorId];
      const visitCount = doctorConsultations.length;

      // Check if a settled settlement exists for this doctor
      const { data: existingSettlements } = await supabase
        .from('doctor_visit_settlements')
        .select('*')
        .eq('patient_billing_id', billing.id)
        .eq('doctor_id', doctorId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      let settledCount = 0;
      let unsettledSettlement = null;

      if (existingSettlements && existingSettlements.length > 0) {
        // Find the unsettled one (latest unsettled or first if all settled)
        unsettledSettlement = existingSettlements.find((s) => !s.settled);
        if (!unsettledSettlement && existingSettlements.length > 0) {
          // If all are settled, create a new one for additional visits
          unsettledSettlement = null;
        }
        settledCount = existingSettlements.filter((s) => s.settled).length;
      }

      if (unsettledSettlement) {
        // Update the existing unsettled settlement
        const { error: updateError } = await supabase
          .from('doctor_visit_settlements')
          .update({
            visit_count: visitCount,
            updated_by: authResult.user.id,
          })
          .eq('id', unsettledSettlement.id);

        if (updateError) throw updateError;

        updatedSettlements.push({
          id: unsettledSettlement.id,
          doctor_id: doctorId,
          visit_count: visitCount,
          status: 'updated',
        });
      } else {
        // Create a new settlement for this doctor
        const { data: newSettlement, error: createError } = await supabase
          .from('doctor_visit_settlements')
          .insert({
            patient_billing_id: billing.id,
            patient_id: patientId,
            doctor_id: doctorId,
            visit_count: visitCount,
            amount_per_visit: 0, // Will be set during settlement
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

    return NextResponse.json(
      {
        success: true,
        billing_id: billing.id,
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
