'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'

interface ReferralSelectProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

interface Referral {
  id: string
  name: string
  phone?: string
}

export function ReferralSelect({ value, onChange, disabled }: ReferralSelectProps) {
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [loadingCreate, setLoadingCreate] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [newReferralData, setNewReferralData] = useState({
    name: '',
    phone: '',
  })
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchReferrals()
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchReferrals = async () => {
    try {
      const response = await fetch('/api/referrals')
      const data = await response.json()
      if (response.ok) {
        setReferrals(data || [])
      }
    } catch (err) {
      console.error('Failed to fetch referrals:', err)
    }
  }

  const handleCreateReferral = async () => {
    if (!newReferralData.name.trim()) {
      setError('Please enter referral name')
      return
    }

    setLoadingCreate(true)
    setError('')

    try {
      const response = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newReferralData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create referral')
      }

      setReferrals([...referrals, data])
      onChange(data.id)
      setNewReferralData({ name: '', phone: '' })
      setShowCreateModal(false)
      setSearchTerm('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingCreate(false)
    }
  }

  const selectedReferral = referrals.find((r) => r.id === value)
  const filteredReferrals = referrals.filter((referral) =>
    referral.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="referred_by">Referred By</Label>
        <div className="relative" ref={dropdownRef}>
          <input
            ref={inputRef}
            id="referred_by"
            type="text"
            placeholder="Select referral source"
            value={searchTerm || selectedReferral?.name || ''}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setShowDropdown(true)
            }}
            onFocus={() => setShowDropdown(true)}
            className="flex h-10 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
            disabled={disabled}
          />

          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-10">
              {filteredReferrals.length > 0 ? (
                <div className="max-h-48 overflow-y-auto">
                  {filteredReferrals.map((referral) => (
                    <button
                      key={referral.id}
                      type="button"
                      onClick={() => {
                        onChange(referral.id)
                        setSearchTerm('')
                        setShowDropdown(false)
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-100 hover:bg-gray-700 border-b border-gray-700 last:border-b-0"
                    >
                      {referral.name}
                      {referral.phone && <span className="text-gray-400 ml-2">- {referral.phone}</span>}
                    </button>
                  ))}
                </div>
              ) : searchTerm ? (
                <div className="px-3 py-2 text-sm text-gray-400">No results found</div>
              ) : null}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  setShowCreateModal(true)
                }}
                className="w-full text-left px-3 py-2 text-sm text-orange-500 hover:bg-gray-700 border-t border-gray-700 font-medium"
              >
                + Create New Referral
              </button>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg p-6 w-full max-w-md border border-gray-800">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Create New Referral</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setError('')
                  setNewReferralData({ name: '', phone: '' })
                }}
                className="text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-md bg-red-900/20 border border-red-900 text-red-400 text-sm mb-4">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="referral_name">Name *</Label>
                <Input
                  id="referral_name"
                  value={newReferralData.name}
                  onChange={(e) =>
                    setNewReferralData({ ...newReferralData, name: e.target.value })
                  }
                  required
                  disabled={loadingCreate}
                  placeholder="Dr. Kumar / Hospital Name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="referral_phone">Phone</Label>
                <Input
                  id="referral_phone"
                  value={newReferralData.phone}
                  onChange={(e) =>
                    setNewReferralData({ ...newReferralData, phone: e.target.value })
                  }
                  disabled={loadingCreate}
                  placeholder="+91 98765 43210"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateModal(false)
                    setError('')
                    setNewReferralData({ name: '', phone: '' })
                  }}
                  className="flex-1"
                  disabled={loadingCreate}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleCreateReferral}
                  className="flex-1 bg-orange-600 hover:bg-orange-700"
                  disabled={loadingCreate || !newReferralData.name}
                >
                  {loadingCreate ? 'Creating...' : 'OK'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
