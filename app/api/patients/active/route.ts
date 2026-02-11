import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.cookies.get('accessToken')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const supabase = await createClient();

    // Get only active patients (not discharged) with minimal fields
    const { data: patients, error } = await supabase
      .from('patients')
      .select('id, patient_id, name')
      .neq('status', 'discharge')
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json(patients || []);
  } catch (error) {
    console.error('Error fetching active patients:', error);
    return NextResponse.json(
      { error: 'Failed to fetch patients' },
      { status: 500 }
    );
  }
}
