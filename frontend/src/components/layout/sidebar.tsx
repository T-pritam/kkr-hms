import { apiFetch } from '@/lib/api'
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Stethoscope,
  UsersRound,
  DollarSign,
  BookOpen,
  Settings,
  LogOut,
  ChevronDown,
  Menu,
  X,
  FlaskConical,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { ThemeToggle } from '@/components/ui/theme-toggle'

interface SidebarProps {
  userRole?: string
}

export function Sidebar({ userRole = 'ADMIN' }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [employeeOpen, setEmployeeOpen] = useState(false)
  const [ledgerOpen, setLedgerOpen] = useState(false)
  const [labOpen, setLabOpen] = useState(false)

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore — clear client state regardless
    }
    // Hard redirect so all in-memory auth state (UserContext) is reset; a
    // client-side push would bounce between /login and /dashboard on stale state.
    window.location.href = '/login'
  }

  const menuItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      roles: ['ADMIN', 'DOCTOR'],
    },
    {
      name: 'Patients',
      href: '/patients',
      icon: Users,
      roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'],
    },
    {
      name: 'Doctors',
      href: '/doctors',
      icon: Stethoscope,
      roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'],
    },
    {
      name: 'Lab/Pathology',
      icon: FlaskConical,
      roles: ['ADMIN', 'DOCTOR', 'NURSE', 'LAB_TECHNICIAN', 'RECEPTIONIST'],
      submenu: [
        { name: 'Test Catalog', href: '/lab/tests', roles: ['ADMIN', 'DOCTOR', 'NURSE', 'LAB_TECHNICIAN', 'RECEPTIONIST'] },
        { name: 'Test Results', href: '/lab/results', roles: ['ADMIN', 'DOCTOR', 'NURSE', 'LAB_TECHNICIAN', 'RECEPTIONIST'] },
      ],
    },
    {
      name: 'Employees',
      icon: UsersRound,
      roles: ['ADMIN', 'DOCTOR'],
      submenu: [
        { name: 'Employee Details', href: '/employees/details', roles: ['ADMIN'] },
        { name: 'Employee Salary', href: '/employees/salary', roles: ['ADMIN'] },
      ],
    },
    {
      name: 'Finances',
      href: '/finances',
      icon: DollarSign,
      roles: ['ADMIN', 'DOCTOR'],
    },
    {
      name: 'Daily Ledger',
      icon: BookOpen,
      roles: ['ADMIN', 'DOCTOR'],
      submenu: [
        {
          name: 'Daily Summary',
          href: '/ledger/summary',
          roles: ['ADMIN', 'DOCTOR'],
        },
        {
          name: 'Employee Shift Schedule',
          href: '/ledger/employee-shift',
          roles: ['ADMIN'],
        },
      ],
    },
    {
      name: 'Daily Ledger',
      href: '/ledger/summary',
      icon: BookOpen,
      roles: ['NURSE', 'RECEPTIONIST'],
    },
    {
      name: 'Admin Panel',
      href: '/admin',
      icon: Settings,
      roles: ['ADMIN', 'DOCTOR'],
    },
  ]

  const filteredMenuItems = menuItems.filter((item) =>
    item.roles.includes(userRole)
  )

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-surface border border-border text-foreground shadow-md active:scale-95 transition-transform"
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
      >
        {mobileOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-sidebar border-r border-sidebar-border transform transition-transform duration-200 ease-in-out lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-center h-20 border-b border-sidebar-border">
            <h1 className="text-2xl font-bold">
              <span className="text-primary">KKR</span>{' '}
              <span className="text-foreground">HMS</span>
            </h1>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-3 sm:py-4">
            <ul className="space-y-0.5 sm:space-y-1 px-2 sm:px-3">
              {filteredMenuItems.map((item) => {
                const Icon = item.icon
                const hasSubmenu = item.submenu && item.submenu.length > 0
                const isActive = item.href ? pathname === item.href : false

                if (hasSubmenu) {
                  const isOpen =
                    item.name === 'Employees' ? employeeOpen : 
                    item.name === 'Lab/Pathology' ? labOpen :
                    ledgerOpen
                  const setIsOpen =
                    item.name === 'Employees' ? setEmployeeOpen : 
                    item.name === 'Lab/Pathology' ? setLabOpen :
                    setLedgerOpen

                  const filteredSubmenu = item.submenu.filter((sub) =>
                    !sub.roles || sub.roles.includes(userRole)
                  )

                  return (
                    <li key={item.name}>
                      <button
                        onClick={() => setIsOpen(!isOpen)}
                        className={cn(
                          'flex items-center justify-between w-full px-3 sm:px-4 py-3 min-h-[44px] rounded-lg text-muted hover:bg-sidebar-hover hover:text-foreground transition-colors active:bg-sidebar-hover',
                          isOpen && 'bg-sidebar-hover text-foreground'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Icon size={20} />
                          <span className="font-medium">{item.name}</span>
                        </div>
                        <ChevronDown
                          size={16}
                          className={cn(
                            'transition-transform',
                            isOpen && 'rotate-180'
                          )}
                        />
                      </button>
                      {isOpen && (
                        <ul className="mt-1 ml-4 space-y-1">
                          {filteredSubmenu.map((subItem) => (
                            <li key={subItem.name}>
                              <Link
                                href={subItem.href}
                                onClick={() => setMobileOpen(false)}
                                className={cn(
                                  'flex items-center px-3 sm:px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 rounded-lg text-sm text-muted hover:bg-sidebar-hover hover:text-foreground transition-colors active:bg-sidebar-hover',
                                  pathname === subItem.href &&
                                    'bg-sidebar-active text-primary font-medium'
                                )}
                              >
                                {subItem.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                }

                return (
                  <li key={item.name}>
                    <Link
                      href={item.href!}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 sm:px-4 py-3 min-h-[44px] rounded-lg text-muted hover:bg-sidebar-hover hover:text-foreground transition-colors active:bg-sidebar-hover',
                        isActive && 'bg-sidebar-active text-primary font-medium'
                      )}
                    >
                      <Icon size={20} />
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* Theme Toggle + Logout */}
          <div className="border-t border-sidebar-border p-2 sm:p-3 space-y-1 sm:space-y-2 pb-safe">
            <div className="flex items-center justify-center px-2">
              <ThemeToggle className="w-full justify-center" />
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 sm:px-4 py-3 min-h-[44px] rounded-lg text-muted hover:bg-destructive-subtle hover:text-destructive transition-colors active:bg-destructive-subtle"
            >
              <LogOut size={20} />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-overlay backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  )
}
