'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MedicineSelect } from './medicine-select'
import { COMMON_USAGE } from '@/lib/case-sheet/constants'
import { Plus, Trash2 } from 'lucide-react'

/**
 * Discharge advice — medication.
 *
 * Four columns, exactly as agreed: medicine, dosage, quantity, usage. Desktop
 * gets a labelled grid; mobile gets one card per medicine, which is the house
 * pattern everywhere a table would otherwise overflow.
 *
 * Rows are kept in the parent's state and submitted whole. A row with no
 * medicine name is dropped server-side, so the trailing blank row costs nothing.
 */

export interface MedicationRow {
  medicine_id: string | null
  medicine_name: string
  dosage: string
  quantity: string
  usage: string
}

export const BLANK_MEDICATION: MedicationRow = {
  medicine_id: null,
  medicine_name: '',
  dosage: '',
  quantity: '',
  usage: '',
}

interface MedicationRowsProps {
  value: MedicationRow[]
  onChange: (rows: MedicationRow[]) => void
  disabled?: boolean
}

export function MedicationRows({ value, onChange, disabled }: MedicationRowsProps) {
  const update = (index: number, patch: Partial<MedicationRow>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const remove = (index: number) => {
    const next = value.filter((_, i) => i !== index)
    onChange(next.length > 0 ? next : [{ ...BLANK_MEDICATION }])
  }

  return (
    <div className="space-y-3">
      {/* Column labels, desktop only — the mobile cards label each field inline. */}
      <div className="hidden md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.6fr)_auto] gap-2 px-1">
        <span className="text-xs font-medium text-muted">Medicine</span>
        <span className="text-xs font-medium text-muted">Dosage</span>
        <span className="text-xs font-medium text-muted">Qty</span>
        <span className="text-xs font-medium text-muted">Usage</span>
        <span className="w-10" />
      </div>

      {value.map((row, index) => (
        <div
          key={index}
          className="rounded-lg border border-border p-3 md:border-0 md:p-0 md:rounded-none space-y-2 md:space-y-0 md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.6fr)_auto] md:gap-2 md:items-start"
        >
          <div className="space-y-1 md:space-y-0">
            <span className="md:hidden text-xs font-medium text-muted">Medicine</span>
            <MedicineSelect
              value={row.medicine_name}
              medicineId={row.medicine_id}
              onChange={(name, medicineId) => update(index, { medicine_name: name, medicine_id: medicineId })}
              disabled={disabled}
              aria-label={`Medicine ${index + 1}`}
            />
          </div>

          <div className="space-y-1 md:space-y-0">
            <span className="md:hidden text-xs font-medium text-muted">Dosage</span>
            <Input
              value={row.dosage}
              onChange={e => update(index, { dosage: e.target.value })}
              disabled={disabled}
              placeholder="500 mg"
              aria-label={`Dosage ${index + 1}`}
            />
          </div>

          <div className="space-y-1 md:space-y-0">
            <span className="md:hidden text-xs font-medium text-muted">Qty</span>
            <Input
              value={row.quantity}
              onChange={e => update(index, { quantity: e.target.value })}
              disabled={disabled}
              placeholder="10 tabs"
              aria-label={`Quantity ${index + 1}`}
            />
          </div>

          <div className="space-y-1 md:space-y-0">
            <span className="md:hidden text-xs font-medium text-muted">Usage</span>
            <Input
              value={row.usage}
              onChange={e => update(index, { usage: e.target.value })}
              disabled={disabled}
              placeholder="1-0-1 after food"
              list="common-usage"
              aria-label={`Usage ${index + 1}`}
            />
          </div>

          <div className="flex md:block">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(index)}
              disabled={disabled}
              aria-label={`Remove medicine ${index + 1}`}
              className="text-muted hover:text-destructive"
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </div>
      ))}

      {/* Suggestions for the Usage box; typing anything else is still fine. */}
      <datalist id="common-usage">
        {COMMON_USAGE.map(usage => <option key={usage} value={usage} />)}
      </datalist>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...value, { ...BLANK_MEDICATION }])}
        disabled={disabled}
      >
        <Plus size={14} className="mr-1.5" />
        Add medicine
      </Button>
    </div>
  )
}
