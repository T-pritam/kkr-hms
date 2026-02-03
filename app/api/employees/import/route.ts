import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.cookies.get('accessToken')?.value
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.name.endsWith('.csv')) {
      return NextResponse.json({ error: 'File must be a CSV' }, { status: 400 })
    }

    // Read CSV file
    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim())

    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'CSV file is empty or has no data rows' },
        { status: 400 }
      )
    }

    // Parse header
    const header = lines[0].split(',').map(h => h.trim())
    
    // Validate required columns
    const nameIndex = header.findIndex(h => h.toLowerCase() === 'name')
    const salaryIndex = header.findIndex(h => h.toLowerCase() === 'salary')
    const roleIndex = header.findIndex(h => h.toLowerCase() === 'role')

    if (nameIndex === -1 || salaryIndex === -1) {
      return NextResponse.json(
        { error: 'CSV must contain Name and Salary columns' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const employees = []
    const errors: string[] = []

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim())
      
      const name = values[nameIndex]
      const salaryStr = values[salaryIndex]
      const designation = roleIndex !== -1 ? values[roleIndex] : 'Nurse'

      // Validate row
      if (!name) {
        errors.push(`Row ${i + 1}: Name is required`)
        continue
      }

      const salary = parseFloat(salaryStr)
      if (isNaN(salary) || salary < 1000) {
        errors.push(`Row ${i + 1}: Invalid salary (minimum ₹1000)`)
        continue
      }

      employees.push({
        name,
        designation,
        base_salary: salary,
        join_date: new Date().toISOString().split('T')[0],
        status: 'Active',
      })
    }

    if (employees.length === 0) {
      return NextResponse.json(
        { error: 'No valid employee data found', details: errors },
        { status: 400 }
      )
    }

    // Bulk insert
    const { error: insertError } = await supabase
      .from('employees')
      .insert(employees)

    if (insertError) {
      throw insertError
    }

    return NextResponse.json({
      message: `Successfully imported ${employees.length} employees`,
      imported: employees.length,
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
