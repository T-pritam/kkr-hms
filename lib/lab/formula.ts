/**
 * Evaluator for calculated parameters — A/G Ratio, LDL by Friedewald, MCH,
 * MCHC and friends.
 *
 * Formulas reference other parameters of the same test by their `code`, wrapped
 * in braces:
 *
 *     {ALB} / ({TP} - {ALB})              A/G Ratio
 *     {CHOL} - {HDL} - ({TG} / 5)         LDL, Friedewald
 *     ({HB} / {RBC}) * 10                 MCH
 *
 * Deliberately NOT `eval` or `new Function`: formulas are authored through the
 * test-master UI and stored in the database, so executing them as JavaScript
 * would turn the catalogue editor into arbitrary code execution on every
 * viewer's browser. This is a hand-written recursive-descent parser over a
 * grammar that admits only numbers, references and `+ - * / ( )`.
 */

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ref'; code: string }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }

class FormulaError extends Error {}

function tokenize(formula: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < formula.length) {
    const ch = formula[i]

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue }

    if (ch === '(') { tokens.push({ kind: 'lparen' }); i++; continue }
    if (ch === ')') { tokens.push({ kind: 'rparen' }); i++; continue }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ kind: 'op', value: ch })
      i++
      continue
    }

    if (ch === '{') {
      const end = formula.indexOf('}', i)
      if (end === -1) throw new FormulaError('Unclosed { in formula')
      const code = formula.slice(i + 1, end).trim()
      if (!code) throw new FormulaError('Empty parameter reference')
      tokens.push({ kind: 'ref', code: code.toUpperCase() })
      i = end + 1
      continue
    }

    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let j = i
      while (j < formula.length && ((formula[j] >= '0' && formula[j] <= '9') || formula[j] === '.')) j++
      const raw = formula.slice(i, j)
      const value = Number(raw)
      if (!isFinite(value)) throw new FormulaError(`Invalid number "${raw}"`)
      tokens.push({ kind: 'num', value })
      i = j
      continue
    }

    throw new FormulaError(`Unexpected character "${ch}" in formula`)
  }

  return tokens
}

/**
 * expr   := term (('+' | '-') term)*
 * term   := factor (('*' | '/') factor)*
 * factor := ('+' | '-')? primary
 * primary:= number | ref | '(' expr ')'
 */
function parse(tokens: Token[], lookup: (code: string) => number | null): number | null {
  let pos = 0
  let missing = false

  const peek = () => tokens[pos]

  function primary(): number {
    const t = peek()
    if (!t) throw new FormulaError('Unexpected end of formula')

    if (t.kind === 'num') { pos++; return t.value }

    if (t.kind === 'ref') {
      pos++
      const v = lookup(t.code)
      if (v === null || v === undefined || !isFinite(v)) { missing = true; return 0 }
      return v
    }

    if (t.kind === 'lparen') {
      pos++
      const v = expr()
      const close = peek()
      if (!close || close.kind !== 'rparen') throw new FormulaError('Missing )')
      pos++
      return v
    }

    throw new FormulaError('Expected a number, reference or (')
  }

  function factor(): number {
    const t = peek()
    if (t && t.kind === 'op' && (t.value === '+' || t.value === '-')) {
      pos++
      const v = factor()
      return t.value === '-' ? -v : v
    }
    return primary()
  }

  function term(): number {
    let v = factor()
    for (;;) {
      const t = peek()
      if (!t || t.kind !== 'op' || (t.value !== '*' && t.value !== '/')) break
      pos++
      const rhs = factor()
      if (t.value === '/') {
        if (rhs === 0) { missing = true; return 0 }
        v = v / rhs
      } else {
        v = v * rhs
      }
    }
    return v
  }

  function expr(): number {
    let v = term()
    for (;;) {
      const t = peek()
      if (!t || t.kind !== 'op' || (t.value !== '+' && t.value !== '-')) break
      pos++
      const rhs = term()
      v = t.value === '+' ? v + rhs : v - rhs
    }
    return v
  }

  const result = expr()
  if (pos !== tokens.length) throw new FormulaError('Trailing characters in formula')
  if (missing) return null
  return isFinite(result) ? result : null
}

/** The parameter codes a formula depends on, uppercased and de-duplicated. */
export function extractFormulaRefs(formula: string | null | undefined): string[] {
  if (!formula) return []
  const out = new Set<string>()
  const re = /\{([^}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(formula)) !== null) {
    const code = m[1].trim().toUpperCase()
    if (code) out.add(code)
  }
  return [...out]
}

/** True when the formula parses. Use to validate input in the test-master UI. */
export function isValidFormula(formula: string | null | undefined): boolean {
  if (!formula || !formula.trim()) return false
  try {
    parse(tokenize(formula), () => 1)
    return true
  } catch {
    return false
  }
}

/**
 * Evaluates a formula.
 *
 * Returns null — rather than throwing or producing a misleading number — when a
 * referenced parameter is blank or the expression divides by zero. A partially
 * filled panel must not print a bogus derived value.
 *
 * Throws FormulaError only when the formula itself is malformed.
 */
export function evaluateFormula(
  formula: string | null | undefined,
  values: Record<string, number | null | undefined>,
): number | null {
  if (!formula || !formula.trim()) return null

  const upper: Record<string, number | null | undefined> = {}
  for (const [k, v] of Object.entries(values)) upper[k.trim().toUpperCase()] = v

  return parse(tokenize(formula), code => {
    const v = upper[code]
    return v === null || v === undefined ? null : Number(v)
  })
}

interface CalculableParameter {
  id: string
  code: string | null
  param_type: string
  formula: string | null
}

/**
 * Resolves every calculated parameter in a test, keyed by parameter id.
 *
 * Calculated parameters may reference other calculated parameters, so this
 * iterates to a fixed point. The pass limit also breaks reference cycles, which
 * simply leave the affected parameters null.
 */
export function computeCalculated(
  parameters: CalculableParameter[],
  enteredByParamId: Record<string, number | null | undefined>,
): Record<string, number | null> {
  const byCode: Record<string, number | null | undefined> = {}
  for (const p of parameters) {
    if (p.code) byCode[p.code.trim().toUpperCase()] = enteredByParamId[p.id]
  }

  const calculated = parameters.filter(p => p.param_type === 'calculated' && p.formula)
  const out: Record<string, number | null> = {}
  for (const p of calculated) out[p.id] = null

  for (let pass = 0; pass < calculated.length + 1; pass++) {
    let changed = false

    for (const p of calculated) {
      if (out[p.id] !== null) continue
      let v: number | null
      try {
        v = evaluateFormula(p.formula, byCode)
      } catch {
        v = null   // malformed formula: leave blank rather than break entry
      }
      if (v !== null) {
        out[p.id] = v
        if (p.code) byCode[p.code.trim().toUpperCase()] = v
        changed = true
      }
    }

    if (!changed) break
  }

  return out
}
