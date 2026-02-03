import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DailySummaryPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Daily Summary</h1>
          <p className="text-gray-400 mt-1">Daily operational summary and statistics</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Today's Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-gray-400">
              No data available for today.
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
