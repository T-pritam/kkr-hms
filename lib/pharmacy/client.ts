/**
 * SmartPharma360 client — login (cached), bill id resolution, bill fetch.
 *
 * SmartPharma360 is a third-party pharmacy billing site, not ours, and it can
 * rate-limit or ban a client that calls it too often. So the rule here is:
 * log in as rarely as the token allows, and never call `retail_sale_details`
 * more than once per bill — the caller stores what comes back and reads it
 * from our own DB after that (see app/api/patients/[id]/pharmacy-bills).
 *
 * The token is cached in `pharmacy_api_sessions` (a DB table, not an
 * in-memory variable) because Next.js API routes run as separate serverless
 * invocations with no shared memory between them — an in-process cache would
 * be reset, and would log in again, on almost every request.
 */

import { SupabaseClient } from '@supabase/supabase-js'

const BASE_URL = process.env.PHARMACY_API_BASE_URL || 'https://kkr.smartpharma360.in/api'
const USERNAME = process.env.PHARMACY_API_USERNAME
const PASSWORD = process.env.PHARMACY_API_PASSWORD

const TOKEN_SCOPE = 'global'
/** Refresh a little before the JWT actually expires, so a request in flight
 * never gets a token that dies mid-call. */
const EXPIRY_BUFFER_MS = 60_000
const NUMERIC_ID = /^\d+$/

/** Reads the `exp` claim straight off the JWT payload — no signature check
 * needed, since we only ever trust a token we just received from our own
 * login call. */
function decodeJwtExpiry(token: string): Date | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'))
    if (typeof payload.exp !== 'number') return null
    return new Date(payload.exp * 1000)
  } catch {
    return null
  }
}

async function login(): Promise<{ token: string; expiresAt: Date }> {
  if (!USERNAME || !PASSWORD) {
    throw new Error('Pharmacy integration is not configured (PHARMACY_API_USERNAME/PASSWORD)')
  }

  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  })

  const json = await res.json().catch(() => null)
  const token = json?.results?.access
  if (!res.ok || typeof token !== 'string') {
    throw new Error('Could not sign in to the pharmacy system')
  }

  // A fallback expiry (5 hours, matching the sample token's lifetime) in the
  // unlikely case the token isn't a decodable JWT — better to refresh a bit
  // early than to cache something with no known expiry forever.
  const expiresAt = decodeJwtExpiry(token) ?? new Date(Date.now() + 5 * 60 * 60 * 1000)
  return { token, expiresAt }
}

/** Returns a live token, logging in only if the cached one is missing or
 * about to expire. This is the entire point of the cache table. */
export async function getPharmacyToken(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from('pharmacy_api_sessions')
    .select('access_token, expires_at')
    .eq('scope', TOKEN_SCOPE)
    .maybeSingle()

  if (
    data?.access_token &&
    data.expires_at &&
    new Date(data.expires_at).getTime() - EXPIRY_BUFFER_MS > Date.now()
  ) {
    return data.access_token
  }

  const { token, expiresAt } = await login()

  await supabase.from('pharmacy_api_sessions').upsert({
    scope: TOKEN_SCOPE,
    access_token: token,
    expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  })

  return token
}

/**
 * Fetches from SmartPharma360 with the cached bearer token.
 *
 * A 401 forces exactly one re-login and retry — the token can be invalidated
 * server-side before our cached expiry says it should be. Not a loop: a
 * second 401 is a real failure, not a caching problem.
 */
async function authedFetch(
  supabase: SupabaseClient,
  path: string,
  retry = true,
): Promise<any> {
  const token = await getPharmacyToken(supabase)
  // SmartPharma360 expects the raw token in the Authorization header — no
  // "Bearer " scheme prefix. Sending one gets "Incorrect token is provided,
  // try re-login" even though the token itself is valid.
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: token },
  })

  if (res.status === 401 && retry) {
    await supabase
      .from('pharmacy_api_sessions')
      .update({ access_token: null, expires_at: null })
      .eq('scope', TOKEN_SCOPE)
    return authedFetch(supabase, path, false)
  }

  const json = await res.json().catch(() => null)
  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || 'The pharmacy system did not return that bill')
  }

  return json
}

/**
 * A bare bill id (e.g. `34069611`) is used as-is. Anything else is treated as
 * an entry number (e.g. `SI-KK-26-001558`) and resolved via a search call —
 * one extra request, only when the caller didn't already have the numeric id.
 */
export async function resolveExternalBillId(
  supabase: SupabaseClient,
  billId: string,
): Promise<number> {
  if (NUMERIC_ID.test(billId)) return Number(billId)

  const json = await authedFetch(
    supabase,
    `/retail_sale_list?search=${encodeURIComponent(billId)}&page=1&admin=true`,
  )

  const count = json?.results?.count ?? 0
  if (count === 0) throw new Error('No bill found with that number')
  if (count !== 1) throw new Error('That bill number is ambiguous — use the numeric bill id instead')

  const id = json.results.rows?.[0]?.id
  if (!id) throw new Error('No bill found with that number')
  return id
}

export interface PharmacyBillHead {
  entry_number: string | null
  entry_date: string | null
  invoice_number: string | null
  invoice_url: string | null
  patient_name: string | null
  doctor_name: string | null
  net_amount: number | null
  gross_total: number | null
  total_gst_value: number | null
  total_disc: number | null
  rounding: number | string | null
  [key: string]: unknown
}

export interface PharmacyBillItem {
  product_name: string
  batch_number: string | null
  packing: string | null
  sale_quantity: number
  mrp: number | string | null
  gst: number | string | null
  gst_value: number | string | null
  net_amount: number | string
  hsn_code?: string | null
  mfg?: string | null
  expiry?: string | null
  schedule_type?: string | null
  [key: string]: unknown
}

export async function fetchBillDetails(
  supabase: SupabaseClient,
  externalId: number,
): Promise<{ head: PharmacyBillHead; items: PharmacyBillItem[] }> {
  const json = await authedFetch(supabase, `/retail_sale_details/${externalId}`)
  return {
    head: json?.results?.head ?? {},
    items: Array.isArray(json?.results?.items) ? json.results.items : [],
  }
}
