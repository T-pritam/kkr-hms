import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, Users, Stethoscope, DollarSign } from 'lucide-react'

export default async function DashboardPage() {
  const stats = [
    {
      title: 'Total Patients',
      value: '0',
      icon: Users,
      color: 'text-info',
      bgColor: 'bg-info-subtle',
    },
    {
      title: 'Active Doctors',
      value: '0',
      icon: Stethoscope,
      color: 'text-success',
      bgColor: 'bg-success-subtle',
    },
    {
      title: 'Today\'s Appointments',
      value: '0',
      icon: Activity,
      color: 'text-primary',
      bgColor: 'bg-primary-subtle',
    },
    {
      title: 'Revenue Today',
      value: '₹0',
      icon: DollarSign,
      color: 'text-accent',
      bgColor: 'bg-accent-subtle',
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted mt-1 text-sm sm:text-base">Welcome to KKR Hospital Management System</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <Card key={stat.title} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm text-muted mb-1 truncate">{stat.title}</p>
                      <p className="text-lg sm:text-2xl font-bold text-foreground">{stat.value}</p>
                    </div>
                    <div className={`p-2 sm:p-3 rounded-xl shrink-0 ${stat.bgColor}`}>
                      <Icon className={stat.color} size={20} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted">
                No recent activity
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming Appointments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted">
                No upcoming appointments
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
