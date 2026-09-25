import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/employees/authz'
import { istToday } from '@/lib/dates/ist'
import { parseCsv } from '@/lib/export/csv'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEmployee(request, 'employee:write')
    if (auth.response) return auth.response

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.name.endsWith('.csv')) {
      return NextResponse.json({ error: 'File must be a CSV' }, { status: 400 })
    }

    // RFC 4180, so a quoted "Kumar, Ramesh" stays one field (BUGS #54).
    const rows = parseCsv(await file.text())

    if (rows.length < 2) {
      return NextResponse.json(
        { error: 'CSV file is empty or has no data rows' },
        { status: 400 }
      )
    }

    const header = rows[0].map(h => h.trim().toLowerCase())
    const nameIndex = header.indexOf('name')
    const salaryIndex = header.indexOf('salary')
    const roleIndex = header.indexOf('role')

    if (nameIndex === -1 || salaryIndex === -1) {
      return NextResponse.json(
        { error: 'CSV must contain Name and Salary columns' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    /**
     * Who is already on the register. Re-uploading the same file used to create
     * a second copy of everyone (BUGS #54). The file carries only a name, a
     * salary and a role, so "the same employee" is an active one with the same
     * name *and* the same role, compared without case or spacing: a namesake in
     * a different role still imports, and every skip is reported by row so a
     * genuine second person of the same name and role can be added by hand.
     */
    const identity = (name: string, designation: string) =>
      `${name.replace(/\s+/g, ' ').trim().toLowerCase()}|${designation.replace(/\s+/g, ' ').trim().toLowerCase()}`
    const { data: current, error: currentError } = await supabase
      .from('employees')
      .select('name, designation')
      .eq('status', 'Active')
    if (currentError) throw currentError
    const seen = new Set((current ?? []).map((e: { name: string; designation: string | null }) => identity(e.name, e.designation ?? '')))

    const employees = []
    const errors: string[] = []
    const skipped: string[] = []

    for (let i = 1; i < rows.length; i++) {
      const values = rows[i].map(v => v.trim())
      const name = values[nameIndex]
      const salaryStr = values[salaryIndex]
      const designation = (roleIndex !== -1 ? values[roleIndex] : '') || 'Nurse'

      if (!name) {
        errors.push(`Row ${i + 1}: Name is required`)
        continue
      }

      const salary = parseFloat(salaryStr)
      if (isNaN(salary) || salary < 1000) {
        errors.push(`Row ${i + 1}: Invalid salary (minimum ₹1000)`)
        continue
      }

      const key = identity(name, designation)
      if (seen.has(key)) {
        skipped.push(`Row ${i + 1}: ${name} (${designation}) is already on the register`)
        continue
      }
      seen.add(key)

      employees.push({
        name,
        designation,
        base_salary: salary,
        join_date: istToday(),
        status: 'Active',
        created_by: auth.user.id,
        updated_by: auth.user.id,
      })
    }

    if (employees.length === 0) {
      return NextResponse.json(
        {
          error: skipped.length > 0 ? 'Everyone in the file is already on the register' : 'No valid employee data found',
          details: [...errors, ...skipped],
        },
        { status: 400 }
      )
    }

    /**
     * Each imported employee gets a code, as one added by hand does. The bulk
     * insert used to write none — the column has no default — so an imported
     * employee had no code at all.
     */
    for (const employee of employees as Array<Record<string, unknown>>) {
      const { data: code, error: codeError } = await supabase.rpc('next_employee_code')
      if (codeError) throw codeError
      employee.employee_code = code
    }

    const { error: insertError } = await supabase
      .from('employees')
      .insert(employees)

    if (insertError) {
      throw insertError
    }

    return NextResponse.json({
      message: `Successfully imported ${employees.length} employees`,
      imported: employees.length,
      skipped: skipped.length > 0 ? skipped : undefined,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Error importing employees:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to import employees' },
      { status: 500 }
    )
  }
}
