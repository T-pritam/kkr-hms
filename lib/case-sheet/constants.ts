/**
 * Case sheet vocabularies.
 *
 * Kept here rather than inline in the editor so the form, the PDF and the
 * validator all agree on the same wording.
 */

import type { CaseSheetStatus } from './types'

export const CASE_SHEET_STATUSES: CaseSheetStatus[] = ['draft', 'final']

export const STATUS_LABELS: Record<CaseSheetStatus, string> = {
  draft: 'Draft',
  final: 'Finalised',
}

/**
 * Condition at discharge. LAMA — "left against medical advice" — and Absconded
 * both matter medico-legally: they say the hospital did not agree to the
 * discharge, which changes who is answerable for what happens next.
 */
export const DISCHARGE_CONDITIONS = [
  'Stable',
  'Improved',
  'Recovered',
  'Referred',
  'Discharge on Request',
  'LAMA (Left Against Medical Advice)',
  'Absconded',
  'Expired',
] as const

export const MEDICINE_FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Injection',
  'Drops',
  'Ointment',
  'Inhaler',
  'Sachet',
  'Other',
] as const

/**
 * Offered under the Usage field. The 1-0-1 notation is how Indian prescriptions
 * are written: morning-afternoon-night.
 */
export const COMMON_USAGE = [
  '1-0-0 (morning)',
  '0-0-1 (night)',
  '1-0-1 (twice daily)',
  '1-1-1 (thrice daily)',
  'SOS (when required)',
  'Once weekly',
] as const

/** Uploaded scans. PDF only — anything else cannot be appended to the summary. */
export const ATTACHMENT_MIME = 'application/pdf'
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  created:   'Created',
  updated:   'Updated',
  deleted:   'Deleted',
  finalised: 'Finalised',
  reopened:  'Reopened',
}

/**
 * Field labels, used by the change log and by the finalise error messages so
 * the user never sees a raw column name.
 */
export const FIELD_LABELS: Record<string, string> = {
  admission_date:          'Admission date',
  discharge_date:          'Discharge date',
  discharge_time:          'Discharge time',
  discharge_received_by:   'Received by',
  chief_complaints:        'Chief complaints',
  history_present_illness: 'History of present illness',
  past_history:            'Past history',
  diagnosis:               'Diagnosis',
  investigations:          'Investigations',
  clinical_summary:        'Summary',
  advice_notes:            'Discharge advice notes',
  condition_on_discharge:  'Condition on discharge',
  vitals_bp:               'BP',
  vitals_pulse:            'Pulse',
  vitals_temp:             'Temperature',
  vitals_spo2:             'SpO2',
  follow_up_date:          'Follow-up date',
  follow_up_instructions:  'Follow-up instructions',
  doctors:                 'Consulting doctors',
  medications:             'Discharge medication',
  status:                  'Status',
}
