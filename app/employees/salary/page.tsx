import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function EmployeeSalaryPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Employee Salary</h1>
          <p className="text-gray-400 mt-1">Manage employee salaries and payroll</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Salary Records</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-gray-400">
              No salary records found.
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
