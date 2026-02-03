import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function EmployeeLedgerPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Employee Shift Schedule</h1>
          <p className="text-gray-400 mt-1">Track employee work schedules and shifts</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Employee Schedules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-gray-400">
              No employee shift records found.
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
