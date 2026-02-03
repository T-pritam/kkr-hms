import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function FinancesPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Finances</h1>
          <p className="text-gray-400 mt-1">Financial overview and reports</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">₹0</p>
              <p className="text-sm text-gray-400 mt-1">This month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Total Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">₹0</p>
              <p className="text-sm text-gray-400 mt-1">This month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Net Profit</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">₹0</p>
              <p className="text-sm text-gray-400 mt-1">This month</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Financial Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-gray-400">
              No transactions found.
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
