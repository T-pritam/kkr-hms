/**
 * Lab catalogue vocabularies.
 *
 * These lists were previously copy-pasted into create-lab-test-modal.tsx,
 * edit-lab-test-modal.tsx and app/lab/tests/page.tsx, which is why the category
 * filter on the catalogue page silently disagreed with the create form.
 */

import type { ParamType, RangeType } from './types'

export const TEST_CATEGORIES = [
  'Biochemistry',
  'Hematology',
  'Endocrinology',
  'Clinical Pathology',
  'Microbiology',
  'Serology',
  'Immunology',
] as const

export const SAMPLE_TYPES = [
  'Blood',
  'Whole Blood (EDTA)',
  'Serum',
  'Plasma',
  'Urine',
  'Stool',
  'Saliva',
  'Swab',
  'Other',
] as const

export const ORDER_PRIORITIES = ['routine', 'urgent'] as const
export type OrderPriority = (typeof ORDER_PRIORITIES)[number]

export const PRIORITY_LABELS: Record<OrderPriority, string> = {
  routine: 'Routine',
  urgent:  'Urgent',
}

export const PARAM_TYPE_LABELS: Record<ParamType, string> = {
  numeric:     'Numeric',
  qualitative: 'Qualitative (picklist)',
  calculated:  'Calculated (formula)',
}

export const RANGE_TYPE_LABELS: Record<RangeType, string> = {
  between:      'Between (min - max)',
  less_than:    'Less than (< max)',
  greater_than: 'Greater than (> min)',
  text:         'Text / qualitative',
}

/** Starting points offered in the qualitative options editor. */
export const COMMON_QUALITATIVE_OPTIONS: Record<string, string[]> = {
  'Negative / Positive':          ['Negative', 'Positive'],
  'Absent / Present':             ['Absent', 'Present'],
  'Non-Reactive / Reactive':      ['Non-Reactive', 'Reactive'],
  'Nil / Trace / 1+ / 2+ / 3+':   ['Nil', 'Trace', '1+', '2+', '3+'],
  'Normal / Abnormal':            ['Normal', 'Abnormal'],
}

/** Legend printed under the results table when any value is out of range. */
export const ABNORMAL_LEGEND = 'H = above reference interval    L = below reference interval'
