import { describe, it, expect } from 'vitest'
import { combinedChargeRows, renderPatientCharges } from '@/lib/pdf/patient-charges-pdf'
import { combinedSheetRows } from '@/lib/pdf/charge-sheet-pdf'

/** The combined statements (client, 28 Sep): one line per charge. */
describe('combined charge statements', () => {
  const stay = [
    ...['2026-09-21', '2026-09-22', '2026-09-23'].map(d => ({
      charge_date: d, charge_type: 'Room (General)', qty: 1, billing_mode: 'per_day', amount: 2000, charge_item_id: 'room',
    })),
    // amount is the line total: 2 × ₹1,200
    { charge_date: '2026-09-21', charge_type: 'X-ray', qty: 2, billing_mode: 'one_time', amount: 2400, charge_item_id: 'xray' },
  ]

  it('prints the patient statement as rate × days/qty = amount', () => {
    expect(combinedChargeRows(stay)).toEqual([
      ['Room (General)', 'Rs.2,000.00', '3 days', 'Rs.6,000.00'],
      ['X-ray', 'Rs.1,200.00', '2', 'Rs.2,400.00'],
    ])
  })

  it('renders the combined patient statement as a PDF', () => {
    const doc = renderPatientCharges({ patient: { name: 'Ramesh', patient_id: '12/26' } as any, charges: stay }, 'digital', 'combined')
    const text = Buffer.from(new Uint8Array(doc.output('arraybuffer') as ArrayBuffer)).toString('latin1')
    expect(text).toContain('Days / Qty')
    expect(text).toContain('3 days')
  })

  it('combines a charge sheet the same way', () => {
    const lines = [
      { description: '', charge_name: 'Room', unit_price: 2000, qty: 1, billing_mode: 'per_day', service_date: '2026-09-21', charge_item_id: 'room' },
      { description: '', charge_name: 'Room', unit_price: 2000, qty: 1, billing_mode: 'per_day', service_date: '2026-09-22', charge_item_id: 'room' },
      { description: '', charge_name: 'Oxygen', unit_price: 150, qty: 6, billing_mode: 'per_hour', service_date: '2026-09-22', charge_item_id: 'o2' },
    ]
    expect(combinedSheetRows(lines)).toEqual([
      ['Room', 'Rs.2,000.00', '2 days', 'Rs.4,000.00'],
      ['Oxygen', 'Rs.150.00', '6 hrs', 'Rs.900.00'],
    ])
  })
})
