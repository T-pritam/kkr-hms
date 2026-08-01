/** Shared shapes for the lab module. Mirrors the columns in supabase/migrations. */

export type ParamType = 'numeric' | 'qualitative' | 'calculated'
export type RangeType = 'between' | 'less_than' | 'greater_than' | 'text'

/**
 * The marker printed next to an abnormal result.
 *   H = above the reference interval
 *   L = below the reference interval
 *   A = abnormal qualitative result (e.g. Positive when Negative is expected)
 * null = within the interval.
 */
export type Abnormal = 'H' | 'L' | 'A' | null

export interface TestParameter {
  id: string
  test_id: string
  name: string
  code: string | null
  unit: string | null
  param_type: ParamType
  method: string | null
  /** Qualitative picklist. */
  options: string[] | null
  /** Calculated parameters only, e.g. `{ALB}/({TP}-{ALB})`. */
  formula: string | null
  decimals: number
  /** Optional sub-heading printed above this parameter on the report. */
  group_name: string | null
  display_order: number
  is_active: boolean

  // Legacy columns, still read as a fallback when no test_parameter_ranges rows
  // exist for the parameter.
  min_value: number | null
  max_value: number | null
  gender_specific: boolean | null
  male_min: number | null
  male_max: number | null
  female_min: number | null
  female_max: number | null
}

export interface ParameterRange {
  id: string
  parameter_id: string
  /** null applies to any gender. */
  gender: string | null
  /** Inclusive lower bound in years; null = unbounded. */
  age_min_years: number | null
  /** Exclusive upper bound in years; null = unbounded. */
  age_max_years: number | null
  range_type: RangeType
  min_value: number | null
  max_value: number | null
  text_range: string | null
  display_text: string | null
  normal_options: string[] | null
  critical_low: number | null
  critical_high: number | null
  display_order: number
}

export interface ResolvedRange {
  refMin: number | null
  refMax: number | null
  /** What the report prints, e.g. '13.0 - 17.0', '< 200', 'Negative'. */
  display: string
  rangeType: RangeType
  criticalLow: number | null
  criticalHigh: number | null
  normalOptions: string[] | null
}

export interface PatientContext {
  /** Age in years. null when unknown — only age-unbounded intervals then apply. */
  ageYears: number | null
  gender: string | null
}

export interface ResultInput {
  value?: number | null
  textValue?: string | null
}

export interface AbnormalVerdict {
  abnormal: Abnormal
  isCritical: boolean
}
