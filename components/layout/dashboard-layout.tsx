'use client'

import { ReactNode, useEffect, useState } from 'react'
import { Sidebar } from './sidebar'
import { useRouter } from 'next/navigation'

interface DashboardLayoutProps {
  children: ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [userRole, setUserRole] = useState<string>('ADMIN')
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Verify authentication on client side
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (!response.ok) {
          router.push('/login')
          return
        }
        const data = await response.json()
        setUserRole(data.user.role)
      } catch (error) {
        router.push('/login')
      } finally {
        setLoading(false)
      }
    }
    
    checkAuth()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      <Sidebar userRole={userRole} />
      <div className="lg:pl-64">
        <main className="p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
