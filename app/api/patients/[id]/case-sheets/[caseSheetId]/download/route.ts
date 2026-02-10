import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; caseSheetId: string }> }
) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: patientId, caseSheetId } = await params;

    // Get case sheet details
    const supabase = await createClient();
    const { data: caseSheet, error: fetchError } = await supabase
      .from('patient_case_sheets')
      .select('*')
      .eq('id', caseSheetId)
      .eq('patient_id', patientId)
      .single();

    if (fetchError || !caseSheet) {
      return NextResponse.json(
        { error: 'Case sheet not found' },
        { status: 404 }
      );
    }

    if (!caseSheet.case_sheet_url) {
      return NextResponse.json(
        { error: 'No file attached to this case sheet' },
        { status: 404 }
      );
    }

    // Extract the file path from the URL
    // URL format: https://pub-xxxxx.r2.dev/case-sheets/patient-id/filename.pdf
    const urlParts = caseSheet.case_sheet_url.split('/case-sheets/');
    if (urlParts.length < 2) {
      return NextResponse.json(
        { error: 'Invalid file URL' },
        { status: 400 }
      );
    }

    const filePath = `case-sheets/${urlParts[1]}`;

    // Create R2 client
    const s3Client = new S3Client({
      region: 'auto',
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    });

    // Generate presigned URL valid for 1 hour
    const command = new GetObjectCommand({
      Bucket: process.env.NEXT_PUBLIC_R2_BUCKET_NAME || '',
      Key: filePath,
    });

    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return NextResponse.json({
      success: true,
      downloadUrl,
      filename: caseSheet.case_sheet_filename,
    });
  } catch (error) {
    console.error('Error getting download URL:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get download URL';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
