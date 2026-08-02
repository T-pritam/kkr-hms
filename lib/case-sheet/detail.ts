/**
 * Assembles case sheets with their doctors, medication and attachments.
 *
 * Fetched as explicit steps rather than one nested PostgREST select, matching
 * `lib/lab/order-detail.ts`: the four `*_by` columns all point at `users`, and
 * a single embed cannot resolve the same foreign table four different ways
 * without hint syntax that is easy to get subtly wrong.
 *
 * One shared loader for both the list and the single-record view, so the tab
 * and the PDF can never disagree about what a case sheet contains.
 */

import type {
  CaseSheet,
  CaseSheetAttachment,
  CaseSheetDoctor,
  CaseSheetMedication,
} from './types'

/** Minimal shape of the Supabase client methods used here. */
type Client = { from: (table: string) => any }

async function attach(supabase: Client, sheets: any[]): Promise<CaseSheet[]> {
  if (sheets.length === 0) return []

  const sheetIds = sheets.map(s => s.id)

  const [doctorsRes, medsRes, attachmentsRes] = await Promise.all([
    supabase
      .from('case_sheet_doctors')
      .select('*')
      .in('case_sheet_id', sheetIds)
      .order('display_order', { ascending: true }),
    supabase
      .from('case_sheet_medications')
      .select('*')
      .in('case_sheet_id', sheetIds)
      .order('display_order', { ascending: true }),
    supabase
      .from('case_sheet_attachments')
      .select('*')
      .in('case_sheet_id', sheetIds)
      .order('display_order', { ascending: true }),
  ])

  if (doctorsRes.error) throw doctorsRes.error
  if (medsRes.error) throw medsRes.error
  if (attachmentsRes.error) throw attachmentsRes.error

  const doctors: any[] = doctorsRes.data || []
  const medications: any[] = medsRes.data || []
  const attachments: any[] = attachmentsRes.data || []

  // ── People ─────────────────────────────────────────────────────────────────
  // One batched lookup rather than a join per attribution column.
  const userIds = [...new Set([
    ...sheets.flatMap(s => [s.created_by, s.updated_by, s.finalised_by]),
    ...attachments.map(a => a.uploaded_by),
  ].filter(Boolean))]

  const userNames = new Map<string, string>()
  if (userIds.length > 0) {
    const { data } = await supabase.from('users').select('id, username').in('id', userIds)
    for (const u of data || []) userNames.set(u.id, u.username)
  }

  const nameOf = (id: string | null | undefined) => (id ? userNames.get(id) ?? null : null)

  return sheets.map(sheet => ({
    ...sheet,
    created_by_name:   nameOf(sheet.created_by),
    updated_by_name:   nameOf(sheet.updated_by),
    finalised_by_name: nameOf(sheet.finalised_by),

    doctors: doctors
      .filter(d => d.case_sheet_id === sheet.id)
      .map((d): CaseSheetDoctor => ({
        id: d.id,
        doctor_id: d.doctor_id,
        doctor_name: d.doctor_name,
        doctor_specialist: d.doctor_specialist,
        display_order: d.display_order,
      })),

    medications: medications
      .filter(m => m.case_sheet_id === sheet.id)
      .map((m): CaseSheetMedication => ({
        id: m.id,
        medicine_id: m.medicine_id,
        medicine_name: m.medicine_name,
        dosage: m.dosage,
        quantity: m.quantity,
        usage: m.usage,
        display_order: m.display_order,
      })),

    attachments: attachments
      .filter(a => a.case_sheet_id === sheet.id)
      .map((a): CaseSheetAttachment => ({
        id: a.id,
        file_url: a.file_url,
        file_key: a.file_key,
        filename: a.filename,
        size_bytes: a.size_bytes,
        uploaded_by: a.uploaded_by,
        uploaded_by_name: nameOf(a.uploaded_by),
        uploaded_at: a.uploaded_at,
        display_order: a.display_order,
      })),
  })) as CaseSheet[]
}

/** Every case sheet for one patient, newest first. */
export async function loadCaseSheets(supabase: Client, patientId: string): Promise<CaseSheet[]> {
  const { data, error } = await supabase
    .from('patient_case_sheets')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return attach(supabase, data || [])
}

/**
 * One case sheet, or null when it does not exist.
 *
 * `patientId` is required and filtered on, not decorative: without it a valid
 * case sheet id from one patient would load through another patient's URL.
 */
export async function loadCaseSheet(
  supabase: Client,
  patientId: string,
  caseSheetId: string,
): Promise<CaseSheet | null> {
  const { data, error } = await supabase
    .from('patient_case_sheets')
    .select('*')
    .eq('id', caseSheetId)
    .eq('patient_id', patientId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const [sheet] = await attach(supabase, [data])
  return sheet ?? null
}
