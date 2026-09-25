import { Client } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "npm:@aws-sdk/client-s3@3.645.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.645.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DAYS_TO_KEEP = 3;
const BACKUPS_DIR = 'database-backups';

/**
 * The platform's own connection string first: Supabase injects SUPABASE_DB_URL
 * into every function and keeps it current. The hand-set DATABASE_URL held a
 * stale password, so every scheduled backup failed with "password
 * authentication failed" (found 2026-09-25); it stays only as a fallback.
 */
function databaseUrl(): string {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL') || Deno.env.get('DATABASE_URL');
  if (!dbUrl) throw new Error('Neither SUPABASE_DB_URL nor DATABASE_URL is set');
  return dbUrl;
}

/**
 * Optimized database dump
 */
async function dumpDatabaseData(): Promise<Uint8Array> {
  const client = new Client(databaseUrl());
  await client.connect();

  try {
    let sqlDump = '-- KKR-HMS Database Backup\n';
    sqlDump += `-- Generated: ${new Date().toISOString()}\n\n`;

    // ========== EXTENSIONS ==========
    const extResult = await client.queryArray(
      `SELECT extname FROM pg_extension
       WHERE extname NOT IN ('plpgsql')
       ORDER BY extname`
    );
    for (const [extName] of extResult.rows as [string][]) {
      sqlDump += `CREATE EXTENSION IF NOT EXISTS "${extName}";\n`;
    }
    sqlDump += '\n';

    // ========== SEQUENCES ==========
    const seqResult = await client.queryArray(
      `SELECT
        s.relname AS seq_name,
        p.start_value,
        p.increment_by,
        p.min_value,
        p.max_value,
        p.cache_size
       FROM pg_class s
       JOIN pg_namespace n ON n.oid = s.relnamespace
       JOIN pg_sequences p ON p.sequencename = s.relname AND p.schemaname = n.nspname
       WHERE s.relkind = 'S'
         AND n.nspname = 'public'
       ORDER BY s.relname`
    );
    for (const [seqName, startVal, incBy, minVal, maxVal, cache] of seqResult.rows as [string, string, string, string, string, string][]) {
      sqlDump += `CREATE SEQUENCE IF NOT EXISTS "${seqName}"`;
      sqlDump += ` START WITH ${startVal}`;
      sqlDump += ` INCREMENT BY ${incBy}`;
      sqlDump += ` MINVALUE ${minVal}`;
      if (maxVal === '9223372036854775807') {
        sqlDump += ` NO MAXVALUE`;
      } else {
        sqlDump += ` MAXVALUE ${maxVal}`;
      }
      sqlDump += ` CACHE ${cache};\n`;
    }
    sqlDump += '\n';

    // ========== TABLES ==========
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

      const columnsResult = await client.queryArray(
        `SELECT
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default,
          udt_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [tableName]
      );

      sqlDump += `\n-- =============================================\n`;
      sqlDump += `-- Table: ${tableName}\n`;
      sqlDump += `-- =============================================\n`;
      sqlDump += `DROP TABLE IF EXISTS "${tableName}" CASCADE;\n`;
      sqlDump += `CREATE TABLE "${tableName}" (\n`;

      const columnDefs: string[] = [];
      const columnTypes: Record<string, string> = {};

      for (const [colName, dataType, maxLength, nullable, defaultValue] of columnsResult.rows as [string, string, number | null, string, string | null, string][]) {
        columnTypes[colName] = dataType;
        let colDef = `  "${colName}" ${dataType.toUpperCase()}`;
        if (maxLength && (dataType === 'character varying' || dataType === 'character')) {
          colDef += `(${maxLength})`;
        }
        if (defaultValue !== null) colDef += ` DEFAULT ${defaultValue}`;
        if (nullable === 'NO') colDef += ' NOT NULL';
        columnDefs.push(colDef);
      }

      sqlDump += columnDefs.join(',\n') + '\n);\n';

      // Primary key
      const pkResult = await client.queryArray(
        `SELECT a.attname
         FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         WHERE i.indrelid = $1::regclass AND i.indisprimary`,
        [tableName]
      );
      if (pkResult.rows.length > 0) {
        const pkColumns = pkResult.rows.map(row => `"${row[0]}"`).join(', ');
        sqlDump += `ALTER TABLE "${tableName}" ADD PRIMARY KEY (${pkColumns});\n`;
      }

      // Data
      const countResult = await client.queryObject(`SELECT COUNT(*) as count FROM "${tableName}"`);
      const rowCount = Number(countResult.rows[0].count);

      if (rowCount === 0) {
        console.log(`  └─ Schema created, no data`);
        continue;
      }

      console.log(`  └─ Schema created, ${rowCount} rows`);

      const data = await client.queryObject(`SELECT * FROM "${tableName}"`);
      if (data.rows.length === 0) continue;

      const columnNames = Object.keys(data.rows[0]);
      const quotedColumns = columnNames.map(col => `"${col}"`).join(', ');
      sqlDump += `\n-- Data for ${tableName}\n`;

      const batchSize = 100;
      for (let i = 0; i < data.rows.length; i += batchSize) {
        const batch = data.rows.slice(i, i + batchSize);
        const valueRows = batch.map(row => {
          const values = columnNames.map(col => {
            const val = row[col];
            const colType = columnTypes[col] ?? '';
            if (val === null) return 'NULL';
            if (typeof val === 'boolean') return val ? 'true' : 'false';
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
            if (val instanceof Date) {
              // DATE columns: only YYYY-MM-DD, no time component
              if (colType === 'date') {
                return `'${val.toISOString().split('T')[0]}'`;
              }
              // TIMESTAMP/TIMESTAMPTZ: full ISO string
              return `'${val.toISOString()}'`;
            }
            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            return String(val);
          }).join(', ');
          return `(${values})`;
        }).join(',\n  ');
        sqlDump += `INSERT INTO "${tableName}" (${quotedColumns}) VALUES\n  ${valueRows};\n`;
      }
    }

    // ========== FOREIGN KEYS ==========
    sqlDump += `\n-- =============================================\n`;
    sqlDump += `-- Foreign Key Constraints\n`;
    sqlDump += `-- =============================================\n`;

    const fkResult = await client.queryArray(
      `SELECT
        tc.table_name,
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule,
        rc.update_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
        AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, tc.constraint_name`
    );

    for (const [tableName, constraintName, columnName, foreignTable, foreignColumn, deleteRule, updateRule] of fkResult.rows as [string, string, string, string, string, string, string][]) {
      sqlDump += `ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" `;
      sqlDump += `FOREIGN KEY ("${columnName}") `;
      sqlDump += `REFERENCES "${foreignTable}" ("${foreignColumn}")`;
      if (deleteRule !== 'NO ACTION') sqlDump += ` ON DELETE ${deleteRule}`;
      if (updateRule !== 'NO ACTION') sqlDump += ` ON UPDATE ${updateRule}`;
      sqlDump += `;\n`;
    }

    // ========== INDEXES ==========
    sqlDump += `\n-- =============================================\n`;
    sqlDump += `-- Indexes\n`;
    sqlDump += `-- =============================================\n`;

    const indexResult = await client.queryArray(
      `SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname NOT LIKE '%_pkey'
      ORDER BY tablename, indexname`
    );

    for (const [, , , indexDef] of indexResult.rows as [string, string, string, string][]) {
      sqlDump += `${indexDef};\n`;
    }

    // ========== RESET SEQUENCES ==========
    // ========== RESET SEQUENCES ==========
    sqlDump += `\n-- =============================================\n`;
    sqlDump += `-- Reset sequences to max existing values\n`;
    sqlDump += `-- =============================================\n`;

    const seqSyncResult = await client.queryArray(
      `SELECT
        seq.relname AS seq_name,
        col.attname AS col_name,
        tbl.relname AS table_name
      FROM pg_class seq
      JOIN pg_namespace n ON n.oid = seq.relnamespace
      JOIN pg_attrdef def ON def.adbin::text LIKE '%' || seq.relname || '%'
      JOIN pg_attribute col ON col.attrelid = def.adrelid AND col.attnum = def.adnum
      JOIN pg_class tbl ON tbl.oid = def.adrelid
      WHERE seq.relkind = 'S'
        AND n.nspname = 'public'`
    );

    for (const [seqName, colName, tableName] of seqSyncResult.rows as [string, string, string][]) {
      sqlDump += `SELECT setval('${seqName}', COALESCE((SELECT MAX("${colName}") FROM "${tableName}"), 1));\n`;
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
 * Upload to R2 using presigned URL
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

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: 'application/gzip',
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 60 * 60,
    });

    console.log('Generated presigned URL, uploading...');

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/gzip' },
      body: fileBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`);
    }

    console.log('✓ Backup uploaded successfully');

    const publicUrl = `https://pub-${R2_ACCOUNT_ID}.r2.dev/${key}`;
    return publicUrl;
  } catch (error) {
    throw new Error(`Failed to upload to R2: ${error instanceof Error ? error.message : String(error)}`);
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

  // Convert to IST (GMT+5:30)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);

  const dateStr = istDate.toISOString().split('T')[0];
  const timeStr = istDate.toISOString().split('T')[1].substring(0, 5).replace(':', '');
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
 * Only the scheduled job may start a backup (BUGS #68).
 *
 * The platform's JWT check lets through anyone holding the public anon key,
 * which every browser has. So the cron job also sends `x-backup-secret`, read
 * from Supabase Vault (`backup_cron_secret`), and this compares it with the
 * same Vault entry over the function's own database connection. No secret has
 * to be copied into the function's settings, and rotating it is one SQL call.
 */
async function isScheduledCall(req: Request): Promise<boolean> {
  const given = req.headers.get('x-backup-secret');
  if (!given) return false;

  const client = new Client(databaseUrl());
  await client.connect();
  try {
    const result = await client.queryArray(
      `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'backup_cron_secret'`
    );
    const expected = result.rows[0]?.[0];
    if (typeof expected !== 'string' || expected.length === 0) return false;

    const a = new TextEncoder().encode(given);
    const b = new TextEncoder().encode(expected);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  } finally {
    await client.end();
  }
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

    if (!(await isScheduledCall(req))) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // The file's link stays out of the response: a backup is the whole
    // database, and the caller (the cron job) never reads it anyway.
    const { uploadUrl: _uploadUrl, ...result } = await performBackup();

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