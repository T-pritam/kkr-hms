/**
 * Resolving a patient's age.
 *
 * `patient.age` was read in three places — the detail header, the info tab and
 * the discharge summary PDF — and no such column ever existed, so all three
 * printed nothing. A patient's age is on the cover of the document they take
 * home; it cannot be blank.
 *
 * There are two ways the hospital knows an age and they are not equivalent:
 *
 *   date_of_birth  exact, and stays exact forever.
 *   age_years      what the patient said at the desk, which most people give
 *                  instead of a birth date. Paired with `age_recorded_on` so it
 *                  can be carried forward rather than freezing at whatever it
 *                  was on registration day.
 *
 * A stated age is deliberately *not* turned into a date of birth. Writing "45"
 * back as 1981-01-01 invents a fact, and that invented date would then print on
 * a clinical document as though someone had checked it.
 */

export interface AgeSubject {
  date_of_birth?: string | null
  age_years?: number | null
  age_recorded_on?: string | null
}

export interface ResolvedAge {
  years: number
  /** `dob` is exact; `stated` was given by the patient and carried forward. */
  source: 'dob' | 'stated'
}

const parseDate = (value: string | null | undefined): Date | null => {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

/** Whole years between two dates, counting the birthday itself. */
function completedYears(from: Date, to: Date): number {
  let years = to.getUTCFullYear() - from.getUTCFullYear()

  const monthDiff = to.getUTCMonth() - from.getUTCMonth()
  if (monthDiff < 0 || (monthDiff === 0 && to.getUTCDate() < from.getUTCDate())) {
    years -= 1
  }

  return years
}

/**
 * The patient's age today, or null when neither a birth date nor a stated age
 * was recorded. `now` is injectable so tests are not at the mercy of the clock.
 */
export function resolveAge(patient: AgeSubject | null | undefined, now = new Date()): ResolvedAge | null {
  if (!patient) return null

  const dob = parseDate(patient.date_of_birth)
  if (dob) {
    const years = completedYears(dob, now)
    // A birth date in the future is data entry gone wrong, not a negative age.
    return years >= 0 ? { years, source: 'dob' } : null
  }

  const stated = patient.age_years
  if (stated === null || stated === undefined || !Number.isFinite(stated)) return null

  const recorded = parseDate(patient.age_recorded_on)
  const elapsed = recorded ? Math.max(0, completedYears(recorded, now)) : 0

  return { years: Math.round(stated) + elapsed, source: 'stated' }
}

/**
 * Age for display. `42` when exact, `~42` when carried forward from a stated
 * age, so nobody mistakes an approximation for a verified date of birth.
 */
export function formatAge(patient: AgeSubject | null | undefined, now = new Date()): string {
  const age = resolveAge(patient, now)
  if (!age) return ''
  return age.source === 'dob' ? String(age.years) : `~${age.years}`
}

/** "42 / Male", the form the discharge summary and lab report cover pages use. */
export function formatAgeSex(
  patient: (AgeSubject & { gender?: string | null }) | null | undefined,
  now = new Date(),
): string {
  const age = formatAge(patient, now)
  const sex = patient?.gender?.trim() || ''

  if (age && sex) return `${age} / ${sex}`
  return age || sex
}
