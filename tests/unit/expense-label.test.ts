/**
 * lib/format/expense — how a catch-all expense is written for a reader.
 *
 * The case that matters most is the empty one. Every 'Miscellaneous' row that
 * predates the detail column has nothing to qualify it, and rendering those as
 * `misc - ()` would make old-but-valid data look corrupt across four screens at
 * once. The other is that these feed jsPDF, whose `doc.text()` throws on a
 * non-string — so `null` in must never become `undefined` out.
 */

import { describe, it, expect } from 'vitest'
import { expenseTypeLabel, ledgerExpenseCategoryLabel } from '@/lib/format/expense'
import { EXPENSE_TYPES } from '@/lib/finances/constants'

describe('expenseTypeLabel', () => {
  it('returns a non-catch-all type verbatim', () => {
    expect(expenseTypeLabel('Electric Bill', null)).toBe('Electric Bill')
  })

  it('ignores a detail on a type that does not take one', () => {
    expect(expenseTypeLabel('Oxygen Supply', 'should not show')).toBe('Oxygen Supply')
  })

  it('writes Miscellaneous with its detail', () => {
    expect(expenseTypeLabel('Miscellaneous', 'Broken window pane'))
      .toBe('misc - (Broken window pane)')
  })

  it.each([null, undefined, '', '   '])(
    'renders a legacy Miscellaneous row with detail %p as plain text, never "misc - ()"',
    (detail) => {
      expect(expenseTypeLabel('Miscellaneous', detail)).toBe('Miscellaneous')
    },
  )

  it('trims the detail', () => {
    expect(expenseTypeLabel('Miscellaneous', '  Auto fare  ')).toBe('misc - (Auto fare)')
  })

  it.each([null, undefined, '', '  '])('is empty for a blank type %p', (type) => {
    expect(expenseTypeLabel(type, 'anything')).toBe('')
  })

  it('every allow-listed type renders as a non-empty string', () => {
    for (const type of EXPENSE_TYPES) {
      const out = expenseTypeLabel(type, null)
      expect(typeof out).toBe('string')
      expect(out.length).toBeGreaterThan(0)
    }
  })

  describe('the PDF cap', () => {
    it('leaves a short label alone', () => {
      expect(expenseTypeLabel('Electric Bill', null, { max: 35 })).toBe('Electric Bill')
    })

    it('truncates from the right, so the "misc - (" marker always survives', () => {
      const out = expenseTypeLabel('Miscellaneous', 'x'.repeat(60), { max: 35 })
      expect(out).toHaveLength(35)
      expect(out.startsWith('misc - (')).toBe(true)
      expect(out.endsWith('…')).toBe(true)
    })

    it('truncates a long plain type too', () => {
      expect(expenseTypeLabel('Medical Equipment Maintenance', null, { max: 10 }))
        .toBe('Medical E…')
    })
  })

  it('always returns a string, whatever it is handed', () => {
    for (const junk of [null, undefined, 0, 42, {}, []]) {
      expect(typeof expenseTypeLabel(junk, junk)).toBe('string')
    }
  })
})

describe('ledgerExpenseCategoryLabel', () => {
  it.each([
    ['supplies', 'Medical Supplies'],
    ['utilities', 'Utilities & Rent'],
    ['maintenance', 'Maintenance'],
    ['staff', 'Staff Bonus'],
    ['other', 'Other'],
  ])('maps %s to its label', (category, expected) => {
    expect(ledgerExpenseCategoryLabel(category, null)).toBe(expected)
  })

  it('writes other with its detail', () => {
    expect(ledgerExpenseCategoryLabel('other', 'Diwali sweets')).toBe('other - (Diwali sweets)')
  })

  it.each([null, undefined, '', '   '])(
    'falls back to the plain label when other has detail %p',
    (detail) => {
      expect(ledgerExpenseCategoryLabel('other', detail)).toBe('Other')
    },
  )

  /** Rows written before the allow-list existed should still be legible. */
  it('falls through to the raw value for an unknown category', () => {
    expect(ledgerExpenseCategoryLabel('legacy_thing', null)).toBe('legacy_thing')
  })

  it.each([null, undefined, ''])('is empty for a blank category %p', (category) => {
    expect(ledgerExpenseCategoryLabel(category, 'anything')).toBe('')
  })

  it('always returns a string', () => {
    for (const junk of [null, undefined, 0, {}, []]) {
      expect(typeof ledgerExpenseCategoryLabel(junk, junk)).toBe('string')
    }
  })
})
