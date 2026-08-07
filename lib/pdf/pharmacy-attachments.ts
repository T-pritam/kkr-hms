/**
 * Appending pharmacy bills to a downloaded document.
 *
 * Shared by the patient charges statement and the charge sheet, which offer the
 * same "tick what to append, get one PDF" download. Each selected bill is
 * fetched in full — the list only carries its number and date — and rendered as
 * its own document, so the merge puts every bill on a fresh page.
 *
 * A bill that cannot be fetched or rendered contributes an empty part rather
 * than throwing: `mergePdfs` reports those by label and still produces the
 * document, because the user wants the statement whether or not one attachment
 * is readable.
 */

import type { MergePart } from './merge'
import { docBytes } from './merge'
import { renderPharmacyBill, type PharmacyBillData } from './pharmacy-bill-pdf'
import type { PatientChargesPatient } from './patient-charges-pdf'

/** The bill as the list knows it, before the full fetch. */
export interface PharmacyBillRef {
  id: string
  entry_number: string | null
  entry_date: string
}

export async function pharmacyBillParts(
  bills: PharmacyBillRef[],
  /** The bill's own URL, which differs between a patient and a charge sheet. */
  endpointFor: (billId: string) => string,
  patient: PatientChargesPatient,
): Promise<MergePart[]> {
  const parts: MergePart[] = []

  for (const bill of bills) {
    const label = `Pharmacy bill ${bill.entry_number || bill.id}`
    try {
      const res = await fetch(endpointFor(bill.id))
      const detail = await res.json()
      if (!res.ok) throw new Error('unreadable')

      const data: PharmacyBillData = {
        patient,
        entry_number: detail.entry_number,
        external_bill_id: detail.external_bill_id,
        entry_date: detail.entry_date,
        net_amount: detail.net_amount,
        items: detail.items || [],
      }
      parts.push({ label, bytes: docBytes(renderPharmacyBill(data)) })
    } catch {
      parts.push({ label, bytes: new Uint8Array() })
    }
  }

  return parts
}
