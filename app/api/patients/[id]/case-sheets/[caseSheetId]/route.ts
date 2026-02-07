import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; caseSheetId: string }> }
) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { caseSheetId } = await params;
    const body = await request.json();

    const updateData = {
      discharge_date: body.discharge_date,
      discharge_notes: body.discharge_notes,
    };

    if (body.case_sheet_url) {
      Object.assign(updateData, {
        case_sheet_url: body.case_sheet_url,
        case_sheet_filename: body.case_sheet_filename,
        uploaded_at: new Date().toISOString(),
      });
    }

    const { data, error } = await supabase
      .from('patient_case_sheets')
      .update(updateData)
      .eq('id', caseSheetId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating case sheet:', error);
    return NextResponse.json(
      { error: 'Failed to update case sheet' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; caseSheetId: string }> }
) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can delete case sheets
    if (authResult.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only admins can delete case sheets' }, { status: 403 });
    }

    const supabase = await createClient();
    const { caseSheetId } = await params;

    const { error } = await supabase
      .from('patient_case_sheets')
      .delete()
      .eq('id', caseSheetId);

    if (error) throw error;

    return NextResponse.json({ message: 'Case sheet deleted successfully' });
  } catch (error) {
    console.error('Error deleting case sheet:', error);
    return NextResponse.json(
      { error: 'Failed to delete case sheet' },
      { status: 500 }
    );
  }
}
