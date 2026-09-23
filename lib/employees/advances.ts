/**
 * Salary advances, including the ones the desk pays (PRD v2, CR-03).
 *
 * The client: *"Add an Employee Advance section to the receptionist view so
 * receptionists can pay advances to employees. Receptionists must NOT see other
 * employee details such as salary, present days, or remaining amount to settle.
 * Advance details must show which user gave the advance."*
 *
 * Three things follow.
 *
 * **Reception sees people, not payroll.** Code, name and designation, and the
 * advances themselves. Base salary, present days, the calculated or final
 * salary and the remaining allowance are removed from the *response*, not
 * hidden in the page — a redacted screen backed by a full API is not privacy
 * (AC-03.1).
 *
 * **The cap still applies, but reception is not told the number.** How much is
 * left of someone's salary is exactly the figure they must not see, so the
 * refusal reads "more than this employee's remaining limit — ask an admin", and
 * the admin gets the figures (Q-16 = A).
 *
 * **An advance the desk pays comes out of petty cash** (CR-02), so the two are
 * written together and stay together: edit the advance and the debit follows;
 * delete it and the debit goes. It is never a ledger entry — the ledger is the
 * hospital's money, and this is the float (Q-07 = A).
 *
 * This module also closes BUGS #55: `POST /api/employees/advances` never
 * applied the cap that `POST /api/employees/[id]/salary/advances` did. One cap,
 * one place, both routes.
 */

import { canModify, type Actor } from '@/lib/authz/ownership'
import { recordAdvanceDebit } from '@/lib/petty-cash/entries'
import { isAdvanceAmountValid, validateSalaryAdvance } from '@/lib/salary-advance-validation'

type Db = { from: (table: string) => any }

export type Refusal = {
  ok: false
  status: number
  error: string
  code?: string
  fieldErrors?: Record<string, string>
}

/** Payroll figures nobody at the desk may see, in a response or on a screen. */
const PAYROLL_FIELDS = [
  'base_salary',
  'calculated_salary',
  'final_salary',
  'total_advance',
  'days_present',
  'total_working_days',
  'ot_days',
  'remaining_amount',
  'max_allowed_advance',
] as const

/** Reception may pay an advance without seeing what anyone earns. */
export const seesPayroll = (role: string): boolean => role === 'ADMIN' || role === 'DOCTOR'

/**
 * Strip payroll figures from anything heading to a browser, one level deep and
 * inside an embedded `employee`. Admin and doctor get the object untouched.
 */
export function redactPayroll<T>(value: T, role: string): T {
  if (seesPayroll(role)) return value

  const strip = (row: any): any => {
    if (!row || typeof row !== 'object') return row
    if (Array.isArray(row)) return row.map(strip)

    const copy: any = { ...row }
    for (const field of PAYROLL_FIELDS) delete copy[field]
    if (copy.employee) copy.employee = strip(copy.employee)
    return copy
  }

  return strip(value) as T
}

/**
 * Is this advance allowed?
 *
 * The rule itself is lib/salary-advance-validation.ts, unchanged. What is new
 * is that both routes ask, and that the answer is phrased for whoever asked.
 */
export async function assertAdvanceAllowed(
  db: Db,
  args: { employeeId: string; monthYear: string; amount: number; role: string },
): Promise<{ ok: true } | Refusal> {
  const { data: employee } = await db
    .from('employees')
    .select('id, base_salary')
    .eq('id', args.employeeId)
    .maybeSingle()

  if (!employee) return { ok: false, status: 404, error: 'Employee not found' }

  const { data: salaryRecord } = await db
    .from('salary_payments')
    .select('id, calculated_salary, total_advance, status, base_salary')
    .eq('employee_id', args.employeeId)
    .eq('month_year', args.monthYear)
    .maybeSingle()

  if (salaryRecord?.status === 'settled') {
    return {
      ok: false,
      status: 400,
      error: 'That salary month is settled, so no more advances can be added to it',
      code: 'MONTH_SETTLED',
    }
  }

  const { data: existing } = await db
    .from('advances')
    .select('amount')
    .eq('employee_id', args.employeeId)
    .eq('month_year', args.monthYear)

  const salaryData = {
    baseSalary: parseFloat(String(salaryRecord?.base_salary ?? employee.base_salary ?? 0)) || 0,
    salaryRecord: salaryRecord
      ? {
          calculated_salary: parseFloat(String(salaryRecord.calculated_salary ?? 0)),
          total_advance: parseFloat(String(salaryRecord.total_advance ?? 0)),
          status: salaryRecord.status || 'pending',
          settled_on: null,
        }
      : null,
    currentAdvances: existing || [],
  }

  const allowed = validateSalaryAdvance(salaryData)
  if (!allowed.isAllowed) {
    return { ok: false, status: 400, error: generic(allowed.reason, args.role), code: 'OVER_LIMIT' }
  }

  const amountCheck = isAdvanceAmountValid(salaryData, args.amount)
  if (!amountCheck.valid) {
    return { ok: false, status: 400, error: generic(amountCheck.reason, args.role), code: 'OVER_LIMIT' }
  }

  return { ok: true }
}

/**
 * The refusal, with the figures removed for anyone who may not see them —
 * "₹4,000 of ₹12,000 remaining" tells the desk the salary either way (Q-16 = A).
 */
function generic(reason: string | undefined, role: string): string {
  if (seesPayroll(role)) return reason || 'Cannot add an advance at this time'
  return 'That is more than this employee is allowed right now. Ask an admin.'
}

/** Keep `salary_payments` in step: re-sum rather than increment (G-?). */
export async function resumAdvances(
  db: Db,
  args: { employeeId: string; monthYear: string; userId: string },
): Promise<void> {
  const { data: salaryRecord } = await db
    .from('salary_payments')
    .select('id, calculated_salary')
    .eq('employee_id', args.employeeId)
    .eq('month_year', args.monthYear)
    .maybeSingle()

  if (!salaryRecord) return

  const { data: all } = await db
    .from('advances')
    .select('amount')
    .eq('employee_id', args.employeeId)
    .eq('month_year', args.monthYear)

  const total = (all ?? []).reduce((sum: number, row: any) => sum + (parseFloat(String(row.amount)) || 0), 0)

  await db
    .from('salary_payments')
    .update({
      total_advance: total,
      final_salary: (parseFloat(String(salaryRecord.calculated_salary ?? 0)) || 0) - total,
      updated_by: args.userId,
    })
    .eq('id', salaryRecord.id)
}

export interface AdvanceValues {
  employee_id: string
  amount: number
  date_given: string
  month_year: string
  remarks: string | null
  given_by: string | null
}

/**
 * Record an advance, and — when the desk pays it — the petty cash debit that
 * paid it.
 *
 * If the debit cannot be written the advance is removed again: an advance the
 * float does not show is exactly the disagreement petty cash exists to prevent.
 */
export async function recordAdvance(
  db: Db,
  actor: Actor,
  values: AdvanceValues,
  options: { fromPettyCash: boolean; employeeName: string },
): Promise<{ ok: true; advance: any; pettyCashEntry: any | null } | Refusal> {
  const { data: advance, error } = await db
    .from('advances')
    .insert({
      employee_id: values.employee_id,
      amount: values.amount,
      date_given: values.date_given,
      month_year: values.month_year,
      remarks: values.remarks,
      // Legacy free text; who gave it is `created_by` now (Q-15 = A).
      given_by: values.given_by,
      created_by: actor.id,
      updated_by: actor.id,
    })
    .select('*')
    .single()

  if (error) throw error

  let pettyCashEntry = null
  if (options.fromPettyCash) {
    const debit = await recordAdvanceDebit(db, actor, {
      advanceId: advance.id,
      amount: values.amount,
      employeeName: options.employeeName,
      date: values.date_given,
    })

    if (!debit.ok) {
      await db.from('advances').delete().eq('id', advance.id)
      return debit
    }

    pettyCashEntry = debit.entry
    await db.from('advances').update({ petty_cash_entry_id: debit.entry.id }).eq('id', advance.id)
  }

  await resumAdvances(db, {
    employeeId: values.employee_id,
    monthYear: values.month_year,
    userId: actor.id,
  })

  return { ok: true, advance, pettyCashEntry }
}

/**
 * May this person change this advance?
 *
 * Their own, and only while the salary month is still open — once payroll has
 * settled the month, the advance has already been deducted from what was paid
 * (Q-17 = A).
 */
export async function assertAdvanceEditable(
  db: Db,
  actor: Actor,
  advance: any,
): Promise<{ ok: true } | Refusal> {
  const { data: salaryRecord } = await db
    .from('salary_payments')
    .select('status')
    .eq('employee_id', advance.employee_id)
    .eq('month_year', advance.month_year)
    .maybeSingle()

  const allowed = canModify(actor, {
    created_by: advance.created_by,
    locked: salaryRecord?.status === 'settled',
    lockReason: 'That salary month is settled, so this advance can no longer be changed',
  })

  return allowed.ok ? { ok: true } : allowed
}

export async function updateAdvance(
  db: Db,
  actor: Actor,
  advance: any,
  values: { amount: number; date_given: string; remarks: string | null },
): Promise<{ ok: true; advance: any } | Refusal> {
  const editable = await assertAdvanceEditable(db, actor, advance)
  if (!editable.ok) return editable

  // The cap is re-checked against the new amount, less what this advance
  // already counts for — otherwise raising ₹500 to ₹600 is measured as ₹600 on
  // top of itself.
  if (Number(values.amount) > Number(advance.amount)) {
    const check = await assertAdvanceAllowed(db, {
      employeeId: advance.employee_id,
      monthYear: advance.month_year,
      amount: Number(values.amount) - Number(advance.amount),
      role: actor.role,
    })
    if (!check.ok) return check
  }

  const { data, error } = await db
    .from('advances')
    .update({
      amount: values.amount,
      date_given: values.date_given,
      remarks: values.remarks,
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', advance.id)
    .select('*')
    .single()

  if (error) throw error

  // The debit that paid it moves with it, or the float and the advance log
  // start telling two different stories.
  if (advance.petty_cash_entry_id) {
    await db
      .from('petty_cash_entries')
      .update({
        amount: values.amount,
        entry_date: values.date_given,
        updated_by: actor.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', advance.petty_cash_entry_id)
  }

  await resumAdvances(db, {
    employeeId: advance.employee_id,
    monthYear: advance.month_year,
    userId: actor.id,
  })

  return { ok: true, advance: data }
}

export async function deleteAdvance(
  db: Db,
  actor: Actor,
  advance: any,
): Promise<{ ok: true } | Refusal> {
  const editable = await assertAdvanceEditable(db, actor, advance)
  if (!editable.ok) return editable

  // The debit first: `petty_cash_entries.advance_id` cascades, but deleting it
  // here keeps the order explicit and works the same if the column is dropped.
  if (advance.petty_cash_entry_id) {
    await db.from('petty_cash_entries').delete().eq('id', advance.petty_cash_entry_id)
  }

  const { error } = await db.from('advances').delete().eq('id', advance.id)
  if (error) throw error

  await resumAdvances(db, {
    employeeId: advance.employee_id,
    monthYear: advance.month_year,
    userId: actor.id,
  })

  return { ok: true }
}
