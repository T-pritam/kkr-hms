/**
 * Fetching a bill to show it, then saving the same fetch.
 *
 * A bill used to be stored the moment an id was typed, so the desk learned it
 * was the wrong invoice only after it had landed on a patient's bill. Now it is
 * fetched, shown, and written only on confirmation — and the fetch happens once:
 * `createPreview` parks the payload, `consumePreview` takes it back out.
 *
 * The payload deliberately never round-trips through the browser. The point of
 * storing a pharmacy bill is that it is what the pharmacy said; anything the
 * client could edit on the way back would not be.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { fetchBillDetails, resolveExternalBillId } from './client'
import type { BillDetails } from './store'

/** How long an unconfirmed preview is worth keeping. */
const PREVIEW_TTL_MS = 60 * 60 * 1000

/**
 * Refuses an invoice that is already on somebody's bill.
 *
 * Scoped to bills with a patient charge: since a sheet can quote an invoice
 * without billing it, the same `external_bill_id` may legitimately appear on
 * several quotes, and only one real charge.
 */
export async function findBilledCopy(supabase: SupabaseClient, externalId: number) {
  const { data } = await supabase
    .from('pharmacy_bills')
    .select('id')
    .eq('external_bill_id', externalId)
    .not('patient_charge_id', 'is', null)
    .maybeSingle()

  return data ?? null
}

export interface PharmacyPreview {
  token: string
  external_bill_id: number
  details: BillDetails
}

/**
 * Resolves the id, fetches the bill once, and parks it for the save that
 * follows. Throws with a `status` so the route can pass the reason through.
 */
export async function createPreview(
  supabase: SupabaseClient,
  userId: string,
  billId: string,
): Promise<PharmacyPreview> {
  // Anything abandoned by an earlier session goes now, so the table cannot grow
  // without bound on a feature nobody sweeps by hand.
  await supabase
    .from('pharmacy_bill_previews')
    .delete()
    .lt('created_at', new Date(Date.now() - PREVIEW_TTL_MS).toISOString())

  const externalId = await resolveExternalBillId(supabase, billId)

  // Checked before spending a call on retail_sale_details.
  if (await findBilledCopy(supabase, externalId)) {
    throw Object.assign(new Error('This pharmacy bill has already been added'), { status: 409 })
  }

  const details = await fetchBillDetails(supabase, externalId)
  if (!details.items.length) {
    throw Object.assign(new Error('That bill has no medicines on it'), { status: 400 })
  }

  const { data, error } = await supabase
    .from('pharmacy_bill_previews')
    .insert({ external_bill_id: externalId, payload: details, created_by: userId })
    .select('token')
    .single()

  if (error) throw error

  return { token: data.token, external_bill_id: externalId, details }
}

/**
 * Takes a parked payload back out, deleting it so one preview saves once.
 *
 * Returns null when the token is unknown — already used, swept, or invented.
 */
export async function consumePreview(
  supabase: SupabaseClient,
  token: string,
): Promise<{ external_bill_id: number; details: BillDetails } | null> {
  const { data } = await supabase
    .from('pharmacy_bill_previews')
    .select('token, external_bill_id, payload')
    .eq('token', token)
    .maybeSingle()

  if (!data) return null

  await supabase.from('pharmacy_bill_previews').delete().eq('token', data.token)

  return { external_bill_id: data.external_bill_id, details: data.payload as BillDetails }
}
