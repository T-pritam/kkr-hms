/**
 * Shared types for the case sheet / discharge summary module.
 *
 * These mirror the database columns rather than the wire format, so a route
 * handler and the PDF renderer describe the same record the same way.
 */

export type CaseSheetStatus = 'draft' | 'final'

export type AuditAction = 'created' | 'updated' | 'deleted' | 'finalised' | 'reopened'

export interface CaseSheetDoctor {
  id: string
  doctor_id: string | null
  doctor_name: string
  doctor_specialist: string | null
  display_order: number
}

export interface CaseSheetMedication {
  id: string
  medicine_id: string | null
  medicine_name: string
  dosage: string | null
  quantity: string | null
  usage: string | null
  display_order: number
}

export interface CaseSheetAttachment {
  id: string
  file_url: string
  file_key: string | null
  filename: string | null
  size_bytes: number | null
  uploaded_by: string | null
  uploaded_by_name: string | null
  uploaded_at: string | null
  display_order: number
}

export interface CaseSheet {
  id: string
  patient_id: string
  patient_billing_id: string | null

  summary_no: string | null
  status: CaseSheetStatus

  // Admission & stay
  admission_date: string | null
  discharge_date: string | null
  ward: string | null
  bed: string | null

  // Presenting details
  chief_complaints: string | null
  history_present_illness: string | null
  past_history: string | null

  // The core of the summary
  diagnosis: string | null
  investigations: string | null
  clinical_summary: string | null

  // Discharge advice
  advice_notes: string | null

  // Condition on discharge
  condition_on_discharge: string | null
  vitals_bp: string | null
  vitals_pulse: string | null
  vitals_temp: string | null
  vitals_spo2: string | null

  // Follow-up
  follow_up_date: string | null
  follow_up_instructions: string | null

  // Attribution
  created_at: string | null
  created_by: string | null
  created_by_name: string | null
  updated_at: string | null
  updated_by: string | null
  updated_by_name: string | null
  finalised_at: string | null
  finalised_by: string | null
  finalised_by_name: string | null

  doctors: CaseSheetDoctor[]
  medications: CaseSheetMedication[]
  attachments: CaseSheetAttachment[]
}

export interface AuditEntry {
  id: string
  entity_type: string
  entity_id: string
  patient_id: string | null
  action: AuditAction
  changes: Record<string, { from: unknown; to: unknown }> | null
  summary: string | null
  actor_id: string | null
  actor_name: string | null
  actor_role: string | null
  created_at: string
}

export interface Medicine {
  id: string
  name: string
  form: string | null
  strength: string | null
  is_active: boolean
}

/** Per-field errors, keyed by the field name the editor uses. */
export type FieldErrors = Record<string, string>
