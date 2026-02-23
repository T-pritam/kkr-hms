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
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
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
      roles: ['ADMIN', 'DOCTOR', 'LAB_TECHNICIAN', 'RECEPTIONIST'],
      submenu: [
        { name: 'Test Catalog', href: '/lab/tests', roles: ['ADMIN', 'LAB_TECHNICIAN'] },
        { name: 'Test Results', href: '/lab/results', roles: ['ADMIN', 'DOCTOR', 'LAB_TECHNICIAN', 'RECEPTIONIST'] },
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
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-gray-800 text-gray-100"
      >
        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-gray-950 border-r border-gray-800 transform transition-transform duration-200 ease-in-out lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-center h-20 border-b border-gray-800">
            <h1 className="text-2xl font-bold">
              <span className="text-orange-600">KKR</span>{' '}
              <span className="text-white">Hospital Management</span>
            </h1>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4">
            <ul className="space-y-1 px-3">
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
                          'flex items-center justify-between w-full px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors',
                          isOpen && 'bg-gray-800 text-white'
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
                                  'flex items-center px-4 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors',
                                  pathname === subItem.href &&
                                    'bg-orange-600 text-white hover:bg-orange-700'
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
                        'flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors',
                        isActive && 'bg-orange-600 text-white hover:bg-orange-700'
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

          {/* Logout */}
          <div className="border-t border-gray-800 p-3">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
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
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  )
}
