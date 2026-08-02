/**
 * lib/format/currency — the one money formatter.
 *
 * There were four, and they disagreed. Three used
 * `toLocaleString('en-IN', { maximumFractionDigits: 2 })`, which sets a maximum
 * and no minimum and therefore drops trailing zeros — the only thing in the app
 * that can render a fifth of a rupee as the bare `-0.2` a user reported, next
 * to figures printed by `toFixed(2)` as `-0.20`.
 *
 * The rule under test is simply: two decimals, always.
 */

import { describe, it, expect } from 'vitest'
import { amountCell, inr, percentOf, toAmount } from '@/lib/format/currency'

describe('toAmount', () => {
  it.each([
    ['a number', 1250, 1250],
    ['a numeric string, as Postgres numerics arrive', '1250.50', 1250.5],
    ['a string with no decimals', '1000', 1000],
    ['a negative', -0.2, -0.2],
  ])('coerces %s', (_label, input, expected) => {
    expect(toAmount(input)).toBe(expected)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['nonsense', 'not a number'],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['an object', {}],
  ])('falls back to 0 for %s', (_label, input) => {
    expect(toAmount(input)).toBe(0)
  })
})

describe('inr', () => {
  it('always prints two decimals', () => {
    expect(inr(1250)).toBe('₹1,250.00')
    expect(inr(1250.5)).toBe('₹1,250.50')
    expect(inr(0)).toBe('₹0.00')
  })

  it('groups digits the Indian way', () => {
    expect(inr(125000)).toBe('₹1,25,000.00')
    expect(inr(10000000)).toBe('₹1,00,00,000.00')
  })

  /** The reported symptom, and the reason this module exists. */
  it('never emits the bare -0.2 shape', () => {
    expect(inr(-0.2)).toBe('-₹0.20')
    expect(inr(-0.2)).not.toContain('-0.2')
    expect(inr(-0.2).endsWith('0.20')).toBe(true)
  })

  it('puts the sign outside the symbol', () => {
    // "-₹0.20", not "₹-0.20".
    expect(inr(-1250)).toBe('-₹1,250.00')
  })

  it('clamps when asked, for totals that cannot meaningfully be negative', () => {
    expect(inr(-0.2, { clamp: true })).toBe('₹0.00')
    expect(inr(-99999, { clamp: true })).toBe('₹0.00')
    // A positive value is untouched by the clamp.
    expect(inr(1250, { clamp: true })).toBe('₹1,250.00')
  })

  it('leaves genuinely signed figures signed when not clamped', () => {
    expect(inr(-500)).toBe('-₹500.00')
  })

  it('drops the symbol on request', () => {
    expect(inr(1250, { bare: true })).toBe('1,250.00')
    expect(inr(-1250, { bare: true })).toBe('-1,250.00')
  })

  it('handles a string amount, since numerics can arrive as strings', () => {
    expect(inr('25000.00')).toBe('₹25,000.00')
  })

  it.each([null, undefined, '', 'nonsense'])('prints ₹0.00 rather than NaN for %s', (input) => {
    expect(inr(input)).toBe('₹0.00')
  })

  it('rounds to the nearest paisa', () => {
    expect(inr(1250.005)).toBe('₹1,250.01')
    expect(inr(1250.004)).toBe('₹1,250.00')
  })
})

describe('amountCell', () => {
  it('is a plain two-decimal string, with no symbol or grouping', () => {
    expect(amountCell(125000)).toBe('125000.00')
    expect(amountCell('1250.5')).toBe('1250.50')
  })

  it('is 0.00 rather than empty for a missing value', () => {
    expect(amountCell(null)).toBe('0.00')
  })
})

describe('percentOf', () => {
  it('reports the share', () => {
    expect(percentOf(5000, 20000)).toBe(25)
  })

  /** A zero base salary must not produce Infinity on the advance log. */
  it.each([
    ['zero', 0],
    ['null', null],
    ['a negative base', -100],
  ])('returns null when the whole is %s', (_label, whole) => {
    expect(percentOf(5000, whole)).toBeNull()
  })

  it('can exceed 100 — drawing more than the salary is exactly what to flag', () => {
    expect(percentOf(30000, 20000)).toBe(150)
  })
})
