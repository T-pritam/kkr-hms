/**
 * The vocabularies the patient registry is allowed to hold.
 *
 * Every list here is mirrored by a CHECK constraint in
 * supabase/migrations/20260803000001 and 20260803000003. Adding an option means
 * changing both — the database is the thing that actually stops bad data.
 */

import type { BadgeVariant } from '@/components/ui/badge'

export const GENDERS = ['Male', 'Female', 'Other'] as const
export type Gender = (typeof GENDERS)[number]

export const PATIENT_STATUSES = ['Active', 'Discharged', 'Cancelled'] as const
export type PatientStatus = (typeof PATIENT_STATUSES)[number]

export const STATUS_VARIANTS: Record<PatientStatus, BadgeVariant> = {
  Active: 'success',
  Discharged: 'info',
  Cancelled: 'outline',
}

/** How each status came to be, shown as help text next to the dropdown. */
export const STATUS_HINTS: Record<PatientStatus, string> = {
  Active: 'Currently under care',
  Discharged: 'Set automatically when a discharge summary is finalised',
  Cancelled: 'Registration cancelled or created in error',
}

export const BLOOD_GROUPS = [
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown',
] as const
export type BloodGroup = (typeof BLOOD_GROUPS)[number]

export const ID_PROOF_TYPES = [
  'Aadhaar',
  'Voter ID',
  'PAN',
  'Driving Licence',
  'Passport',
  'Ration Card',
  'Other',
] as const

/** Relationship of the emergency contact to the patient. */
export const RELATIONS = [
  'Spouse',
  'Father',
  'Mother',
  'Son',
  'Daughter',
  'Brother',
  'Sister',
  'Guardian',
  'Friend',
  'Other',
] as const

/** Labels for validation messages, so an error names the field the way the form does. */
export const FIELD_LABELS: Record<string, string> = {
  patient_id: 'Patient ID',
  name: 'Name',
  gender: 'Gender',
  phone: 'Phone',
  alternate_phone: 'Alternate phone',
  date_of_birth: 'Date of birth',
  date_of_join: 'Date of joining',
  age_years: 'Age',
  blood_group: 'Blood group',
  email: 'Email',
  address: 'Address',
  status: 'Status',
  referred_by: 'Referred by',
  emergency_contact_name: 'Emergency contact name',
  emergency_contact_relation: 'Relation',
  emergency_contact_phone: 'Emergency contact phone',
  id_proof_type: 'ID proof type',
  id_proof_number: 'ID proof number',
  medical_history: 'Medical history',
  allergies: 'Allergies',
  current_medications: 'Current medications',
}

/** Sort keys the list endpoint accepts, mapped to their columns. */
export const PATIENT_SORTS = {
  patient_id: 'patient_id',
  name: 'name',
  date_of_join: 'date_of_join',
  created_at: 'created_at',
} as const

export type PatientSort = keyof typeof PATIENT_SORTS
