'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Plus, RotateCcw, X } from 'lucide-react'
import { rupeesInWords } from '@/lib/format/rupees-in-words'
import { receiptAmount } from '@/lib/pdf/payment-receipt-pdf'
import { ReceiptDoctorInput, type DoctorOption } from './receipt-doctor-input'

/**
 * The parts of a payment receipt form that do not depend on where the rows
 * come from: the receipt's own details, who it is billed to, the consultant
 * doctors, and the total. A registered patient's receipt
 * (`components/patients/payment-receipt-modal.tsx`) and an old patient's
 * (`old-patient-receipt-modal.tsx`) both draw these, so the two look and
 * behave the same.
 */

export interface HeaderForm {
  receipt_no: string
  heading: string
  patient_name: string
  age_sex: string
  mobile: string
  address: string
  ip_no: string
  department: string
  created_by_label: string
}

export interface DoctorForm {
  name: string
  designation: string
}

export const EMPTY_HEADER: HeaderForm = {
  receipt_no: '',
  heading: 'Cash Receipt',
  patient_name: '',
  age_sex: '',
  mobile: '',
  address: '',
  ip_no: '',
  department: '',
  created_by_label: '',
}

export const MAX_DOCTORS = 8

export const inputClass =
  'w-full bg-surface-inset text-foreground rounded-lg px-3 py-2 text-sm border border-border focus:border-ring focus:outline-none disabled:opacity-50'
export const cardClass = 'rounded-xl border border-border bg-surface-hover/40 p-4 space-y-3'
export const headingClass = 'text-xs font-semibold uppercase tracking-wide text-muted'
export const cellClass =
  'w-full min-w-[6rem] bg-surface-inset text-foreground rounded-md px-2 py-1.5 text-sm border border-border focus:border-ring focus:outline-none disabled:opacity-40'
export const labelClass = 'block text-xs font-medium text-muted mb-1'

/** Saved doctors as the form edits them. Receipts from before designations hold bare names. */
export const doctorsOf = (stored: unknown): DoctorForm[] =>
  (Array.isArray(stored) ? stored : []).map(entry =>
    typeof entry === 'string'
      ? { name: entry, designation: '' }
      : { name: String(entry?.name ?? ''), designation: String(entry?.designation ?? '') },
  )

/** The doctors as they are saved and printed: trimmed, blank lines dropped. */
export const typedDoctors = (doctors: DoctorForm[]) =>
  doctors
    .map(doctor => ({ name: doctor.name.trim(), designation: doctor.designation.trim() }))
    .filter(doctor => doctor.name)

/** The receipt can be saved once it has a number and a name; the caller adds its own row rule. */
export const headerReady = (header: HeaderForm) => Boolean(header.receipt_no.trim() && header.patient_name.trim())

type OnField = (field: keyof HeaderForm) => (e: { target: { value: string } }) => void

/** A field setter for `HeaderForm` state. */
export const fieldSetter =
  (setHeader: Dispatch<SetStateAction<HeaderForm>>): OnField =>
  field =>
  e =>
    setHeader(prev => ({ ...prev, [field]: e.target.value }))

export function ReceiptDetailsCard({ header, onField }: { header: HeaderForm; onField: OnField }) {
  const set = onField
  return (
    <section className={cardClass}>
      <h4 className={headingClass}>Receipt</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="receipt-no" className={labelClass}>
            Receipt No <span className="text-destructive">*</span>
          </label>
          <input
            id="receipt-no"
            autoFocus
            value={header.receipt_no}
            onChange={set('receipt_no')}
            placeholder="From your receipt book, e.g. 287(A)"
            maxLength={40}
            className={`${inputClass} font-semibold ${header.receipt_no.trim() ? '' : 'border-warning'}`}
          />
        </div>
        <div>
          <label htmlFor="receipt-heading" className={labelClass}>Heading</label>
          <input id="receipt-heading" value={header.heading} onChange={set('heading')} maxLength={60} className={inputClass} />
        </div>
        <div>
          <label htmlFor="receipt-created-by" className={labelClass}>Created by</label>
          <input
            id="receipt-created-by"
            value={header.created_by_label}
            onChange={set('created_by_label')}
            maxLength={60}
            className={inputClass}
          />
        </div>
      </div>
    </section>
  )
}

export function BillToCard({
  header,
  onField,
  onRefill,
}: {
  header: HeaderForm
  onField: OnField
  /** A registered patient's form offers to fill the details from the record again. */
  onRefill?: () => void
}) {
  const set = onField
  return (
    <section className={cardClass}>
      <div className="flex items-center justify-between gap-3">
        <h4 className={headingClass}>Bill to</h4>
        {onRefill && (
          <button type="button" onClick={onRefill} className="inline-flex items-center gap-1 text-xs text-info hover:underline">
            <RotateCcw size={12} /> Fill from the patient&apos;s record again
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2">
          <label htmlFor="receipt-name" className={labelClass}>
            Patient name <span className="text-destructive">*</span>
          </label>
          <input id="receipt-name" value={header.patient_name} onChange={set('patient_name')} maxLength={120} className={inputClass} />
        </div>
        <div>
          <label htmlFor="receipt-age" className={labelClass}>Age / sex</label>
          <input id="receipt-age" value={header.age_sex} onChange={set('age_sex')} maxLength={40} className={inputClass} />
        </div>
        <div>
          <label htmlFor="receipt-ip" className={labelClass}>IP no</label>
          <input id="receipt-ip" value={header.ip_no} onChange={set('ip_no')} maxLength={40} className={inputClass} />
        </div>
        <div className="col-span-2">
          <label htmlFor="receipt-mobile" className={labelClass}>Mobile no</label>
          <input id="receipt-mobile" value={header.mobile} onChange={set('mobile')} maxLength={60} className={inputClass} />
        </div>
        <div className="col-span-2">
          <label htmlFor="receipt-address" className={labelClass}>Address</label>
          <input
            id="receipt-address"
            value={header.address}
            onChange={set('address')}
            maxLength={300}
            placeholder="Left out of the receipt when empty"
            className={inputClass}
          />
        </div>
      </div>
    </section>
  )
}

export function DoctorsCard({
  doctors,
  setDoctors,
  options,
  header,
  setHeader,
}: {
  doctors: DoctorForm[]
  setDoctors: Dispatch<SetStateAction<DoctorForm[]>>
  options: DoctorOption[]
  header: HeaderForm
  setHeader: Dispatch<SetStateAction<HeaderForm>>
}) {
  const set = fieldSetter(setHeader)

  const setDoctor = (index: number, patch: Partial<DoctorForm>) =>
    setDoctors(prev => prev.map((doctor, i) => (i === index ? { ...doctor, ...patch } : doctor)))

  // Typing over a picked doctor drops the designation that came with them: it
  // belonged to the name that is no longer there. One the desk typed stays.
  const typeDoctor = (index: number, name: string) =>
    setDoctors(prev =>
      prev.map((doctor, i) => {
        if (i !== index) return doctor
        const was = options.find(option => option.name === doctor.name)
        const stale = Boolean(was?.designation) && was?.designation === doctor.designation && name !== doctor.name
        return { name, designation: stale ? '' : doctor.designation }
      }),
    )

  // Picking from the list brings the designation, and the department while it is empty.
  const pickDoctor = (index: number, doctor: DoctorOption) => {
    setDoctor(index, { name: doctor.name, designation: doctor.designation })
    if (doctor.department) setHeader(prev => (prev.department.trim() ? prev : { ...prev, department: doctor.department }))
  }

  return (
    <section className={cardClass}>
      <h4 className={headingClass}>Consultant doctors</h4>
      {doctors.length === 0 ? (
        <p className="text-xs text-muted">None yet. The line is left out of the receipt.</p>
      ) : (
        <div className="space-y-2">
          <div className="hidden sm:grid sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_2rem] gap-2 text-xs font-medium text-muted">
            <span>Doctor (pick from the list, or type a name)</span>
            <span>Designation</span>
            <span />
          </div>
          {doctors.map((doctor, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_2rem] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_2rem] gap-2 items-center"
            >
              <ReceiptDoctorInput
                ariaLabel={`Doctor ${index + 1}`}
                value={doctor.name}
                options={options}
                onType={name => typeDoctor(index, name)}
                onPick={picked => pickDoctor(index, picked)}
                className={inputClass}
              />
              <input
                aria-label={`Designation of doctor ${index + 1}`}
                value={doctor.designation}
                maxLength={80}
                placeholder="Designation (optional)"
                onChange={e => setDoctor(index, { designation: e.target.value })}
                className={`${inputClass} col-start-1 row-start-2 sm:col-start-2 sm:row-start-1`}
              />
              <button
                type="button"
                onClick={() => setDoctors(prev => prev.filter((_, i) => i !== index))}
                className="col-start-2 row-start-1 sm:col-start-3 flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-inset hover:text-destructive"
                aria-label={`Remove doctor ${index + 1}`}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        {doctors.length < MAX_DOCTORS ? (
          <button
            type="button"
            onClick={() => setDoctors(prev => [...prev, { name: '', designation: '' }])}
            className="inline-flex items-center gap-1 text-sm text-info hover:underline"
          >
            <Plus size={14} /> Add doctor
          </button>
        ) : (
          <span />
        )}
        <div className="w-full sm:w-72">
          <label htmlFor="receipt-department" className={labelClass}>Department</label>
          <input
            id="receipt-department"
            value={header.department}
            onChange={set('department')}
            maxLength={80}
            placeholder="e.g. General Medicine"
            className={inputClass}
          />
        </div>
      </div>
    </section>
  )
}

/** The total in figures and words, as the receipt will print it. */
export function ReceiptTotal({ total }: { total: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-lg bg-surface-inset px-4 py-3">
      <p className="text-sm text-muted first-letter:uppercase">Rupees: {rupeesInWords(total)}.</p>
      <p className="text-lg font-semibold text-foreground">
        <span className="mr-2 text-xs font-medium uppercase tracking-wide text-muted">Total</span>₹{receiptAmount(total)}/-
      </p>
    </div>
  )
}
