'use client'

import { useCallback, useEffect, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { AUDIT_ACTION_LABELS, FIELD_LABELS } from '@/lib/case-sheet/constants'
import type { AuditEntry } from '@/lib/case-sheet/types'
import { AlertCircle, History } from 'lucide-react'

/**
 * The change log for one case sheet.
 *
 * Answers "who changed what, and when" — which nothing in this system could
 * answer before. Each entry lists the fields that moved, with the old value and
 * the new one, so a summary that reads differently today than it did yesterday
 * has a paper trail.
 */

interface AuditTrailProps {
  isOpen: boolean
  onClose: () => void
  patientId: string
  caseSheetId: string
  summaryNo?: string | null
}

const ACTION_VARIANT: Record<string, BadgeVariant> = {
  created:   'info',
  updated:   'outline',
  finalised: 'success',
  reopened:  'warning',
  deleted:   'destructive',
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

/**
 * Renders a stored value for display. Lists (doctors, medication) are stored as
 * arrays of one-line descriptions; everything else is a scalar.
 */
function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)'
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '(none)'
  return String(value)
}

export function AuditTrail({ isOpen, onClose, patientId, caseSheetId, summaryNo }: AuditTrailProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/patients/${patientId}/case-sheets/${caseSheetId}/audit`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load the change log')
      setEntries(json.data || [])
    } catch (err: any) {
      setError(err.message)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [patientId, caseSheetId])

  useEffect(() => {
    if (isOpen) void load()
  }, [isOpen, load])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Change history${summaryNo ? ` — ${summaryNo}` : ''}`}
      description="Every change to this case sheet, newest first."
      size="lg"
    >
      {loading ? (
        <div className="text-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="mt-2 text-muted text-sm">Loading history…</p>
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-10">
          <History size={28} className="mx-auto text-muted" />
          <p className="mt-2 text-muted text-sm">No changes recorded yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map(entry => (
            <li key={entry.id} className="rounded-lg border border-border bg-surface p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={ACTION_VARIANT[entry.action] ?? 'outline'}>
                  {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                </Badge>
                <span className="text-sm text-foreground">
                  {entry.actor_name || 'Unknown user'}
                  {entry.actor_role && <span className="text-muted text-xs ml-1.5">({entry.actor_role})</span>}
                </span>
                <span className="text-xs text-muted sm:ml-auto">{when(entry.created_at)}</span>
              </div>

              {entry.summary && <p className="text-sm text-muted">{entry.summary}</p>}

              {entry.changes && Object.keys(entry.changes).length > 0 && (
                <dl className="space-y-1.5 border-t border-border pt-2">
                  {Object.entries(entry.changes).map(([field, change]) => (
                    <div key={field} className="text-xs">
                      <dt className="font-medium text-foreground">
                        {FIELD_LABELS[field] ?? field}
                      </dt>
                      <dd className="text-muted">
                        <span className="line-through opacity-70">{show(change.from)}</span>
                        <span className="mx-1.5">→</span>
                        <span className="text-foreground">{show(change.to)}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
