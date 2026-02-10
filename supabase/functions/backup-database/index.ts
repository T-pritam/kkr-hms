import { Client } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "npm:@aws-sdk/client-s3@3.645.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.645.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DAYS_TO_KEEP = 30;
const BACKUPS_DIR = 'database-backups';

/**
 * Optimized database dump
 */
async function dumpDatabaseData(): Promise<Uint8Array> {
  const dbUrl = Deno.env.get('DATABASE_URL');
  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable not set');
  }

  console.log('Starting optimized database backup...');

  const client = new Client(dbUrl);
  await client.connect();

  try {
    let sqlDump = '-- KKR-HMS Database Backup\n';
    sqlDump += `-- Generated: ${new Date().toISOString()}\n\n`;

    // Get all tables
    const tables = await client.queryArray(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = 'public' 
       AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );

    console.log(`Found ${tables.rows.length} tables`);

    for (const [tableName] of tables.rows as [string][]) {
      console.log(`Backing up: ${tableName}`);

      // Get row count
      const countResult = await client.queryObject(
        `SELECT COUNT(*) as count FROM "${tableName}"`
      );
      const rowCount = Number(countResult.rows[0].count);

      if (rowCount === 0) {
        console.log(`  └─ Skipping empty table`);
        continue;
      }

      console.log(`  └─ ${rowCount} rows`);

      // Get all data efficiently
      const data = await client.queryObject(`SELECT * FROM "${tableName}"`);
      
      if (data.rows.length > 0) {
        const columnNames = Object.keys(data.rows[0]);
        const quotedColumns = columnNames.map(col => `"${col}"`).join(', ');
        
        sqlDump += `\n-- Data for ${tableName} (${rowCount} rows)\n`;
        
        // Build multi-row INSERT
        const batchSize = 100;
        for (let i = 0; i < data.rows.length; i += batchSize) {
          const batch = data.rows.slice(i, i + batchSize);
          
          const valueRows = batch.map(row => {
            const values = columnNames.map(col => {
              const val = row[col];
              if (val === null) return 'NULL';
              if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
              if (typeof val === 'boolean') return val ? 'true' : 'false';
              if (val instanceof Date) return `'${val.toISOString()}'`;
              if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
              return String(val);
            }).join(', ');
            return `(${values})`;
          }).join(',\n  ');
          
          sqlDump += `INSERT INTO "${tableName}" (${quotedColumns}) VALUES\n  ${valueRows};\n`;
        }
      }
    }

    console.log('Database dump completed successfully');
    return new TextEncoder().encode(sqlDump);
  } finally {
    await client.end();
  }
}

/**
 * Compress data using gzip
 */
async function compressData(data: Uint8Array): Promise<Uint8Array> {
  console.log(`Compressing ${(data.length / 1024 / 1024).toFixed(2)} MB of data...`);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });

  const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
  const reader = compressedStream.getReader();
  const chunks: Uint8Array[] = [];

  let result = await reader.read();
  while (!result.done) {
    chunks.push(result.value);
    result = await reader.read();
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const compressed = new Uint8Array(totalLength);
  
  let offset = 0;
  for (const chunk of chunks) {
    compressed.set(chunk, offset);
    offset += chunk.length;
  }

  console.log(`Compressed to ${(compressed.length / 1024 / 1024).toFixed(2)} MB`);
  return compressed;
}

/**
 * Create S3 client for R2
 */
function createS3Client() {
  const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID');
  const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID');
  const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY');

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 credentials not configured');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Upload to R2 using presigned URL (same approach as PDF upload)
 */
async function uploadToR2(filename: string, fileBuffer: Uint8Array): Promise<string> {
  const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID');
  const bucketName = Deno.env.get('R2_BUCKET_NAME');

  if (!R2_ACCOUNT_ID || !bucketName) {
    throw new Error('R2_ACCOUNT_ID or R2_BUCKET_NAME not configured');
  }

  const key = `${BACKUPS_DIR}/${filename}`;

  console.log(`Preparing upload to R2: ${key}`);
  console.log(`File size: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  try {
    const s3Client = createS3Client();

    // Step 1: Generate presigned URL (just like PDF upload)
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: 'application/gzip',
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 60 * 60, // 1 hour
    });

    console.log('Generated presigned URL, uploading...');

    // Step 2: Upload using the presigned URL with fetch
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/gzip',
      },
      body: fileBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(
        `Upload failed: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`
      );
    }

    console.log('✓ Backup uploaded successfully');
    
    const publicUrl = `https://pub-${R2_ACCOUNT_ID}.r2.dev/${key}`;
    return publicUrl;
  } catch (error) {
    throw new Error(
      `Failed to upload to R2: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * List backups from R2
 */
async function listBackupsFromR2(): Promise<{ key: string; lastModified: Date }[]> {
  console.log(`Listing backups from R2...`);

  try {
    const bucketName = Deno.env.get('R2_BUCKET_NAME');
    if (!bucketName) throw new Error('R2_BUCKET_NAME not configured');

    const s3Client = createS3Client();
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: `${BACKUPS_DIR}/`,
    });

    const response = await s3Client.send(command);

    if (!response.Contents || response.Contents.length === 0) {
      console.log('No backups found');
      return [];
    }

    const files = response.Contents
      .filter(obj => obj.Key && obj.Key.endsWith('.sql.gz'))
      .map(obj => ({
        key: obj.Key!,
        lastModified: obj.LastModified || new Date(),
      }));

    console.log(`Found ${files.length} backup file(s)`);
    return files;
  } catch (error) {
    console.warn(`Error listing backups: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Delete backup from R2
 */
async function deleteBackupFromR2(key: string): Promise<void> {
  const bucketName = Deno.env.get('R2_BUCKET_NAME');
  if (!bucketName) throw new Error('R2_BUCKET_NAME not configured');

  console.log(`Deleting old backup: ${key}`);

  try {
    const s3Client = createS3Client();
    const command = new DeleteObjectCommand({ Bucket: bucketName, Key: key });
    await s3Client.send(command);
    console.log(`✓ Deleted: ${key}`);
  } catch (error) {
    console.warn(`Error deleting backup: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Clean up old backups
 */
async function cleanupOldBackups(): Promise<number> {
  console.log(`\nCleaning up backups older than ${DAYS_TO_KEEP} days...`);

  try {
    const files = await listBackupsFromR2();
    if (files.length === 0) {
      console.log('No backups to clean up');
      return 0;
    }

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - DAYS_TO_KEEP * 24 * 60 * 60 * 1000);
    console.log(`Cutoff date: ${cutoffDate.toISOString().split('T')[0]}`);

    let deletedCount = 0;
    for (const file of files) {
      if (file.lastModified < cutoffDate) {
        await deleteBackupFromR2(file.key);
        deletedCount++;
      }
    }

    console.log(`✓ Cleanup complete. Deleted ${deletedCount} old backup(s)`);
    return deletedCount;
  } catch (error) {
    console.error(`Cleanup error: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
}

/**
 * Main backup function
 */
async function performBackup(): Promise<{
  success: boolean;
  filename: string;
  size: string;
  uploadUrl: string;
  cleanedUp: number;
}> {
  console.log('='.repeat(60));
  console.log('Starting KKR-HMS Database Backup');
  console.log('='.repeat(60));

  const dumpData = await dumpDatabaseData();
  const compressedData = await compressData(dumpData);

  const timestamp = new Date().toISOString();
  const dateStr = timestamp.split('T')[0];
  const timeStr = timestamp.split('T')[1].substring(0, 5).replace(':', '');
  const filename = `backup-${dateStr}-${timeStr}-${Date.now()}.sql.gz`;

  console.log(`\nUploading backup file...`);
  const uploadUrl = await uploadToR2(filename, compressedData);

  console.log('');
  const cleanedUp = await cleanupOldBackups();

  console.log('\n' + '='.repeat(60));
  console.log('✓ Backup completed successfully!');
  console.log('='.repeat(60));

  return {
    success: true,
    filename,
    size: `${(compressedData.length / 1024 / 1024).toFixed(2)} MB`,
    uploadUrl,
    cleanedUp,
  };
}

/**
 * HTTP Handler
 */
async function handleHttpRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await performBackup();

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Backup failed:', errorMsg);

    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

Deno.serve(handleHttpRequest);