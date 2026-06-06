import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DailySummaryPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Daily Summary</h1>
          <p className="text-muted mt-1">Daily operational summary and statistics</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Today's Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted">
              No data available for today.
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
