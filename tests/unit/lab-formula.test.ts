/**
 * lib/lab/formula.ts — calculated parameters.
 *
 * Formulas are authored in the test-master UI and stored in the database, so
 * they are untrusted input rendered in every viewer's browser. The parser must
 * therefore reject anything that is not arithmetic, and must refuse to produce
 * a number when its inputs are incomplete.
 */

import { describe, it, expect } from 'vitest'
import {
  evaluateFormula,
  extractFormulaRefs,
  isValidFormula,
  computeCalculated,
} from '@/lib/lab/formula'

describe('evaluateFormula — arithmetic', () => {
  it('computes A/G Ratio', () => {
    // Albumin / (Total Protein - Albumin)
    expect(evaluateFormula('{ALB} / ({TP} - {ALB})', { ALB: 4, TP: 7 })).toBeCloseTo(1.3333, 4)
  })

  it('computes LDL by the Friedewald equation', () => {
    expect(evaluateFormula('{CHOL} - {HDL} - ({TG} / 5)', { CHOL: 200, HDL: 50, TG: 150 })).toBe(120)
  })

  it('respects operator precedence and parentheses', () => {
    expect(evaluateFormula('2 + 3 * 4', {})).toBe(14)
    expect(evaluateFormula('(2 + 3) * 4', {})).toBe(20)
  })

  it('handles unary minus and decimals', () => {
    expect(evaluateFormula('-{A} + 1.5', { A: 0.5 })).toBe(1)
  })

  it('is case-insensitive about reference codes', () => {
    expect(evaluateFormula('{hb} * 2', { HB: 7 })).toBe(14)
    expect(evaluateFormula('{HB} * 2', { hb: 7 })).toBe(14)
  })
})

describe('evaluateFormula — refuses to produce a misleading number', () => {
  it('returns null when a referenced parameter is blank', () => {
    expect(evaluateFormula('{ALB} / {TP}', { ALB: 4, TP: null })).toBeNull()
    expect(evaluateFormula('{ALB} / {TP}', { ALB: 4 })).toBeNull()
  })

  it('returns null on division by zero rather than Infinity', () => {
    expect(evaluateFormula('{ALB} / ({TP} - {ALB})', { ALB: 4, TP: 4 })).toBeNull()
  })

  it('returns null for an empty formula', () => {
    expect(evaluateFormula('', {})).toBeNull()
    expect(evaluateFormula(null, {})).toBeNull()
  })
})

describe('evaluateFormula — rejects anything that is not arithmetic', () => {
  it.each([
    'process.exit(1)',
    'fetch("http://evil")',
    '{A}; alert(1)',
    'globalThis["x"]',
    '{A} ** 2',
    '1 + ',
    '(1 + 2',
    '{A} {B}',
    '{}',
  ])('throws on %s', (bad) => {
    expect(() => evaluateFormula(bad, { A: 1, B: 2 })).toThrow()
  })

  it('reports malformed formulas through isValidFormula without throwing', () => {
    expect(isValidFormula('{A} + {B}')).toBe(true)
    expect(isValidFormula('alert(1)')).toBe(false)
    expect(isValidFormula('')).toBe(false)
  })
})

describe('extractFormulaRefs', () => {
  it('lists the codes a formula depends on, uppercased and de-duplicated', () => {
    expect(extractFormulaRefs('{ALB} / ({tp} - {ALB})').sort()).toEqual(['ALB', 'TP'])
    expect(extractFormulaRefs(null)).toEqual([])
  })
})

describe('computeCalculated', () => {
  const params = [
    { id: 'p-alb',  code: 'ALB',  param_type: 'numeric',    formula: null },
    { id: 'p-tp',   code: 'TP',   param_type: 'numeric',    formula: null },
    { id: 'p-glob', code: 'GLOB', param_type: 'calculated', formula: '{TP} - {ALB}' },
    { id: 'p-ag',   code: 'AG',   param_type: 'calculated', formula: '{ALB} / {GLOB}' },
  ]

  it('resolves a chain of calculated parameters', () => {
    const out = computeCalculated(params, { 'p-alb': 4, 'p-tp': 7 })
    expect(out['p-glob']).toBe(3)
    expect(out['p-ag']).toBeCloseTo(1.3333, 4)
  })

  it('leaves everything downstream null when an input is missing', () => {
    const out = computeCalculated(params, { 'p-alb': 4 })
    expect(out['p-glob']).toBeNull()
    expect(out['p-ag']).toBeNull()
  })

  it('does not hang on a reference cycle', () => {
    const cyclic = [
      { id: 'a', code: 'A', param_type: 'calculated', formula: '{B} + 1' },
      { id: 'b', code: 'B', param_type: 'calculated', formula: '{A} + 1' },
    ]
    expect(computeCalculated(cyclic, {})).toEqual({ a: null, b: null })
  })

  it('leaves a malformed formula blank instead of breaking the whole entry', () => {
    const broken = [
      { id: 'x', code: 'X', param_type: 'numeric',    formula: null },
      { id: 'y', code: 'Y', param_type: 'calculated', formula: 'alert(1)' },
      { id: 'z', code: 'Z', param_type: 'calculated', formula: '{X} * 2' },
    ]
    const out = computeCalculated(broken, { x: 5 })
    expect(out['y']).toBeNull()
    expect(out['z']).toBe(10)
  })
})
