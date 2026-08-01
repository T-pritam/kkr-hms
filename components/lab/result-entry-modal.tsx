'use client'

import { Fragment, useState, useEffect, useMemo, useCallback } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { deriveAbnormal } from '@/lib/lab/ranges'
import { computeCalculated } from '@/lib/lab/formula'
import { ABNORMAL_LEGEND } from '@/lib/lab/constants'
import type { ResolvedRange } from '@/lib/lab/types'
import { ChevronDown, ChevronRight, AlertCircle, AlertTriangle, Check, FileText } from 'lucide-react'

interface ResultEntryModalProps {
  isOpen: boolean
  orderId: string
  onClose: () => void
  onSaved: () => void
}

interface Parameter {
  id: string
  name: string
  code: string | null
  unit: string | null
  param_type: 'numeric' | 'qualitative' | 'calculated'
  method: string | null
  options: string[] | null
  formula: string | null
  decimals: number
  group_name: string | null
  display_order: number
  resolved: ResolvedRange
}

interface Item {
  id: string
  test_name: string
  test_code: string
  specimen: string | null
  method: string | null
  status: string
  interpretation: string | null
  parameters: Parameter[]
  values: {
    parameter_id: string
    value: number | null
    text_value: string | null
    notes: string | null
  }[]
}

interface Template { id: string; title: string; body: string; test_id: string | null }

type Entry = { value: string; text: string; notes: string }
type ItemEntries = Record<string, Entry>

const blank: Entry = { value: '', text: '', notes: '' }

export function ResultEntryModal({ isOpen, orderId, onClose, onSaved }: ResultEntryModalProps) {
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<any>(null)
  const [entries, setEntries] = useState<Record<string, ItemEntries>>({})
  const [interpretations, setInterpretations] = useState<Record<string, string>>({})
  const [templates, setTemplates] = useState<Template[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [savingItem, setSavingItem] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/lab/orders/${orderId}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load the order')

      const data = json.data
      setOrder(data)

      const seededEntries: Record<string, ItemEntries> = {}
      const seededInterp: Record<string, string> = {}

      for (const item of data.items as Item[]) {
        const byParam: ItemEntries = {}
        for (const p of item.parameters) {
          const existing = item.values.find(v => v.parameter_id === p.id)
          byParam[p.id] = {
            value: existing?.value !== null && existing?.value !== undefined ? String(existing.value) : '',
            text: existing?.text_value || '',
            notes: existing?.notes || '',
          }
        }
        seededEntries[item.id] = byParam
        seededInterp[item.id] = item.interpretation || ''
      }

      setEntries(seededEntries)
      setInterpretations(seededInterp)
      setExpanded((data.items[0] as Item | undefined)?.id ?? null)

      const testIds = [...new Set((data.items as Item[]).map((i: any) => i.test_id))]
      const templateResults = await Promise.all(
        testIds.map(id =>
          fetch(`/api/lab/interpretation-templates?test_id=${id}`)
            .then(r => r.json())
            .then(j => (j.success ? j.data : []))
            .catch(() => []),
        ),
      )
      const merged = new Map<string, Template>()
      for (const list of templateResults) for (const t of list) merged.set(t.id, t)
      setTemplates([...merged.values()])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { if (isOpen && orderId) void load() }, [isOpen, orderId, load])

  const setEntry = (itemId: string, paramId: string, patch: Partial<Entry>) => {
    setEntries(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [paramId]: { ...(prev[itemId]?.[paramId] ?? blank), ...patch } },
    }))
    setSaved(prev => ({ ...prev, [itemId]: false }))
  }

  const saveItem = async (item: Item) => {
    setSavingItem(item.id)
    setError('')
    try {
      const values = item.parameters
        .filter(p => p.param_type !== 'calculated')  // derived server-side
        .map(p => {
          const e = entries[item.id]?.[p.id] ?? blank
          return {
            parameter_id: p.id,
            value: p.param_type === 'numeric' && e.value !== '' ? Number(e.value) : null,
            text_value: p.param_type === 'qualitative' ? e.text || null : null,
            notes: e.notes || null,
          }
        })

      const res = await fetch(`/api/lab/order-items/${item.id}/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save results')

      const text = interpretations[item.id] ?? ''
      if (text !== (item.interpretation || '')) {
        const ir = await fetch(`/api/lab/order-items/${item.id}/interpretation`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interpretation: text }),
        })
        const ij = await ir.json()
        // A technician without interpretation rights should still keep their results.
        if (!ir.ok || !ij.success) {
          setError(`Results saved, but the interpretation was not: ${ij.error || 'permission denied'}`)
        }
      }

      setSaved(prev => ({ ...prev, [item.id]: true }))
      onSaved()
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSavingItem(null)
    }
  }

  const items: Item[] = order?.items ?? []

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Enter Results"
      description={order ? `${order.order_no} · ${order.patient_name}` : undefined}
      size="full"
    >
      {loading ? (
        <div className="py-12 text-center text-muted">Loading order…</div>
      ) : !order ? (
        <div className="py-12 text-center text-muted">Order not found</div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="rounded-md bg-surface-inset border border-border px-3 py-2 text-xs text-muted">
            Reference intervals below are the ones that apply to this patient
            {order.patient_age !== null && order.patient_age !== undefined ? ` (${order.patient_age} yrs` : ' ('}
            {order.patient_gender ? `, ${order.patient_gender}` : ''}
            {'). '}
            {ABNORMAL_LEGEND}
          </div>

          {items.map(item => (
            <ItemPanel
              key={item.id}
              item={item}
              entries={entries[item.id] ?? {}}
              interpretation={interpretations[item.id] ?? ''}
              templates={templates.filter(t => !t.test_id || t.test_id === (item as any).test_id)}
              expanded={expanded === item.id}
              saving={savingItem === item.id}
              saved={!!saved[item.id]}
              onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
              onEntry={(paramId, patch) => setEntry(item.id, paramId, patch)}
              onInterpretation={text => {
                setInterpretations(prev => ({ ...prev, [item.id]: text }))
                setSaved(prev => ({ ...prev, [item.id]: false }))
              }}
              onSave={() => saveItem(item)}
            />
          ))}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── One test ─────────────────────────────────────────────────────────────────

function ItemPanel({
  item, entries, interpretation, templates, expanded, saving, saved,
  onToggle, onEntry, onInterpretation, onSave,
}: {
  item: Item
  entries: ItemEntries
  interpretation: string
  templates: Template[]
  expanded: boolean
  saving: boolean
  saved: boolean
  onToggle: () => void
  onEntry: (paramId: string, patch: Partial<Entry>) => void
  onInterpretation: (text: string) => void
  onSave: () => void
}) {
  // Calculated parameters update as their inputs are typed, using the same
  // evaluator the server will use when the results are saved.
  const computed = useMemo(() => {
    const numeric: Record<string, number | null> = {}
    for (const p of item.parameters) {
      if (p.param_type === 'calculated') continue
      const raw = entries[p.id]?.value
      numeric[p.id] = raw !== undefined && raw !== '' && isFinite(Number(raw)) ? Number(raw) : null
    }
    return computeCalculated(item.parameters, numeric)
  }, [item.parameters, entries])

  const abnormalCount = item.parameters.reduce((n, p) => {
    const verdict = verdictFor(p, entries[p.id], computed[p.id])
    return verdict.abnormal ? n + 1 : n
  }, 0)
  const criticalCount = item.parameters.reduce((n, p) => {
    const verdict = verdictFor(p, entries[p.id], computed[p.id])
    return verdict.isCritical ? n + 1 : n
  }, 0)

  const rows = withGroupHeadings(item.parameters)

  return (
    <section className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-surface-inset hover:bg-surface-hover text-left"
      >
        {expanded ? <ChevronDown size={16} className="text-muted shrink-0" /> : <ChevronRight size={16} className="text-muted shrink-0" />}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground truncate">{item.test_name}</span>
          <span className="block text-xs text-muted">
            {item.test_code}
            {item.specimen ? ` · ${item.specimen}` : ''}
            {item.method ? ` · ${item.method}` : ''}
          </span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {criticalCount > 0 && (
            <Badge variant="destructive"><AlertTriangle size={12} />{criticalCount} critical</Badge>
          )}
          {abnormalCount > 0 && criticalCount === 0 && (
            <Badge variant="warning">{abnormalCount} out of range</Badge>
          )}
          {saved && <Badge variant="success"><Check size={12} />Saved</Badge>}
          {item.status === 'authorised' && <Badge variant="info">Authorised</Badge>}
        </span>
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          {item.parameters.length === 0 ? (
            <p className="text-sm text-muted">
              This test has no parameters defined yet. Add them in the test catalogue first.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted border-b border-border">
                      <th className="pb-2 pr-3 font-medium">Investigation</th>
                      <th className="pb-2 pr-3 font-medium w-44">Result</th>
                      <th className="pb-2 pr-3 font-medium w-24">Unit</th>
                      <th className="pb-2 font-medium w-48">Biological Ref. Interval</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ parameter: p, showGroup }) => {
                      const entry = entries[p.id] ?? blank
                      const verdict = verdictFor(p, entry, computed[p.id])

                      return (
                        <Fragment key={p.id}>
                          {showGroup && (
                            <tr>
                              <td colSpan={4} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                                {p.group_name}
                              </td>
                            </tr>
                          )}
                          <tr className="border-b border-border/50">
                            <td className="py-2 pr-3">
                              <div className="text-foreground">{p.name}</div>
                              {p.method && <div className="text-xs text-muted">{p.method}</div>}
                            </td>
                            <td className="py-2 pr-3">
                              <div className="flex items-center gap-2">
                                <ResultInput
                                  parameter={p}
                                  entry={entry}
                                  computed={computed[p.id]}
                                  onChange={patch => onEntry(p.id, patch)}
                                />
                                {verdict.abnormal && (
                                  <span
                                    className={`text-xs font-bold ${
                                      verdict.isCritical ? 'text-destructive' : 'text-warning-text'
                                    }`}
                                    title={
                                      verdict.isCritical ? 'Critical value'
                                      : verdict.abnormal === 'H' ? 'Above reference interval'
                                      : verdict.abnormal === 'L' ? 'Below reference interval'
                                      : 'Abnormal'
                                    }
                                  >
                                    {verdict.abnormal}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 pr-3 text-muted">{p.unit || '—'}</td>
                            <td className="py-2 text-muted">{p.resolved.display}</td>
                          </tr>
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor={`interp-${item.id}`}>Interpretation</Label>
                  {templates.length > 0 && (
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-muted" />
                      <Select
                        aria-label="Insert a template"
                        className="h-8 w-56 text-xs"
                        value=""
                        onChange={e => {
                          const t = templates.find(x => x.id === e.target.value)
                          if (!t) return
                          onInterpretation(interpretation ? `${interpretation}\n${t.body}` : t.body)
                        }}
                      >
                        <option value="">Insert a template…</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </Select>
                    </div>
                  )}
                </div>
                <Textarea
                  id={`interp-${item.id}`}
                  rows={3}
                  value={interpretation}
                  onChange={e => onInterpretation(e.target.value)}
                  placeholder="Clinical summary printed under the results, e.g. “Mild leucocytosis. Suggest clinical correlation.”"
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={onSave} disabled={saving} className="bg-primary hover:bg-primary-hover">
                  {saving ? 'Saving…' : 'Save Results'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

// ── Per-parameter input ──────────────────────────────────────────────────────

function ResultInput({
  parameter, entry, computed, onChange,
}: {
  parameter: Parameter
  entry: Entry
  computed: number | null | undefined
  onChange: (patch: Partial<Entry>) => void
}) {
  if (parameter.param_type === 'calculated') {
    return (
      <div className="flex h-9 w-32 items-center rounded-md border border-border bg-surface-inset px-3 text-sm text-foreground">
        {computed !== null && computed !== undefined
          ? computed.toFixed(parameter.decimals ?? 2)
          : <span className="text-muted text-xs">auto</span>}
      </div>
    )
  }

  if (parameter.param_type === 'qualitative') {
    return (
      <Select
        aria-label={parameter.name}
        className="h-9 w-40"
        value={entry.text}
        onChange={e => onChange({ text: e.target.value })}
      >
        <option value="">—</option>
        {(parameter.options || []).map(o => <option key={o} value={o}>{o}</option>)}
      </Select>
    )
  }

  return (
    <Input
      aria-label={parameter.name}
      type="number"
      step="any"
      className="h-9 w-32"
      value={entry.value}
      onChange={e => onChange({ value: e.target.value })}
      placeholder="—"
    />
  )
}

/**
 * Flags the first parameter of each sub-heading group.
 *
 * Computed up front rather than by mutating a variable while mapping — the
 * React compiler rejects render-scope reassignment, and a precomputed list is
 * easier to follow anyway.
 */
function withGroupHeadings(parameters: Parameter[]): { parameter: Parameter; showGroup: boolean }[] {
  let last: string | null = null
  return parameters.map(parameter => {
    const showGroup = !!parameter.group_name && parameter.group_name !== last
    if (parameter.group_name) last = parameter.group_name
    return { parameter, showGroup }
  })
}

function verdictFor(parameter: Parameter, entry: Entry | undefined, computed: number | null | undefined) {
  const e = entry ?? blank

  if (parameter.param_type === 'calculated') {
    if (computed === null || computed === undefined) return { abnormal: null, isCritical: false }
    return deriveAbnormal({ value: computed }, parameter.resolved)
  }

  if (parameter.param_type === 'qualitative') {
    if (!e.text) return { abnormal: null, isCritical: false }
    return deriveAbnormal({ textValue: e.text }, parameter.resolved)
  }

  if (e.value === '' || !isFinite(Number(e.value))) return { abnormal: null, isCritical: false }
  return deriveAbnormal({ value: Number(e.value) }, parameter.resolved)
}
