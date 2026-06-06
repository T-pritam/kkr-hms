import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function EmployeeLedgerPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Employee Shift Schedule</h1>
          <p className="text-muted mt-1">Track employee work schedules and shifts</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Employee Schedules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted">
              No employee shift records found.
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
