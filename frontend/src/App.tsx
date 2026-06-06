import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useUser } from '@/hooks/use-user'

import Home from '@/routes/Home'
import Login from '@/routes/Login'
import ResetPassword from '@/routes/ResetPassword'
import ChangePassword from '@/routes/ChangePassword'
import Dashboard from '@/routes/Dashboard'
import Patients from '@/routes/Patients'
import PatientDetail from '@/routes/PatientDetail'
import Doctors from '@/routes/Doctors'
import LabTests from '@/routes/LabTests'
import LabResults from '@/routes/LabResults'
import Employees from '@/routes/Employees'
import EmployeeDetails from '@/routes/EmployeeDetails'
import EmployeeSalary from '@/routes/EmployeeSalary'
import Finances from '@/routes/Finances'
import LedgerSummary from '@/routes/LedgerSummary'
import EmployeeShift from '@/routes/EmployeeShift'
import DailyLedgerSummary from '@/routes/DailyLedgerSummary'
import EmployeeLedger from '@/routes/EmployeeLedger'
import Admin from '@/routes/Admin'

/** Redirects already-authenticated users away from the auth pages (login/reset). */
function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser()
  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  // Keep the router subscribed to location changes for nested navigation.
  useLocation()
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/reset-password" element={<PublicOnly><ResetPassword /></PublicOnly>} />
      <Route path="/change-password" element={<ChangePassword />} />

      {/* Protected pages self-wrap in DashboardLayout, which enforces auth + role redirects. */}
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/patients" element={<Patients />} />
      <Route path="/patients/:id" element={<PatientDetail />} />
      <Route path="/doctors" element={<Doctors />} />
      <Route path="/lab/tests" element={<LabTests />} />
      <Route path="/lab/results" element={<LabResults />} />
      <Route path="/employees" element={<Employees />} />
      <Route path="/employees/details" element={<EmployeeDetails />} />
      <Route path="/employees/salary" element={<EmployeeSalary />} />
      <Route path="/finances" element={<Finances />} />
      <Route path="/ledger/summary" element={<LedgerSummary />} />
      <Route path="/ledger/employee-shift" element={<EmployeeShift />} />
      <Route path="/daily-ledger/summary" element={<DailyLedgerSummary />} />
      <Route path="/daily-ledger/employee-ledger" element={<EmployeeLedger />} />
      <Route path="/admin" element={<Admin />} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
