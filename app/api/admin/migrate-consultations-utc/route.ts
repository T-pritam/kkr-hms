import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';

/**
 * ADMIN ONLY: Migration endpoint to convert all existing consultation dates to UTC format
 * This should be run once to ensure all consultation_date values are properly stored as UTC
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const supabase = await createClient();
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', authResult.user.id)
      .single();

    if (user?.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only admins can run migrations' },
        { status: 403 }
      );
    }

    // Fetch all consultations with non-null consultation_date
    const { data: consultations, error: fetchError } = await supabase
      .from('patient_consultations')
      .select('id, consultation_date')
      .not('consultation_date', 'is', null)
      .is('deleted_at', null);

    if (fetchError) throw fetchError;

    if (!consultations || consultations.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No consultations to migrate',
        updated: 0,
      });
    }

    // Update each consultation to ensure UTC format
    let updated = 0;
    const errors: any[] = [];

    for (const consultation of consultations) {
      try {
        // Parse the date and convert to UTC
        const date = new Date(consultation.consultation_date);
        const utcDate = date.toISOString();

        // Only update if the format changed
        if (consultation.consultation_date !== utcDate) {
          const { error: updateError } = await supabase
            .from('patient_consultations')
            .update({ consultation_date: utcDate })
            .eq('id', consultation.id);

          if (updateError) {
            errors.push({
              id: consultation.id,
              error: updateError.message,
            });
          } else {
            updated++;
          }
        }
      } catch (error) {
        errors.push({
          id: consultation.id,
          error: String(error),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Migration completed. ${updated} records updated.`,
      updated,
      total: consultations.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error migrating consultations to UTC:', error);
    return NextResponse.json(
      { error: 'Failed to migrate consultations', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check migration status
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const supabase = await createClient();
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', authResult.user.id)
      .single();

    if (user?.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only admins can check migration status' },
        { status: 403 }
      );
    }

    // Check current state of consultations
    const { data: consultations, error } = await supabase
      .from('patient_consultations')
      .select('id, consultation_date')
      .is('deleted_at', null);

    if (error) throw error;

    // Check how many are already in proper UTC format
    let utcCount = 0;
    let nonUtcCount = 0;

    consultations?.forEach((c: any) => {
      if (c.consultation_date) {
        const date = new Date(c.consultation_date);
        const iso = date.toISOString();
        if (c.consultation_date === iso) {
          utcCount++;
        } else {
          nonUtcCount++;
        }
      }
    });

    return NextResponse.json({
      total: consultations?.length || 0,
      utcFormat: utcCount,
      needsMigration: nonUtcCount,
      migrationNeeded: nonUtcCount > 0,
    });
  } catch (error) {
    console.error('Error checking migration status:', error);
    return NextResponse.json(
      { error: 'Failed to check migration status', details: String(error) },
      { status: 500 }
    );
  }
}
