/**
 * The doctor registry's vocabularies.
 *
 * `department` is a fixed list so the doctors screen and the fee-settlement
 * screens can group by something stable. `specialist` stays free text alongside
 * it — it is the finer-grained label ("Interventional Cardiology"), and every
 * existing row already depends on it.
 */

export const DEPARTMENTS = [
  'General Medicine',
  'General Surgery',
  'Orthopaedics',
  'Obstetrics & Gynaecology',
  'Paediatrics',
  'Cardiology',
  'Dermatology',
  'ENT',
  'Ophthalmology',
  'Neurology',
  'Nephrology',
  'Gastroenterology',
  'Pulmonology',
  'Urology',
  'Psychiatry',
  'Dentistry',
  'Anaesthesiology',
  'Radiology',
  'Pathology & Laboratory',
  'Physiotherapy',
  'Emergency & Casualty',
  'Oncology',
  'Endocrinology',
  'Other',
] as const

export type Department = (typeof DEPARTMENTS)[number]

export const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  qualification: 'Qualification',
  designation: 'Designation',
  department: 'Department',
  specialist: 'Specialist',
  mobile: 'Mobile',
  email: 'Email',
  registration_no: 'Registration number',
  is_active: 'Status',
}

/**
 * Tables holding a foreign key to `doctors`, checked before a hard delete.
 *
 * DELETE used to wipe a doctor with no check at all, leaving four different
 * kinds of record pointing at a row that no longer existed (BUGS.md #47/#48).
 * The label is what the confirmation dialog shows the user.
 */
export const DOCTOR_REFERENCES = [
  { table: 'patient_consultations',     column: 'doctor_id', label: 'consultations' },
  { table: 'doctor_visit_settlements',  column: 'doctor_id', label: 'fee settlements' },
  { table: 'lab_orders',                column: 'referring_doctor_id', label: 'lab orders' },
  { table: 'case_sheet_doctors',        column: 'doctor_id', label: 'discharge summaries' },
] as const
