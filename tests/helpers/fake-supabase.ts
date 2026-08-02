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
        store[index] = { ...store[index], ...clone(this.payload[0]) }
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
 * Database functions the routes call through `supabase.rpc(...)`.
 * `next_lab_order_no` mirrors the real one: a per-year counter row bumped
 * atomically, formatted as LAB/<year>/<5 digits>.
 */
const RPCS: Record<string, (db: FakeDb, args: Record<string, unknown>) => unknown> = {
  next_lab_order_no: (db) => {
    const year = new Date().getFullYear()
    const existing = db.find('lab_order_counters', (r) => r.year === year)
    if (existing) {
      existing.last_no = (existing.last_no as number) + 1
      return `LAB/${year}/${String(existing.last_no).padStart(5, '0')}`
    }
    db.seed('lab_order_counters', { year, last_no: 1 })
    return `LAB/${year}/00001`
  },

  // Mirrors next_discharge_summary_no(): DS/<year>/<5 digits>.
  next_discharge_summary_no: (db) => {
    const year = new Date().getFullYear()
    const existing = db.find('case_sheet_counters', (r) => r.year === year)
    if (existing) {
      existing.last_no = (existing.last_no as number) + 1
      return `DS/${year}/${String(existing.last_no).padStart(5, '0')}`
    }
    db.seed('case_sheet_counters', { year, last_no: 1 })
    return `DS/${year}/00001`
  },
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
      return { data: impl(db, args), error: null }
    },
    auth: {
      getUser: async () => ({ data: { user: db.getAuthUser() }, error: null }),
    },
  }
}

/** The single database instance shared by a test file; cleared between tests. */
export const db = new FakeDb()
