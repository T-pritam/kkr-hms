/**
 * An in-memory stand-in for the Supabase PostgREST client.
 *
 * Route handlers are exercised against this instead of the real database, so the
 * suite runs offline, deterministically, and without touching live data.
 *
 * Supported surface (everything the app actually calls):
 *   .from(t).select(cols, { count }) .insert() .update() .upsert(v, { onConflict }) .delete()
 *   filters: .eq .neq .gt .gte .lt .lte .in .is .not .ilike .or
 *   modifiers: .order .range .limit .single .maybeSingle
 *   embedded resources: `alias:table(cols)`, `table!fk_column(cols)`,
 *                       `alias:table!constraint_fkey(cols)`, bare `table (cols)`, nested
 *   .auth.getUser()
 *
 * Deliberate fidelity choices, so tests fail for the same reasons production would:
 *   - `.single()` on 0 or >1 rows yields PostgREST error code PGRST116; several
 *     route handlers branch on exactly that code.
 *   - `.eq(col, null)` matches nothing (PostgREST `col=eq.null`), which is what makes
 *     the odd `.eq('token_hash', null)` call in the change-password route a no-op.
 *   - ORDER BY uses Postgres null placement: NULLS LAST ascending, NULLS FIRST descending.
 *   - `count: 'exact'` counts matching rows *before* `.range()`/`.limit()` are applied.
 *   - references to columns the real schema does not have fail, using the live column
 *     list in ./schema.ts. `doctor_visit_settlements.total_amount` is a plain nullable
 *     column — it is neither generated nor maintained by a trigger in the real database,
 *     which the tests rely on to expose stale-total bugs.
 *
 * Known fidelity limit — `RPCS`:
 *   The database functions below are re-implemented in TypeScript, not executed. Tests
 *   against them verify the *contract* the routes depend on — the shape of the result and
 *   the error code each refusal raises — never the SQL itself. Two things they therefore
 *   cannot catch: a divergence between this implementation and the migration, and the
 *   concurrency guarantees the real functions get from `pg_advisory_xact_lock` and the
 *   partial unique index. Verify those against a real project after changing a function.
 */

import { randomUUID } from 'node:crypto'
import { SCHEMA, isKnownColumn } from './schema'

export type Row = Record<string, any>

export interface PostgrestError {
  message: string
  code?: string
  details?: string
  hint?: string
}

/** PostgREST's "expected exactly one row" error. */
const pgrst116 = (rowCount: number): PostgrestError => ({
  code: 'PGRST116',
  message: 'JSON object requested, multiple (or no) rows returned',
  details: `The result contains ${rowCount} rows`,
  hint: undefined,
})

/**
 * Embedded-resource relationships that can't be derived from the table name alone.
 * Everything else falls back to the `<singular>_id` convention (doctors -> doctor_id).
 */
const RELATIONSHIPS: Record<string, { localKey?: string; foreignKey?: string; many?: boolean }> = {
  'patient_test_results.lab_tests': { localKey: 'test_id' },
  'test_result_values.test_parameters': { localKey: 'parameter_id' },
  'test_result_values.patient_test_results': { localKey: 'result_id' },
  'patient_test_results.test_result_values': { foreignKey: 'result_id', many: true },
  'lab_tests.test_parameters': { foreignKey: 'test_id', many: true },

  // Lab order model
  'lab_orders.lab_order_items': { foreignKey: 'order_id', many: true },
  'lab_order_items.lab_orders': { localKey: 'order_id' },
  'lab_order_items.lab_tests': { localKey: 'test_id' },
  'lab_order_items.lab_result_values': { foreignKey: 'order_item_id', many: true },
  'lab_result_values.lab_order_items': { localKey: 'order_item_id' },
  'lab_result_values.test_parameters': { localKey: 'parameter_id' },
  'lab_orders.doctors': { localKey: 'referring_doctor_id' },
  'test_parameters.test_parameter_ranges': { foreignKey: 'parameter_id', many: true },
  'test_parameter_ranges.test_parameters': { localKey: 'parameter_id' },

  // Case sheet / discharge summary
  'patient_case_sheets.case_sheet_doctors': { foreignKey: 'case_sheet_id', many: true },
  'patient_case_sheets.case_sheet_medications': { foreignKey: 'case_sheet_id', many: true },
  'patient_case_sheets.case_sheet_attachments': { foreignKey: 'case_sheet_id', many: true },
  'case_sheet_doctors.patient_case_sheets': { localKey: 'case_sheet_id' },
  'case_sheet_medications.patient_case_sheets': { localKey: 'case_sheet_id' },
  'case_sheet_attachments.patient_case_sheets': { localKey: 'case_sheet_id' },
  'case_sheet_doctors.doctors': { localKey: 'doctor_id' },
  'case_sheet_medications.medicines': { localKey: 'medicine_id' },

  // Patient registry
  'patients.referrals': { localKey: 'referred_by' },

  // Payroll
  'advances.employees': { localKey: 'employee_id' },
  'salary_payments.employees': { localKey: 'employee_id' },
}

/**
 * Unique indexes worth modelling.
 *
 * Not every constraint in the database is here — only the ones a route relies
 * on to reject a write. `patients.patient_id` is the reason this exists: the
 * route no longer does a check-then-insert (which raced) and instead lets the
 * index reject the duplicate and maps 23505 to a 409. Without the constraint
 * here, that branch would be untestable.
 */
const UNIQUE_INDEXES: Record<string, string[][]> = {
  patients: [['patient_id']],
  employees: [['employee_code']],
}

/** Postgres's error for a duplicate key, which routes match on by code. */
function uniqueViolation(
  table: string,
  store: Row[],
  candidate: Row,
  ignore?: Row,
): PostgrestError | null {
  for (const columns of UNIQUE_INDEXES[table] ?? []) {
    // NULLs are distinct in a Postgres unique index.
    if (columns.some((c) => candidate[c] === null || candidate[c] === undefined)) continue

    const clash = store.some(
      (row) => row !== ignore && columns.every((c) => looseEquals(row[c], candidate[c])),
    )

    if (clash) {
      return {
        code: '23505',
        message: `duplicate key value violates unique constraint "${table}_${columns.join('_')}_key"`,
        details: `Key (${columns.join(', ')})=(${columns.map((c) => candidate[c]).join(', ')}) already exists.`,
        hint: undefined,
      }
    }
  }

  return null
}

/**
 * PostgREST's errors for a column the schema does not have. Validated against
 * tests/helpers/schema.ts, which is dumped from the live database.
 */
const undefinedColumn = (table: string, column: string): PostgrestError => ({
  code: '42703',
  message: `column ${table}.${column} does not exist`,
  details: null as unknown as string,
  hint: undefined,
})

const missingColumnInCache = (table: string, column: string): PostgrestError => ({
  code: 'PGRST204',
  message: `Could not find the '${column}' column of '${table}' in the schema cache`,
  details: null as unknown as string,
  hint: undefined,
})

const singular = (table: string) => (table.endsWith('s') ? table.slice(0, -1) : table)

const clone = <T>(value: T): T =>
  value === null || value === undefined ? value : (structuredClone(value) as T)

function isNumeric(value: any): boolean {
  return value !== null && value !== '' && !Number.isNaN(Number(value))
}

/** Compare two scalars the way Postgres would for the given column values. */
function compare(a: any, b: any): number {
  if (isNumeric(a) && isNumeric(b)) return Number(a) - Number(b)
  return String(a).localeCompare(String(b))
}

function looseEquals(a: any, b: any): boolean {
  if (a === null || a === undefined) return false // `col=eq.null` matches nothing
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return String(a) === String(b)
  }
  if (isNumeric(a) && isNumeric(b)) return Number(a) === Number(b)
  return String(a) === String(b)
}

function ilikeMatches(value: any, pattern: string): boolean {
  if (value === null || value === undefined) return false
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')
  return new RegExp(`^${escaped}$`, 'i').test(String(value))
}

/** Split on commas that are not nested inside parentheses. */
function splitTopLevel(input: string, separator = ','): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of input) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === separator && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) parts.push(current)
  return parts.map((p) => p.trim()).filter(Boolean)
}

/**
 * Narrow a row to the columns named in the select string, the way PostgREST does.
 * `*` keeps everything; embedded resources are attached separately by the caller.
 */
function pickColumns(row: Row, fields: SelectField[]): Row {
  if (!fields.length || fields.some((field) => field.name === '*' && !field.embedded)) {
    return clone(row)
  }
  const picked: Row = {}
  for (const field of fields) {
    if (field.embedded) continue
    picked[field.alias ?? field.name] = clone(row[field.name])
  }
  return picked
}

interface Filter {
  type: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is' | 'ilike' | 'or' | 'not'
  column?: string
  value?: any
  negatedOp?: string
}

interface SelectField {
  name: string
  alias?: string
  embedded?: { table: string; hint?: string; fields: SelectField[] }
}

/** Parse a PostgREST select string into a field tree. */
function parseSelect(select: string): SelectField[] {
  return splitTopLevel(select.replace(/\s*\n\s*/g, ' ')).map((part) => {
    const parenIndex = part.indexOf('(')
    if (parenIndex === -1) {
      const [name, alias] = part.includes(':') ? part.split(':').reverse() : [part, undefined]
      return { name: name.trim(), alias: alias?.trim() }
    }

    const head = part.slice(0, parenIndex).trim()
    const inner = part.slice(parenIndex + 1, part.lastIndexOf(')'))

    let alias: string | undefined
    let target = head
    if (head.includes(':')) {
      const [left, right] = head.split(':')
      alias = left.trim()
      target = right.trim()
    }

    let hint: string | undefined
    if (target.includes('!')) {
      const [tableName, fkHint] = target.split('!')
      target = tableName.trim()
      hint = fkHint.trim()
    }

    return {
      name: target,
      alias: alias ?? target,
      embedded: { table: target, hint, fields: parseSelect(inner) },
    }
  })
}

/**
 * Work out which column links a parent row to an embedded resource.
 * Handles `!column`, `!constraint_name_fkey`, the RELATIONSHIPS registry,
 * and finally the `<singular>_id` convention.
 */
function resolveJoin(
  parentTable: string,
  embeddedTable: string,
  hint: string | undefined,
  parentRow: Row
): { localKey?: string; foreignKey?: string; many: boolean } {
  if (hint) {
    // `users!created_by` -> local column `created_by`
    if (hint in parentRow) return { localKey: hint, many: false }
    // `users!patient_test_results_reference_doctor_id_fkey` -> local column `reference_doctor_id`
    if (hint.endsWith('_fkey')) {
      const column = hint.replace(new RegExp(`^${parentTable}_`), '').replace(/_fkey$/, '')
      if (column in parentRow) return { localKey: column, many: false }
    }
  }

  const registered = RELATIONSHIPS[`${parentTable}.${embeddedTable}`]
  if (registered) {
    return {
      localKey: registered.localKey,
      foreignKey: registered.foreignKey,
      many: registered.many ?? false,
    }
  }

  const conventional = `${singular(embeddedTable)}_id`
  if (conventional in parentRow) return { localKey: conventional, many: false }

  return { foreignKey: `${singular(parentTable)}_id`, many: true }
}

export class FakeDb {
  private tables = new Map<string, Row[]>()
  private failures = new Map<string, PostgrestError[]>()
  private authUser: Row | null = null

  /** Insert fixture rows. Missing `id`/`created_at` are filled in like the DB would. */
  seed(table: string, rows: Row | Row[]): Row[] {
    const list = Array.isArray(rows) ? rows : [rows]
    // Loud failure rather than a silent bad fixture: a test that seeds a column the real
    // table does not have would be asserting against a database that cannot exist.
    if (SCHEMA[table]) {
      for (const row of list) {
        for (const column of Object.keys(row)) {
          if (!isKnownColumn(table, column)) {
            throw new Error(
              `Fixture error: "${table}" has no column "${column}". ` +
                `Valid columns: ${SCHEMA[table].join(', ')}`
            )
          }
        }
      }
    }
    const stored = this.tables.get(table) ?? []
    const created = list.map((row) => this.withDefaults(table, row))
    stored.push(...created)
    this.tables.set(table, stored)
    return clone(created)
  }

  /** Current contents of a table — for asserting on what a handler actually wrote. */
  rows(table: string): Row[] {
    return clone(this.tables.get(table) ?? [])
  }

  /** Convenience: the single row matching a predicate. */
  find(table: string, predicate: (row: Row) => boolean): Row | undefined {
    return clone((this.tables.get(table) ?? []).find(predicate))
  }

  /**
   * Merge a patch into the stored row, in place.
   *
   * `find` hands back a clone, so mutating its result changes nothing. The
   * counter RPCs below need a real write — a sequence that hands out the same
   * number twice is not a sequence.
   */
  patchRow(table: string, predicate: (row: Row) => boolean, patch: Row): Row | undefined {
    const row = (this.tables.get(table) ?? []).find(predicate)
    if (!row) return undefined
    Object.assign(row, patch)
    return clone(row)
  }

  count(table: string): number {
    return (this.tables.get(table) ?? []).length
  }

  reset(): void {
    this.tables.clear()
    this.failures.clear()
    this.authUser = null
  }

  /** Make the next query against `table` return an error — drives the 500 branches. */
  failNext(table: string, error: PostgrestError = { message: 'database exploded', code: 'XX000' }): void {
    const queue = this.failures.get(table) ?? []
    queue.push(error)
    this.failures.set(table, queue)
  }

  setAuthUser(user: Row | null): void {
    this.authUser = user
  }

  /** @internal */
  takeFailure(table: string): PostgrestError | undefined {
    const queue = this.failures.get(table)
    if (!queue?.length) return undefined
    return queue.shift()
  }

  /** @internal */
  raw(table: string): Row[] {
    let rows = this.tables.get(table)
    if (!rows) {
      rows = []
      this.tables.set(table, rows)
    }
    return rows
  }

  /** @internal */
  withDefaults(table: string, row: Row): Row {
    const withIds: Row = {
      id: row.id ?? randomUUID(),
      created_at: row.created_at ?? new Date().toISOString(),
      ...row,
    }
    withIds.id = row.id ?? withIds.id
    withIds.created_at = row.created_at ?? withIds.created_at
    return withIds
  }

  /** @internal */
  getAuthUser(): Row | null {
    return this.authUser
  }
}

type Operation = 'select' | 'insert' | 'update' | 'upsert' | 'delete'

class QueryBuilder implements PromiseLike<any> {
  private filters: Filter[] = []
  private orders: Array<{ column: string; ascending: boolean }> = []
  private selectString = '*'
  private wantsCount = false
  private returnsRows = true
  private rangeBounds?: [number, number]
  private limitRows?: number
  private rowMode: 'many' | 'single' | 'maybeSingle' = 'many'
  private payload: Row[] = []
  private conflictKeys: string[] = []

  constructor(
    private db: FakeDb,
    private table: string,
    private operation: Operation = 'select'
  ) {}

  select(columns = '*', options?: { count?: string }): this {
    this.selectString = columns || '*'
    this.wantsCount = options?.count === 'exact'
    if (this.operation !== 'select') this.returnsRows = true
    return this
  }

  insert(values: Row | Row[]): this {
    this.operation = 'insert'
    this.payload = Array.isArray(values) ? values : [values]
    this.returnsRows = false
    return this
  }

  update(values: Row): this {
    this.operation = 'update'
    this.payload = [values]
    this.returnsRows = false
    return this
  }

  upsert(values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
    this.operation = 'upsert'
    this.payload = Array.isArray(values) ? values : [values]
    this.conflictKeys = options?.onConflict?.split(',').map((k) => k.trim()) ?? ['id']
    this.returnsRows = false
    return this
  }

  delete(): this {
    this.operation = 'delete'
    this.returnsRows = false
    return this
  }

  eq(column: string, value: any): this {
    this.filters.push({ type: 'eq', column, value })
    return this
  }
  neq(column: string, value: any): this {
    this.filters.push({ type: 'neq', column, value })
    return this
  }
  gt(column: string, value: any): this {
    this.filters.push({ type: 'gt', column, value })
    return this
  }
  gte(column: string, value: any): this {
    this.filters.push({ type: 'gte', column, value })
    return this
  }
  lt(column: string, value: any): this {
    this.filters.push({ type: 'lt', column, value })
    return this
  }
  lte(column: string, value: any): this {
    this.filters.push({ type: 'lte', column, value })
    return this
  }
  in(column: string, values: any[]): this {
    this.filters.push({ type: 'in', column, value: values })
    return this
  }
  is(column: string, value: any): this {
    this.filters.push({ type: 'is', column, value })
    return this
  }
  ilike(column: string, pattern: string): this {
    this.filters.push({ type: 'ilike', column, value: pattern })
    return this
  }
  or(expression: string): this {
    this.filters.push({ type: 'or', value: expression })
    return this
  }
  not(column: string, operator: string, value: any): this {
    this.filters.push({ type: 'not', column, negatedOp: operator, value })
    return this
  }

  order(column: string, options?: { ascending?: boolean; foreignTable?: string; referencedTable?: string }): this {
    // Ordering *within* an embedded resource doesn't change the parent row order.
    // Both spellings occur: `.order('x', { foreignTable })` and `.order('table(x)')`.
    if (options?.foreignTable || options?.referencedTable || column.includes('(')) return this
    this.orders.push({ column, ascending: options?.ascending ?? true })
    return this
  }

  range(from: number, to: number): this {
    this.rangeBounds = [from, to]
    return this
  }

  limit(count: number): this {
    this.limitRows = count
    return this
  }

  single(): this {
    this.rowMode = 'single'
    this.returnsRows = true
    return this
  }

  maybeSingle(): this {
    this.rowMode = 'maybeSingle'
    this.returnsRows = true
    return this
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected)
  }

  private matches(row: Row, filter: Filter): boolean {
    const { type, column, value } = filter
    const cell = column ? row[column] : undefined

    switch (type) {
      case 'eq':
        return looseEquals(cell, value)
      case 'neq':
        return !looseEquals(cell, value)
      case 'gt':
        return cell !== null && cell !== undefined && compare(cell, value) > 0
      case 'gte':
        return cell !== null && cell !== undefined && compare(cell, value) >= 0
      case 'lt':
        return cell !== null && cell !== undefined && compare(cell, value) < 0
      case 'lte':
        return cell !== null && cell !== undefined && compare(cell, value) <= 0
      case 'in':
        return (value as any[]).some((candidate) => looseEquals(cell, candidate))
      case 'is':
        if (value === null) return cell === null || cell === undefined
        return String(cell) === String(value)
      case 'ilike':
        return ilikeMatches(cell, value)
      case 'not':
        return !this.matches(row, { type: filter.negatedOp as Filter['type'], column, value })
      case 'or':
        return splitTopLevel(String(value)).some((term) => {
          const firstDot = term.indexOf('.')
          const secondDot = term.indexOf('.', firstDot + 1)
          if (firstDot === -1 || secondDot === -1) return false
          const orColumn = term.slice(0, firstDot)
          const orOp = term.slice(firstDot + 1, secondDot)
          const orValue = term.slice(secondDot + 1)
          return this.matches(row, {
            type: orOp as Filter['type'],
            column: orColumn,
            value: orValue === 'null' ? null : orValue,
          })
        })
      default:
        return true
    }
  }

  private applyFilters(rows: Row[]): Row[] {
    return rows.filter((row) => this.filters.every((filter) => this.matches(row, filter)))
  }

  private applyOrder(rows: Row[]): Row[] {
    if (!this.orders.length) return rows
    return [...rows].sort((left, right) => {
      for (const { column, ascending } of this.orders) {
        const a = left[column]
        const b = right[column]
        const aNull = a === null || a === undefined
        const bNull = b === null || b === undefined
        if (aNull && bNull) continue
        // Postgres: NULLS LAST ascending, NULLS FIRST descending.
        if (aNull) return ascending ? 1 : -1
        if (bNull) return ascending ? -1 : 1
        const result = compare(a, b)
        if (result !== 0) return ascending ? result : -result
      }
      return 0
    })
  }

  /** Attach embedded resources described by the select string. */
  private project(rows: Row[]): Row[] {
    const fields = parseSelect(this.selectString)
    const embeds = fields.filter((f) => f.embedded)

    return rows.map((row) => {
      const projected: Row = pickColumns(row, fields)
      for (const field of embeds) {
        const { table, hint, fields: innerFields } = field.embedded!
        const join = resolveJoin(this.table, table, hint, row)
        const targetRows = this.db.raw(table)

        if (join.many) {
          const children = targetRows.filter((child) => looseEquals(child[join.foreignKey!], row.id))
          projected[field.alias!] = children.map((child) =>
            this.projectNested(table, child, innerFields)
          )
        } else {
          const foreignId = row[join.localKey!]
          const child =
            foreignId === null || foreignId === undefined
              ? undefined
              : targetRows.find((candidate) => looseEquals(candidate.id, foreignId))
          projected[field.alias!] = child ? this.projectNested(table, child, innerFields) : null
        }
      }
      return projected
    })
  }

  private projectNested(table: string, row: Row, fields: SelectField[]): Row {
    const result: Row = pickColumns(row, fields)
    for (const field of fields) {
      if (!field.embedded) continue
      const { table: innerTable, hint, fields: innerFields } = field.embedded
      const join = resolveJoin(table, innerTable, hint, row)
      const targetRows = this.db.raw(innerTable)
      if (join.many) {
        result[field.alias!] = targetRows
          .filter((child) => looseEquals(child[join.foreignKey!], row.id))
          .map((child) => this.projectNested(innerTable, child, innerFields))
      } else {
        const foreignId = row[join.localKey!]
        const child =
          foreignId === null || foreignId === undefined
            ? undefined
            : targetRows.find((candidate) => looseEquals(candidate.id, foreignId))
        result[field.alias!] = child ? this.projectNested(innerTable, child, innerFields) : null
      }
    }
    return result
  }

  private finish(rows: Row[], count: number | null) {
    if (this.rowMode === 'single') {
      if (rows.length !== 1) return { data: null, error: pgrst116(rows.length), count, status: 406 }
      return { data: rows[0], error: null, count, status: 200 }
    }
    if (this.rowMode === 'maybeSingle') {
      if (rows.length > 1) return { data: null, error: pgrst116(rows.length), count, status: 406 }
      return { data: rows[0] ?? null, error: null, count, status: 200 }
    }
    return { data: rows, error: null, count, status: 200 }
  }

  /**
   * Reject references to columns the real table does not have, the way PostgREST does.
   * This is what catches a handler that has drifted away from the schema.
   */
  private validateAgainstSchema(): PostgrestError | null {
    if (!SCHEMA[this.table]) return null

    const isWrite = this.operation !== 'select' && this.operation !== 'delete'
    if (isWrite) {
      for (const value of this.payload) {
        for (const column of Object.keys(value)) {
          if (!isKnownColumn(this.table, column)) return missingColumnInCache(this.table, column)
        }
      }
    }

    for (const filter of this.filters) {
      if (filter.column && !isKnownColumn(this.table, filter.column)) {
        return undefinedColumn(this.table, filter.column)
      }
      if (filter.type === 'or') {
        for (const term of splitTopLevel(String(filter.value))) {
          const column = term.slice(0, term.indexOf('.'))
          if (column && !isKnownColumn(this.table, column)) return undefinedColumn(this.table, column)
        }
      }
    }

    for (const { column } of this.orders) {
      if (!isKnownColumn(this.table, column)) return undefinedColumn(this.table, column)
    }

    // Selected columns are only meaningful when rows come back.
    if (this.returnsRows || this.operation === 'select') {
      for (const field of parseSelect(this.selectString)) {
        if (field.embedded || field.name === '*') continue
        if (!isKnownColumn(this.table, field.name)) return undefinedColumn(this.table, field.name)
      }
    }

    return null
  }

  private execute() {
    const failure = this.db.takeFailure(this.table)
    if (failure) return { data: null, error: failure, count: null, status: 500 }

    const schemaError = this.validateAgainstSchema()
    if (schemaError) return { data: null, error: schemaError, count: null, status: 400 }

    const store = this.db.raw(this.table)

    if (this.operation === 'insert' || this.operation === 'upsert') {
      const written: Row[] = []
      for (const value of this.payload) {
        const existingIndex =
          this.operation === 'upsert'
            ? store.findIndex((row) => this.conflictKeys.every((key) => looseEquals(row[key], value[key])))
            : -1

        if (existingIndex >= 0) {
          store[existingIndex] = { ...store[existingIndex], ...clone(value) }
          written.push(store[existingIndex])
        } else {
          const conflict = uniqueViolation(this.table, store, value)
          if (conflict) return { data: null, error: conflict, count: null, status: 409 }

          const created = this.db.withDefaults(this.table, clone(value))
          store.push(created)
          written.push(created)
        }
      }
      if (!this.returnsRows) return { data: null, error: null, count: null, status: 201 }
      return this.finish(this.project(written), null)
    }

    if (this.operation === 'update') {
      const targets = this.applyFilters(store)
      const updated: Row[] = []
      for (const target of targets) {
        const index = store.indexOf(target)
        const merged = { ...store[index], ...clone(this.payload[0]) }

        const conflict = uniqueViolation(this.table, store, merged, target)
        if (conflict) return { data: null, error: conflict, count: null, status: 409 }

        store[index] = merged
        updated.push(store[index])
      }
      if (!this.returnsRows) return { data: null, error: null, count: null, status: 204 }
      return this.finish(this.project(updated), null)
    }

    if (this.operation === 'delete') {
      const targets = this.applyFilters(store)
      for (const target of targets) {
        const index = store.indexOf(target)
        if (index >= 0) store.splice(index, 1)
      }
      if (!this.returnsRows) return { data: null, error: null, count: null, status: 204 }
      return this.finish(this.project(targets), null)
    }

    // select
    const filtered = this.applyFilters(store)
    const count = this.wantsCount ? filtered.length : null
    let rows = this.applyOrder(filtered)
    if (this.rangeBounds) rows = rows.slice(this.rangeBounds[0], this.rangeBounds[1] + 1)
    if (this.limitRows !== undefined) rows = rows.slice(0, this.limitRows)
    return this.finish(this.project(rows), count)
  }
}

export interface FakeSupabaseClient {
  from(table: string): QueryBuilder
  rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: PostgrestError | null }>
  auth: { getUser(): Promise<{ data: { user: Row | null }; error: null }> }
}

/**
 * Bump a per-year counter row and return the new value.
 *
 * The real functions do this inside a single `INSERT ... ON CONFLICT DO UPDATE
 * ... RETURNING`, which takes a row lock. Here it just has to persist: an
 * earlier version incremented the clone `find()` returns, so two calls in one
 * test handed back the same number — the exact failure these counters exist to
 * prevent.
 */
function bumpCounter(db: FakeDb, table: string, year: number): number {
  const existing = db.find(table, (r) => r.year === year)
  if (!existing) {
    db.seed(table, { year, last_no: 1 })
    return 1
  }

  const next = (existing.last_no as number) + 1
  db.patchRow(table, (r) => r.year === year, { last_no: next })
  return next
}

const peekCounter = (db: FakeDb, table: string, year: number): number =>
  ((db.find(table, (r) => r.year === year)?.last_no as number) ?? 0) + 1

/**
 * A function raising a custom SQLSTATE, surfaced the way PostgREST would.
 *
 * The ledger close functions signal every refusal through an error code rather
 * than message text, so the routes can map them without string matching. Raising
 * the same codes here is what makes that mapping genuinely tested.
 */
class RpcError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

const num = (value: unknown): number => Number(value ?? 0)

/** Rows of a table, deterministically ordered by a numeric or string key. */
function sortedBy<T extends Row>(rows: T[], key: string, direction: 'asc' | 'desc' = 'asc'): T[] {
  return [...rows].sort((a, b) => {
    const l = a[key] as any
    const r = b[key] as any
    if (l === r) return 0
    return (l < r ? -1 : 1) * (direction === 'asc' ? 1 : -1)
  })
}

const activeClosureFor = (db: FakeDb, date: string): Row | undefined =>
  db.find('daily_ledger_closures', (r) => r.closure_date === date && r.status === 'active')

const todayISO = () => new Date().toISOString().slice(0, 10)

/**
 * The totals close_ledger_day and the shift settlement both need.
 *
 * Kept in one place so the closure and the per-operator settlement cannot drift
 * into disagreeing about what the same rows add up to.
 */
function totalsFor(rows: Row[]) {
  const sum = (predicate: (r: Row) => boolean) =>
    rows.filter(predicate).reduce((acc, r) => acc + num(r.amount), 0)

  const credit = (mode: string) =>
    sum((r) => r.transaction_type === 'credit' && r.payment_mode === mode)

  const totalCredits = sum((r) => r.transaction_type === 'credit')
  const totalDebits = sum((r) => r.transaction_type === 'debit')

  return {
    total_credits: totalCredits,
    total_debits: totalDebits,
    net_balance: totalCredits - totalDebits,
    cash: credit('cash'),
    upi: credit('upi'),
    card: credit('card'),
    bank_transfer: credit('bank_transfer'),
    cheque: credit('cheque'),
    debits_cash: sum((r) => r.transaction_type === 'debit' && r.payment_mode === 'cash'),
    transaction_count: rows.length,
    credit_count: rows.filter((r) => r.transaction_type === 'credit').length,
    debit_count: rows.filter((r) => r.transaction_type === 'debit').length,
    unverified_count: rows.filter((r) => r.status !== 'verified').length,
  }
}

/** Database functions the routes call through `supabase.rpc(...)`. */
const RPCS: Record<string, (db: FakeDb, args: Record<string, unknown>) => unknown> = {
  // LAB/<year>/<5 digits>.
  next_lab_order_no: (db) => {
    const year = new Date().getFullYear()
    return `LAB/${year}/${String(bumpCounter(db, 'lab_order_counters', year)).padStart(5, '0')}`
  },

  // DS/<year>/<5 digits>.
  next_discharge_summary_no: (db) => {
    const year = new Date().getFullYear()
    return `DS/${year}/${String(bumpCounter(db, 'case_sheet_counters', year)).padStart(5, '0')}`
  },

  // <serial>/<2-digit year>, restarting each year. This one *consumes* a number;
  // peek_next_patient_id does not, and that difference is what stops two
  // receptionists registering at the same moment from both getting 5/26.
  next_patient_id: (db) => {
    const year = new Date().getFullYear()
    const yy = String(year % 100).padStart(2, '0')
    return `${bumpCounter(db, 'patient_counters', year)}/${yy}`
  },

  peek_next_patient_id: (db) => {
    const year = new Date().getFullYear()
    const yy = String(year % 100).padStart(2, '0')
    return `${peekCounter(db, 'patient_counters', year)}/${yy}`
  },

  // EMP/<2-digit year>/<3 digits>. Same consume-vs-peek split as the patient ID.
  next_employee_code: (db) => {
    const year = new Date().getFullYear()
    const yy = String(year % 100).padStart(2, '0')
    const next = bumpCounter(db, 'employee_counters', year)
    return `EMP/${yy}/${String(next).padStart(3, '0')}`
  },

  peek_next_employee_code: (db) => {
    const year = new Date().getFullYear()
    const yy = String(year % 100).padStart(2, '0')
    const next = peekCounter(db, 'employee_counters', year)
    return `EMP/${yy}/${String(next).padStart(3, '0')}`
  },

  // Closes a date by writing one closure row. Deliberately never touches
  // daily_ledger_transactions — the lock belongs to the date, not to each entry.
  close_ledger_day: (db, args) => {
    const date = args.p_closure_date as string
    const closedBy = (args.p_closed_by as string) ?? null
    const notes = ((args.p_notes as string) ?? '').trim() || null

    if (date > todayISO()) {
      throw new RpcError('LC003', 'closure date is in the future')
    }

    if (activeClosureFor(db, date)) {
      throw new RpcError('LC001', 'this date has already been closed')
    }

    const rows = db.rows('daily_ledger_transactions').filter((r) => r.transaction_date === date)
    const prior = sortedBy(
      db.rows('daily_ledger_closures').filter((r) => r.closure_date === date),
      'version',
      'desc'
    )[0]

    // An empty day has nothing to reconcile — unless we are re-closing after a
    // reopen that removed the last entry, where refusing would strand the date.
    if (rows.length === 0 && !prior) {
      throw new RpcError('LC002', 'no transactions found for this date')
    }

    const previous = sortedBy(
      db.rows('daily_ledger_closures').filter((r) => r.status === 'active' && (r.closure_date as string) < date),
      'closure_date',
      'desc'
    )[0]

    // Derived, never supplied by the caller: each day starts where the last finished.
    const opening = num(previous?.closing_balance)
    const openingCash = num(previous?.closing_cash_balance)
    const t = totalsFor(rows)

    return db.seed('daily_ledger_closures', {
      closure_date: date,
      status: 'active',
      version: num(prior?.version) + 1,
      supersedes_id: prior?.id ?? null,
      total_credits: t.total_credits,
      total_debits: t.total_debits,
      net_balance: t.net_balance,
      total_credits_cash: t.cash,
      total_credits_upi: t.upi,
      total_credits_card: t.card,
      total_credits_bank_transfer: t.bank_transfer,
      total_credits_cheque: t.cheque,
      total_credits_other: t.bank_transfer + t.cheque,
      total_debits_cash: t.debits_cash,
      transaction_count: t.transaction_count,
      credit_count: t.credit_count,
      debit_count: t.debit_count,
      unverified_count: t.unverified_count,
      opening_balance: opening,
      closing_balance: opening + t.net_balance,
      closing_cash_balance: openingCash + t.cash - t.debits_cash,
      closed_at: new Date().toISOString(),
      closed_by: closedBy,
      reopened_at: null,
      reopened_by: null,
      reopen_reason: null,
      notes,
    })[0]
  },

  // Supersedes the active closure. Never deletes: the superseded row keeps the
  // totals that were reported at the time, plus who reopened it and why.
  reopen_ledger_day: (db, args) => {
    const date = args.p_closure_date as string
    const reason = ((args.p_reason as string) ?? '').trim()

    if (reason.length < 10) {
      throw new RpcError('LC005', 'a reason of at least 10 characters is required to reopen a closed day')
    }

    const patched = db.patchRow(
      'daily_ledger_closures',
      (r) => r.closure_date === date && r.status === 'active',
      {
        status: 'superseded',
        reopened_at: new Date().toISOString(),
        reopened_by: (args.p_reopened_by as string) ?? null,
        reopen_reason: reason,
      }
    )

    if (!patched) {
      throw new RpcError('LC004', 'this date is not currently closed')
    }

    return patched
  },

  // Every date carrying activity with no active closure, oldest first.
  ledger_open_days: (db, args) => {
    const limit = num(args.p_limit ?? 50)
    const includeToday = Boolean(args.p_include_today)
    const today = todayISO()

    const byDate = new Map<string, Row[]>()
    for (const row of db.rows('daily_ledger_transactions')) {
      const date = row.transaction_date as string
      if (activeClosureFor(db, date)) continue
      if (!includeToday && date >= today) continue
      byDate.set(date, [...(byDate.get(date) ?? []), row])
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(0, limit)
      .map(([date, rows]) => {
        const t = totalsFor(rows)
        // A date that was closed and reopened must not look like one nobody has
        // ever closed — the worklist reads very differently for the two.
        const superseded = sortedBy(
          db.rows('daily_ledger_closures').filter(
            (r) => r.closure_date === date && r.status === 'superseded'
          ),
          'version',
          'desc'
        )[0]

        return {
          date,
          transaction_count: t.transaction_count,
          credit_count: t.credit_count,
          debit_count: t.debit_count,
          total_credits: t.total_credits,
          total_debits: t.total_debits,
          net_balance: t.net_balance,
          cash_credits: t.cash,
          unverified_count: t.unverified_count,
          reopened: Boolean(superseded),
          last_reopened_at: superseded?.reopened_at ?? null,
          last_reopen_reason: superseded?.reopen_reason ?? null,
        }
      })
  },

  ledger_closure_continuity: (db, args) =>
    db.rows('daily_ledger_closures').filter(
      (r) => r.status === 'active' && (r.closure_date as string) > (args.p_from as string)
    ).length,
}

export function createFakeClient(db: FakeDb): FakeSupabaseClient {
  return {
    from: (table: string) => new QueryBuilder(db, table),
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      const impl = RPCS[fn]
      if (!impl) {
        return {
          data: null,
          error: {
            code: '42883',
            message: `function public.${fn}() does not exist`,
            details: null as unknown as string,
            hint: undefined,
          } as PostgrestError,
        }
      }
      // `db.failNext('close_ledger_day')` drives the routes' RPC error branches.
      // Keyed by function name, since an RPC touches no single table.
      const injected = db.takeFailure(fn)
      if (injected) {
        return { data: null, error: injected }
      }

      try {
        return { data: impl(db, args), error: null }
      } catch (error) {
        if (error instanceof RpcError) {
          return {
            data: null,
            error: {
              code: error.code,
              message: error.message,
              details: null as unknown as string,
              hint: undefined,
            } as PostgrestError,
          }
        }
        throw error
      }
    },
    auth: {
      getUser: async () => ({ data: { user: db.getAuthUser() }, error: null }),
    },
  }
}

/** The single database instance shared by a test file; cleared between tests. */
export const db = new FakeDb()
