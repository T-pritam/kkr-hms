import { apiFetch } from '@/lib/api'
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { X, Printer, CheckCircle, Download } from 'lucide-react'
import jsPDF from 'jspdf'

interface ViewTestResultModalProps {
  isOpen: boolean
  resultId: string
  onClose: () => void
}

export function ViewTestResultModal({ isOpen, resultId, onClose }: ViewTestResultModalProps) {
  const [loading, setLoading] = useState(true)
  const [testResult, setTestResult] = useState<any>(null)

  useEffect(() => {
    if (isOpen && resultId) {
      fetchTestResult()
    }
  }, [isOpen, resultId])

  const fetchTestResult = async () => {
    try {
      setLoading(true)
      const response = await apiFetch(`/api/test-results/${resultId}`)
      const result = await response.json()

      if (result.success) {
        setTestResult(result.data)
      }
    } catch (error) {
      console.error('Error fetching test result:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPDF = () => {
    if (!testResult) return

    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 14
    const contentWidth = pageWidth - margin * 2
    let y = 14

    const bold = (size: number) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(size) }
    const normal = (size: number) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(size) }
    const line = () => { doc.setDrawColor(200); doc.line(margin, y, pageWidth - margin, y); y += 4 }

    // Header
    bold(16)
    doc.setTextColor(20, 20, 20)
    doc.text('KKR Hospital & Medical Services', pageWidth / 2, y, { align: 'center' })
    y += 6
    normal(10)
    doc.setTextColor(100)
    doc.text('Laboratory Report', pageWidth / 2, y, { align: 'center' })
    y += 2
    doc.setTextColor(20)
    y += 2
    line()
    y += 2

    // Patient & Test Info side by side
    bold(9)
    doc.text('PATIENT INFORMATION', margin, y)
    doc.text('TEST INFORMATION', pageWidth / 2 + 2, y)
    y += 5
    normal(9)
    const patientName = testResult.patient_name || '—'
    const patientAge = testResult.patient_age ? `${testResult.patient_age} yrs` : '—'
    const patientGender = testResult.patient_gender || '—'
    const patientPhone = testResult.patient_phone || '—'
    const patientLines = [
      ['Name:', patientName],
      ['Age / Sex:', `${patientAge} / ${patientGender}`],
      ['Phone:', patientPhone],
    ]
    const testDate = new Date(testResult.test_date).toLocaleDateString('en-IN')
    const reportDate = testResult.result_issued_at
      ? new Date(testResult.result_issued_at).toLocaleString('en-IN')
      : new Date().toLocaleDateString('en-IN')
    const testLines = [
      ['Test:', testResult.lab_tests?.name || '—'],
      ['Code:', testResult.lab_tests?.code || '—'],
      ['Category:', testResult.lab_tests?.category || '—'],
      ['Sample:', testResult.lab_tests?.sample_type || '—'],
      ['Test Date:', testDate],
      ['Report Date:', reportDate],
    ]
    const startY = y
    patientLines.forEach(([label, value]) => {
      bold(8.5); doc.text(label, margin, y)
      normal(8.5); doc.text(value, margin + 22, y)
      y += 5
    })
    y = startY
    testLines.forEach(([label, value]) => {
      bold(8.5); doc.text(label, pageWidth / 2 + 2, y)
      normal(8.5); doc.text(String(value), pageWidth / 2 + 24, y)
      y += 5
    })
    y += 4
    line()

    // Results table header
    bold(9)
    doc.setFillColor(240, 240, 240)
    doc.rect(margin, y, contentWidth, 7, 'F')
    const cols = [margin, margin + 60, margin + 90, margin + 120, margin + 150]
    const headers = ['Parameter', 'Result', 'Unit', 'Ref Range', 'Flag']
    headers.forEach((h, i) => { doc.text(h, cols[i] + 1, y + 5) })
    y += 8

    // Results rows
    normal(8.5)
    ;(testResult.values || []).forEach((v: any, idx: number) => {
      if (y > 270) { doc.addPage(); y = 14 }
      if (idx % 2 === 0) {
        doc.setFillColor(249, 249, 249)
        doc.rect(margin, y - 1, contentWidth, 6.5, 'F')
      }
      const flag = v.flag || 'normal'
      const isAbnormal = flag !== 'normal'
      if (isAbnormal) doc.setTextColor(180, 0, 0); else doc.setTextColor(20, 20, 20)
      const refRange = v.ref_min !== null && v.ref_max !== null ? `${v.ref_min} - ${v.ref_max}` : '—'
      const result = v.value !== null ? String(v.value) : (v.text_value || '—')
      const flagText = flag === 'normal' ? '✓' : flag.toUpperCase()
      doc.text(String(v.test_parameters?.name || '—'), cols[0] + 1, y + 4)
      doc.text(result, cols[1] + 1, y + 4)
      doc.setTextColor(20)
      doc.text(String(v.unit || '—'), cols[2] + 1, y + 4)
      doc.text(refRange, cols[3] + 1, y + 4)
      if (isAbnormal) doc.setTextColor(180, 0, 0); else doc.setTextColor(0, 150, 0)
      doc.text(flagText, cols[4] + 1, y + 4)
      doc.setTextColor(20)
      y += 6.5
    })
    y += 2
    line()

    // Notes
    if (testResult.notes) {
      y += 2
      bold(8.5); doc.text('Notes:', margin, y); y += 5
      normal(8.5); doc.setTextColor(80)
      doc.text(testResult.notes, margin, y); y += 8
      doc.setTextColor(20)
    }

    // Footer
    y += 4
    normal(8)
    doc.setTextColor(80)
    if (testResult.reference_doctor?.username) {
      doc.text(`Reference Doctor: ${testResult.reference_doctor.username}`, margin, y)
    }
    if (testResult.verified_by_user?.username) {
      doc.text(`Verified By: ${testResult.verified_by_user.username}`, pageWidth / 2, y)
    }
    y += 8
    doc.setDrawColor(150)
    doc.line(pageWidth - margin - 40, y, pageWidth - margin, y)
    y += 4
    doc.text('Authorized Signature', pageWidth - margin - 40, y)

    const safeName = (testResult.patient_name || 'patient').replace(/[^a-z0-9]/gi, '_')
    const safeTest = (testResult.lab_tests?.code || 'test').replace(/[^a-z0-9]/gi, '_')
    doc.save(`Lab_Report_${safeName}_${safeTest}_${testDate.replace(/\//g, '-')}.pdf`)
  }

  const handleVerify = async () => {
    if (!confirm('Verify and issue this report?')) return

    try {
      const response = await apiFetch(`/api/test-results/${resultId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'verified',
          result_issued_at: new Date().toISOString(),
        }),
      })

      if (response.ok) {
        fetchTestResult()
      }
    } catch (error) {
      console.error('Error verifying result:', error)
    }
  }

  const getFlagColor = (flag: string) => {
    switch (flag) {
      case 'low':
        return 'text-info'
      case 'high':
        return 'text-primary'
      case 'critical':
        return 'text-destructive font-bold'
      default:
        return 'text-success-text'
    }
  }

  const getFlagIcon = (flag: string) => {
    switch (flag) {
      case 'low':
        return '↓'
      case 'high':
        return '↑'
      case 'critical':
        return '⚠'
      default:
        return '✓'
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg p-4 sm:p-6 w-full max-w-4xl border border-border max-h-[90vh] overflow-y-auto">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-info"></div>
            <p className="mt-2 text-muted">Loading test result...</p>
          </div>
        ) : testResult ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-6 print:hidden">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">Test Result Report</h2>
              <div className="flex gap-2">
                {testResult.status === 'completed' && (
                  <Button
                    onClick={handleVerify}
                    className="bg-success hover:bg-success-hover text-foreground"
                  >
                    <CheckCircle className="mr-2" size={16} />
                    Verify & Issue
                  </Button>
                )}
                <Button
                  onClick={handleDownloadPDF}
                  variant="outline"
                  className="border-input-border text-foreground"
                >
                  <Download size={16} className="mr-2" />
                  Download PDF
                </Button>
                <Button
                  onClick={handlePrint}
                  variant="outline"
                  className="border-input-border text-foreground"
                >
                  <Printer size={16} className="mr-2" />
                  Print
                </Button>
                <button onClick={onClose} className="text-muted hover:text-foreground">
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Report Content - Print Friendly */}
            <div className="bg-white text-black p-8 rounded-lg print:bg-white">
              {/* Hospital Header */}
              <div className="text-center border-b-2 border-border pb-4 mb-6">
                <h1 className="text-2xl font-bold">KKR Hospital & Medical Services</h1>
                <p className="text-sm text-gray-600 mt-1">Laboratory Report</p>
              </div>

              {/* Patient & Test Info */}
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 mb-2">Patient Information</h3>
                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="font-medium">Name:</span>{' '}
                      {testResult.patient_name || '—'}
                    </div>
                    <div>
                      <span className="font-medium">Age/Gender:</span>{' '}
                      {testResult.patient_age || 'N/A'} / {testResult.patient_gender || 'N/A'}
                    </div>
                    <div>
                      <span className="font-medium">Phone:</span>{' '}
                      {testResult.patient_phone || 'N/A'}
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 mb-2">Test Information</h3>
                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="font-medium">Test:</span> {testResult.lab_tests?.name}
                    </div>
                    <div>
                      <span className="font-medium">Test Code:</span> {testResult.lab_tests?.code}
                    </div>
                    <div>
                      <span className="font-medium">Category:</span> {testResult.lab_tests?.category}
                    </div>
                    <div>
                      <span className="font-medium">Sample Type:</span>{' '}
                      {testResult.lab_tests?.sample_type}
                    </div>
                    <div>
                      <span className="font-medium">Collection Date:</span>{' '}
                      {testResult.sample_collected_at
                        ? new Date(testResult.sample_collected_at).toLocaleString()
                        : 'N/A'}
                    </div>
                    <div>
                      <span className="font-medium">Report Date:</span>{' '}
                      {testResult.result_issued_at
                        ? new Date(testResult.result_issued_at).toLocaleString()
                        : new Date().toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Test Results Table */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-600 mb-3">Test Results</h3>
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">
                        Parameter
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-center text-sm font-semibold">
                        Result
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-center text-sm font-semibold">
                        Unit
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-center text-sm font-semibold">
                        Reference Range
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-center text-sm font-semibold">
                        Flag
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {testResult.values?.map((value: any, index: number) => (
                      <tr key={value.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 px-4 py-2 text-sm">
                          {value.test_parameters?.name}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center text-sm font-medium">
                          {value.value !== null ? value.value : value.text_value || '-'}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center text-sm">
                          {value.unit}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center text-sm">
                          {value.ref_min !== null && value.ref_max !== null
                            ? `${value.ref_min} - ${value.ref_max}`
                            : '-'}
                        </td>
                        <td
                          className={`border border-gray-300 px-4 py-2 text-center text-sm font-bold ${
                            value.flag === 'low' || value.flag === 'high' || value.flag === 'critical'
                              ? 'print:text-red-600'
                              : 'print:text-green-600'
                          }`}
                        >
                          <span className={`${getFlagColor(value.flag)} print:hidden`}>
                            {getFlagIcon(value.flag)}
                          </span>
                          <span className="hidden print:inline">
                            {value.flag === 'normal' ? '✓' : value.flag.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Notes */}
              {testResult.notes && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-600 mb-2">Notes</h3>
                  <p className="text-sm text-gray-700">{testResult.notes}</p>
                </div>
              )}

              {/* Footer */}
              <div className="mt-8 pt-4 border-t border-gray-300">
                <div className="flex justify-between items-end">
                  <div className="text-xs text-gray-600">
                    <div>
                      <span className="font-medium">Reference Doctor:</span>{' '}
                      {testResult.reference_doctor?.username || 'N/A'}
                    </div>
                    {testResult.verified_by_user && (
                      <div>
                        <span className="font-medium">Verified By:</span>{' '}
                        {testResult.verified_by_user.username}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="border-t border-border pt-2 mt-8">
                      <p className="text-xs font-medium">Authorized Signature</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="mt-4 text-center print:hidden">
                <span
                  className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${
                    testResult.status === 'verified'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {testResult.status === 'verified' ? '✓ Verified Report' : 'Draft Report'}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-muted">No test result found</div>
        )}
      </div>
    </div>
  )
}
