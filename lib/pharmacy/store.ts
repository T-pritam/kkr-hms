/**
 * Writing a fetched SmartPharma360 bill into our own tables.
 *
 * Shared by the two places a bill can be attached: a patient's charges, and a
 * charge sheet line. Both store exactly the same bill — the only difference is
 * which of the two owner columns is set, which is what
 * `pharmacy_bills_one_owner_check` enforces.
 *
 * Nothing here calls SmartPharma360. The fetch happens once in the route; this
 * only persists what came back.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type { PharmacyBillHead, PharmacyBillItem } from './client'

export interface BillDetails {
  head: PharmacyBillHead
  items: PharmacyBillItem[]
}

/** The fields of a bill that do not depend on which owner it hangs off. */
export function billColumns(externalId: number, details: BillDetails) {
  const { head } = details
  return {
    external_bill_id: externalId,
    entry_number: head.entry_number || null,
    entry_date: head.entry_date || new Date().toISOString().slice(0, 10),
    invoice_number: head.invoice_number || null,
    bill_patient_name: head.patient_name || null,
    doctor_name: head.doctor_name || null,
    invoice_url: head.invoice_url || null,
    net_amount: Number(head.net_amount) || 0,
    gross_total: head.gross_total ?? null,
    total_gst_value: head.total_gst_value ?? null,
    total_disc: head.total_disc ?? null,
    rounding: head.rounding ?? null,
    raw_response: details,
  }
}

/** How the charge or sheet line naming this bill reads on a bill or quote. */
export function billLabel(externalId: number, details: BillDetails): string {
  return `Pharmacy — ${details.head.entry_number || String(externalId)}`
}

/** The medicine lines, mapped to our column names. */
export function billItemRows(pharmacyBillId: string, items: PharmacyBillItem[]) {
  const num = (v: unknown) => (v === undefined || v === null ? null : Number(v))

  const text = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v))

  return items.map(it => ({
    pharmacy_bill_id: pharmacyBillId,
    product_name: it.product_name,
    batch_number: it.batch_number || null,
    packing: it.packing || null,
    sale_quantity: Number(it.sale_quantity) || 1,
    mrp: num(it.mrp),
    gst_percent: num(it.gst),
    gst_value: num(it.gst_value),
    net_amount: Number(it.net_amount) || 0,
    // Stored but mostly not printed — they came in the same payload, and
    // fetching a bill again just to read them would be a call to somebody
    // else's site for data we already had.
    hsn_code: text(it.hsn_code),
    mfg: text(it.mfg),
    expiry: text(it.expiry),
    schedule_type: text(it.schedule_type),
  }))
}

/**
 * Inserts the bill and its medicines against an owner that already exists.
 *
 * `owner` is exactly one of the two columns; the CHECK constraint refuses
 * anything else. Returns the created bill row.
 */
export async function insertPharmacyBill(
  supabase: SupabaseClient,
  owner: { patient_id?: string | null; patient_charge_id?: string; charge_sheet_item_id?: string },
  externalId: number,
  details: BillDetails,
  userId: string,
) {
  const { data: bill, error: billError } = await supabase
    .from('pharmacy_bills')
    .insert({
      ...owner,
      ...billColumns(externalId, details),
      created_by: userId,
      updated_by: userId,
    })
    .select()
    .single()

  if (billError) throw billError

  const { error: itemsError } = await supabase
    .from('pharmacy_bill_items')
    .insert(billItemRows(bill.id, details.items))

  if (itemsError) throw itemsError

  return bill
}

/** The stored bill columns worth carrying to a copy — everything but identity and owner. */
const COPYABLE = [
  'external_bill_id', 'entry_number', 'entry_date', 'invoice_number', 'bill_patient_name',
  'doctor_name', 'invoice_url', 'net_amount', 'gross_total', 'total_gst_value', 'total_disc',
  'rounding', 'raw_response',
] as const

/**
 * Copies a bill quoted on a charge sheet onto the real charge it became.
 *
 * A copy rather than a move, because a forwarded sheet is a historical document
 * and must keep showing the medicines it quoted. That is only representable
 * because "billed once" is enforced by a *partial* unique index — on bills with
 * a patient charge — so the quote and the charge may name the same invoice
 * while a second real billing of it still cannot happen.
 *
 * The medicines are copied from the stored rows rather than re-derived from
 * `raw_response`, so a copy is exactly what was quoted even if the payload
 * shape has since changed.
 */
export async function copyBillToCharge(
  supabase: SupabaseClient,
  sourceBill: Record<string, any>,
  target: { patient_id: string; patient_charge_id: string },
  userId: string,
) {
  const carried = Object.fromEntries(COPYABLE.map(key => [key, sourceBill[key] ?? null]))

  const { data: copy, error: billError } = await supabase
    .from('pharmacy_bills')
    .insert({ ...target, ...carried, created_by: userId, updated_by: userId })
    .select()
    .single()

  if (billError) throw billError

  // Read the medicines directly rather than expecting them pre-embedded: the
  // caller would otherwise need a three-level nested select, which is easy to
  // get subtly wrong and silently yields a bill copied without its medicines.
  const { data: sourceItems, error: readError } = await supabase
    .from('pharmacy_bill_items')
    .select('*')
    .eq('pharmacy_bill_id', sourceBill.id)

  if (readError) throw readError

  if (sourceItems && sourceItems.length > 0) {
    const { error: itemsError } = await supabase.from('pharmacy_bill_items').insert(
      sourceItems.map(item => ({
        pharmacy_bill_id: copy.id,
        product_name: item.product_name,
        batch_number: item.batch_number ?? null,
        packing: item.packing ?? null,
        sale_quantity: item.sale_quantity ?? 1,
        mrp: item.mrp ?? null,
        gst_percent: item.gst_percent ?? null,
        gst_value: item.gst_value ?? null,
        net_amount: item.net_amount,
      })),
    )
    if (itemsError) throw itemsError
  }

  return copy
}
