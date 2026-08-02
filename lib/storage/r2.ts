/**
 * Cloudflare R2 object storage, reached through the S3 API.
 *
 * The S3 client was previously constructed inline in three separate route
 * handlers, each with its own copy of the credentials block and its own way of
 * deriving the object key. One of them derived the key by splitting the public
 * URL on '/case-sheets/', because the key was never stored anywhere.
 *
 * Everything now goes through here, and `case_sheet_attachments.file_key`
 * records the real key at upload time.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const BUCKET = process.env.NEXT_PUBLIC_R2_BUCKET_NAME || ''
const ACCOUNT = process.env.R2_ACCOUNT_ID || ''

function client(): S3Client {
  return new S3Client({
    region: 'auto',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
    endpoint: `https://${ACCOUNT}.r2.cloudflarestorage.com`,
  })
}

/** Public URL for an object key. */
export function publicUrl(key: string): string {
  return `https://pub-${ACCOUNT}.r2.dev/${key}`
}

/**
 * Builds the object key for a case sheet attachment.
 *
 * The filename is sanitised once, here. The old code sanitised differently in
 * the edge function and the PATCH handler and stamped a timestamp in each, so
 * stored objects ended up named `1774695985539_1774695985074_Resume.pdf`
 * (BUGS.md #62).
 */
export function attachmentKey(patientId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
  return `case-sheets/${patientId}/${Date.now()}_${safe}`
}

/**
 * Recovers the key from a stored public URL, for rows written before
 * `file_key` existed. Returns null when the URL is not one of ours.
 */
export function keyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const [, tail] = url.split('.r2.dev/')
  return tail || null
}

export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  await client().send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }),
  )
}

/** Time-limited URL the browser can open directly. One hour, as before. */
export async function signedGetUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn })
}

/**
 * Reads an object into memory.
 *
 * Needed for PDF merging: the browser cannot fetch the R2 URL directly (no CORS
 * headers on the bucket), so the bytes are proxied through our own route.
 */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const result = await client().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  const body = result.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined

  if (!body?.transformToByteArray) {
    throw new Error('Storage returned an empty response')
  }
  return body.transformToByteArray()
}

/** Best-effort delete. A failure here must not block deleting the database row. */
export async function deleteObject(key: string): Promise<void> {
  try {
    await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  } catch (error) {
    console.error(`[r2] failed to delete ${key}:`, error)
  }
}
