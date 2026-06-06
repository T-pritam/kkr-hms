import { apiFetch } from '@/lib/api'
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { Sidebar } from './sidebar'
import { useRouter, usePathname } from 'next/navigation'

interface DashboardLayoutProps {
  children: ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [userRole, setUserRole] = useState<string>('ADMIN')
  const [loading, setLoading] = useState(true)

  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await apiFetch('/api/auth/me')

        if (!response.ok) {
          router.push('/login')
          return
        }

        const data = await response.json()
        const role = data.user.role

        setUserRole(role)

        // 🚨 ROLE BASED REDIRECT
        if (role !== 'ADMIN' && pathname === '/dashboard') {
          router.replace('/patients')
          return
        }

        // Admin-only routes — verbatim from the original Next.js middleware.
        const adminOnlyPaths = ['/employees', '/finances', '/daily-ledger/employee-ledger', '/admin']
        if (role !== 'ADMIN' && adminOnlyPaths.some((p) => pathname.startsWith(p))) {
          router.replace('/dashboard')
          return
        }
      } catch (error) {
        router.push('/login')
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router, pathname])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <span className="text-muted text-sm">Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar userRole={userRole} />
      <div className="lg:pl-64">
        <main className="p-3 pt-16 sm:p-6 sm:pt-6 lg:p-8 pb-safe">{children}</main>
      </div>
    </div>
  )
}
