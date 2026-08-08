/**
 * lib/pdf/pharmacy-bill-pdf.ts — the letterhead name on every page.
 *
 * The artwork says "KKR DIAGNOSTIC CENTRE", and a pharmacy bill must not go out
 * under it. The words are part of the background image, so they are painted over
 * and rewritten — and the background is repainted on every page break, which is
 * how a two-page bill once came out correct on page one and wrong on page two.
 * That is the bug these tests exist for.
 */

import { describe, it, expect } from 'vitest'
import { renderPharmacyBill, type PharmacyBillItemRow } from '@/lib/pdf/pharmacy-bill-pdf'

const item = (n: number): PharmacyBillItemRow => ({
  product_name: `MEDICINE ${n}`,
  batch_number: `B${n}`,
  packing: '1S',
  expiry: '2028-01',
  sale_quantity: 1,
  mrp: 100,
  net_amount: 100,
})

const bill = (count: number) => ({
  patient: { name: 'Chiru', patient_id: '5/26' } as any,
  entry_number: 'SI-KK-26-001561',
  external_bill_id: 34074669,
  entry_date: '2026-08-05',
  net_amount: count * 100,
  items: Array.from({ length: count }, (_, i) => item(i + 1)),
})

/** How many pages jsPDF actually produced. */
const pageCount = (doc: ReturnType<typeof renderPharmacyBill>) =>
  doc.internal.pages.filter(Boolean).length

/** Times the word appears in the uncompressed content streams. */
const occurrences = (doc: ReturnType<typeof renderPharmacyBill>, word: string) =>
  doc.output().split(word).length - 1

describe('pharmacy bill letterhead name', () => {
  it('prints PHARMACY on a single-page bill', () => {
    const doc = renderPharmacyBill(bill(4))
    expect(pageCount(doc)).toBe(1)
    expect(occurrences(doc, 'PHARMACY')).toBeGreaterThan(0)
  })

  /** The regression: 27 medicines spill onto a second page. */
  it('prints it on every page of a bill that overflows', () => {
    const doc = renderPharmacyBill(bill(40))
    const pages = pageCount(doc)

    expect(pages).toBeGreaterThan(1)
    // One overprint per page. The title says "PHARMACY BILL" once on page one,
    // so the header accounts for the rest.
    expect(occurrences(doc, 'PHARMACY')).toBeGreaterThanOrEqual(pages)
  })

  it('scales the overprint with the page count', () => {
    const short = renderPharmacyBill(bill(4))
    const long = renderPharmacyBill(bill(40))

    const extraPages = pageCount(long) - pageCount(short)
    const extraNames = occurrences(long, 'PHARMACY') - occurrences(short, 'PHARMACY')

    expect(extraPages).toBeGreaterThan(0)
    expect(extraNames).toBe(extraPages)
  })
})
