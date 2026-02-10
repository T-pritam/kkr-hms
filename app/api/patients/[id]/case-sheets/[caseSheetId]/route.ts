import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verify';
import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

async function deleteFileFromR2(filePath: string): Promise<void> {
  const s3Client = new S3Client({
    region: 'auto',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  });

  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.NEXT_PUBLIC_R2_BUCKET_NAME || '',
      Key: filePath,
    });

    await s3Client.send(command);
    console.log(`Successfully deleted file from R2: ${filePath}`);
  } catch (error) {
    console.error(`Error deleting file from R2: ${filePath}`, error);
    // Don't throw - continue with update even if deletion fails
  }
}

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
    const { id: patientId, caseSheetId } = await params;
    
    // Get existing case sheet to check for old file
    const { data: existingCaseSheet, error: fetchError } = await supabase
      .from('patient_case_sheets')
      .select('*')
      .eq('id', caseSheetId)
      .eq('patient_id', patientId)
      .single();

    if (fetchError || !existingCaseSheet) {
      return NextResponse.json(
        { error: 'Case sheet not found' },
        { status: 404 }
      );
    }

    const contentType = request.headers.get('content-type');
    let updateData: any = {};

    // Check if this is a FormData request (file upload)
    if (contentType?.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File;
      const discharge_date = formData.get('discharge_date');
      const discharge_notes = formData.get('discharge_notes');

      if (file) {
        // Validate file
        if (file.type !== 'application/pdf') {
          return NextResponse.json(
            { error: 'Only PDF files are allowed' },
            { status: 400 }
          );
        }

        if (file.size > 10 * 1024 * 1024) {
          return NextResponse.json(
            { error: 'File size must be less than 10MB' },
            { status: 400 }
          );
        }

        // Generate file path
        const timestamp = Date.now();
        const filename = `${timestamp}_${file.name}`;
        const filePath = `case-sheets/${patientId}/${filename}`;

        // Upload new file to R2
        const s3Client = new S3Client({
          region: 'auto',
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
          },
          endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        });

        const arrayBuffer = await file.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);
        
        const uploadCommand = new PutObjectCommand({
          Bucket: process.env.NEXT_PUBLIC_R2_BUCKET_NAME || '',
          Key: filePath,
          Body: buffer,
          ContentType: file.type,
        });

        try {
          await s3Client.send(uploadCommand);

          const publicUrl = `https://pub-${process.env.R2_ACCOUNT_ID}.r2.dev/${filePath}`;

          updateData = {
            case_sheet_url: publicUrl,
            case_sheet_filename: filename,
            uploaded_at: new Date().toISOString(),
            discharge_date: discharge_date || existingCaseSheet.discharge_date,
            discharge_notes: discharge_notes || existingCaseSheet.discharge_notes,
          };

          // Delete old file from R2 if it exists
          if (existingCaseSheet.case_sheet_url) {
            const oldUrlParts = existingCaseSheet.case_sheet_url.split('/case-sheets/');
            if (oldUrlParts.length > 1) {
              const oldFilePath = `case-sheets/${oldUrlParts[1]}`;
              await deleteFileFromR2(oldFilePath);
            }
          }
        } catch (uploadError) {
          console.error('Error uploading file to R2:', uploadError);
          return NextResponse.json(
            { error: 'Failed to upload file to R2' },
            { status: 500 }
          );
        }
      } else {
        // No file uploaded, just update metadata
        updateData = {
          discharge_date: discharge_date || existingCaseSheet.discharge_date,
          discharge_notes: discharge_notes || existingCaseSheet.discharge_notes,
        };
      }
    } else {
      // JSON request - just update metadata
      const body = await request.json();

      updateData = {
        discharge_date: body.discharge_date || existingCaseSheet.discharge_date,
        discharge_notes: body.discharge_notes || existingCaseSheet.discharge_notes,
      };

      if (body.case_sheet_url) {
        Object.assign(updateData, {
          case_sheet_url: body.case_sheet_url,
          case_sheet_filename: body.case_sheet_filename,
          uploaded_at: new Date().toISOString(),
        });

        // Delete old file from R2 if it exists
        if (existingCaseSheet.case_sheet_url) {
          const oldUrlParts = existingCaseSheet.case_sheet_url.split('/case-sheets/');
          if (oldUrlParts.length > 1) {
            const oldFilePath = `case-sheets/${oldUrlParts[1]}`;
            await deleteFileFromR2(oldFilePath);
          }
        }
      }
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
    const errorMessage = error instanceof Error ? error.message : 'Failed to update case sheet';
    return NextResponse.json(
      { error: errorMessage },
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
    const { id: patientId, caseSheetId } = await params;

    // Get case sheet to retrieve file path
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

    // Delete file from R2 if it exists
    if (caseSheet.case_sheet_url) {
      const urlParts = caseSheet.case_sheet_url.split('/case-sheets/');
      if (urlParts.length > 1) {
        const filePath = `case-sheets/${urlParts[1]}`;
        await deleteFileFromR2(filePath);
      }
    }

    // Delete from database
    const { error } = await supabase
      .from('patient_case_sheets')
      .delete()
      .eq('id', caseSheetId);

    if (error) throw error;

    return NextResponse.json({ message: 'Case sheet deleted successfully' });
  } catch (error) {
    console.error('Error deleting case sheet:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete case sheet';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
