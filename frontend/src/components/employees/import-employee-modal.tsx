import { apiFetch } from '@/lib/api'
'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { X, Download, Upload, Info } from 'lucide-react'

interface ImportEmployeeModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ImportEmployeeModal({ isOpen, onClose, onSuccess }: ImportEmployeeModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.name.endsWith('.csv')) {
        setError('Please select a CSV file')
        return
      }
      setSelectedFile(file)
      setError('')
    }
  }

  const handleDownloadTemplate = () => {
    const csvContent = `Name,Salary,Role
John Doe,25000,Nurse
Jane Smith,30000,Wardboy
Michael Johnson,28000,Compounder
Sarah Williams,26000,OT Boy
Robert Brown,32000,Lab Technician`

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'employee_import_template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    if (!selectedFile) {
      setError('Please select a file')
      return
    }

    setLoading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await apiFetch('/api/employees/import', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import employees')
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg p-4 sm:p-6 w-full max-w-2xl border border-border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Import Employees from CSV</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X size={24} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* CSV Format Info */}
        <div className="mb-6 p-4 rounded-lg bg-info-subtle border border-info/20">
          <div className="flex items-start gap-3">
            <Info className="text-info mt-1 flex-shrink-0" size={20} />
            <div className="flex-1">
              <h3 className="text-info font-semibold mb-2">CSV Format Requirements</h3>
              <p className="text-info text-sm mb-3">
                👉 Click "Download Template" button below to get the CSV format
              </p>
              
              <div className="space-y-2 text-sm">
                <p className="text-foreground">Your CSV file must contain these columns:</p>
                <ul className="list-disc list-inside text-muted space-y-1 ml-2">
                  <li>
                    <span className="text-foreground font-medium">Name</span> - Employee name (required, non-empty)
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Salary</span> - Monthly salary as number (required, minimum ₹1000)
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Role</span> - Employee designation (optional, defaults to "Nurse")
                  </li>
                </ul>
              </div>

              <div className="mt-4">
                <p className="text-foreground text-sm font-semibold mb-2">Available Roles:</p>
                <p className="text-muted text-sm">
                  Nurse, Wardboy, Compounder, OT Boy, Watchman, Cleaner, Lab Technician, Pharmacist
                </p>
              </div>

              <div className="mt-4 p-3 bg-surface-hover rounded border border-input-border">
                <p className="text-foreground text-sm font-semibold mb-1">Example CSV:</p>
                <pre className="text-xs text-muted font-mono">
Name, Salary, Role
John Doe, 25000, Nurse
Jane Smith, 30000, Wardboy
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* File Selection */}
        <div className="mb-6">
          <h3 className="text-foreground font-semibold mb-3">Select CSV File:</h3>
          <div className="border-2 border-dashed border-input-border rounded-lg p-6 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            {selectedFile ? (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2 text-success-text">
                  <Upload size={24} />
                  <span className="font-medium">{selectedFile.name}</span>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="text-sm"
                >
                  Choose Different File
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Upload size={48} className="mx-auto text-muted" />
                <div>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Click to Select CSV File
                  </Button>
                </div>
                <p className="text-sm text-muted">or drag and drop your CSV file here</p>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={handleDownloadTemplate}
            className="flex items-center justify-center gap-2"
          >
            <Download size={18} />
            Download Template
          </Button>
          
          <div className="flex-1 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              className="flex-1"
              disabled={loading || !selectedFile}
            >
              {loading ? 'Importing...' : 'Import'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
