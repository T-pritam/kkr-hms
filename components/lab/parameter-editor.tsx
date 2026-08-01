'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { formatRange } from '@/lib/lab/ranges'
import { isValidFormula, extractFormulaRefs } from '@/lib/lab/formula'
import {
  PARAM_TYPE_LABELS, RANGE_TYPE_LABELS, COMMON_QUALITATIVE_OPTIONS,
} from '@/lib/lab/constants'
import type { ParamType, RangeType } from '@/lib/lab/types'
import { Plus, Trash2, AlertCircle, X } from 'lucide-react'

export interface ParameterDraft {
  id?: string
  name: string
  code: string
  unit: string
  param_type: ParamType
  method: string
  group_name: string
  decimals: string
  display_order: string
  options: string[]
  formula: string
  is_active: boolean
}

export const emptyParameter: ParameterDraft = {
  name: '', code: '', unit: '', param_type: 'numeric', method: '', group_name: '',
  decimals: '2', display_order: '0', options: [], formula: '', is_active: true,
}

interface RangeRow {
  id: string
  gender: string | null
  age_min_years: number | null
  age_max_years: number | null
  range_type: RangeType
  min_value: number | null
  max_value: number | null
  text_range: string | null
  display_text: string | null
  normal_options: string[] | null
  critical_low: number | null
  critical_high: number | null
  display_order: number
}

interface ParameterEditorProps {
  testId: string
  draft: ParameterDraft
  siblingCodes: string[]
  onChange: (draft: ParameterDraft) => void
  onSaved: () => void
  onCancel: () => void
}

export function ParameterEditor({
  testId, draft, siblingCodes, onChange, onSaved, onCancel,
}: ParameterEditorProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ranges, setRanges] = useState<RangeRow[]>([])
  const [showRangeForm, setShowRangeForm] = useState(false)

  const set = (patch: Partial<ParameterDraft>) => onChange({ ...draft, ...patch })

  const loadRanges = useCallback(async () => {
    if (!draft.id) { setRanges([]); return }
    try {
      const res = await fetch(`/api/lab/parameters/${draft.id}/ranges`)
      const json = await res.json()
      if (json.success) setRanges(json.data)
    } catch (err) {
      console.error('Failed to load reference intervals:', err)
    }
  }, [draft.id])

  useEffect(() => { void loadRanges() }, [loadRanges])

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: draft.name.trim(),
        code: draft.code.trim() || null,
        unit: draft.unit.trim() || null,
        param_type: draft.param_type,
        method: draft.method.trim() || null,
        group_name: draft.group_name.trim() || null,
        decimals: Number(draft.decimals) || 0,
        display_order: Number(draft.display_order) || 0,
        options: draft.param_type === 'qualitative' ? draft.options : null,
        formula: draft.param_type === 'calculated' ? draft.formula.trim() : null,
        is_active: draft.is_active,
      }

      const res = draft.id
        ? await fetch(`/api/test-parameters/${draft.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/lab-tests/${testId}/parameters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save the parameter')

      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const removeRange = async (rangeId: string) => {
    if (!draft.id) return
    await fetch(`/api/lab/parameters/${draft.id}/ranges/${rangeId}`, { method: 'DELETE' })
    await loadRanges()
  }

  const formulaRefs = extractFormulaRefs(draft.formula)
  const unknownRefs = formulaRefs.filter(r => !siblingCodes.includes(r))
  const formulaBroken = draft.param_type === 'calculated' && draft.formula.trim() !== '' && !isValidFormula(draft.formula)

  return (
    <div className="rounded-lg border border-primary/40 bg-surface-inset p-4 space-y-4">
      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="p-name">Parameter Name <span className="text-destructive">*</span></Label>
          <Input id="p-name" value={draft.name} onChange={e => set({ name: e.target.value })} placeholder="Haemoglobin" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-code">Code</Label>
          <Input
            id="p-code"
            value={draft.code}
            onChange={e => set({ code: e.target.value.toUpperCase() })}
            placeholder="HB"
          />
          <p className="text-[11px] text-muted">Referenced by formulas as {'{HB}'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-type">Type</Label>
          <Select id="p-type" value={draft.param_type} onChange={e => set({ param_type: e.target.value as ParamType })}>
            {(Object.keys(PARAM_TYPE_LABELS) as ParamType[]).map(t => (
              <option key={t} value={t}>{PARAM_TYPE_LABELS[t]}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-unit">Unit</Label>
          <Input id="p-unit" value={draft.unit} onChange={e => set({ unit: e.target.value })} placeholder="g/dL" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-decimals">Decimals</Label>
          <Input
            id="p-decimals" type="number" min={0} max={6}
            value={draft.decimals} onChange={e => set({ decimals: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-order">Order</Label>
          <Input
            id="p-order" type="number"
            value={draft.display_order} onChange={e => set({ display_order: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-group">Sub-heading</Label>
          <Input
            id="p-group" value={draft.group_name}
            onChange={e => set({ group_name: e.target.value })}
            placeholder="DIFFERENTIAL COUNT"
          />
          <p className="text-[11px] text-muted">Printed above this parameter on the report. Leave blank for none.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-method">Method</Label>
          <Input
            id="p-method" value={draft.method}
            onChange={e => set({ method: e.target.value })}
            placeholder="Photometric"
          />
        </div>
      </div>

      {draft.param_type === 'qualitative' && (
        <div className="space-y-2">
          <Label>Options <span className="text-destructive">*</span></Label>
          <div className="flex flex-wrap gap-2">
            {draft.options.map(o => (
              <Badge key={o} variant="outline" className="gap-1.5">
                {o}
                <button type="button" onClick={() => set({ options: draft.options.filter(x => x !== o) })}>
                  <X size={12} />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              className="h-9 w-64 text-xs"
              value=""
              onChange={e => {
                const preset = COMMON_QUALITATIVE_OPTIONS[e.target.value]
                if (preset) set({ options: preset })
              }}
            >
              <option value="">Use a common set…</option>
              {Object.keys(COMMON_QUALITATIVE_OPTIONS).map(k => <option key={k} value={k}>{k}</option>)}
            </Select>
            <OptionAdder onAdd={o => set({ options: [...draft.options, o] })} />
          </div>
        </div>
      )}

      {draft.param_type === 'calculated' && (
        <div className="space-y-1.5">
          <Label htmlFor="p-formula">Formula <span className="text-destructive">*</span></Label>
          <Input
            id="p-formula" value={draft.formula}
            onChange={e => set({ formula: e.target.value })}
            placeholder="{ALB} / ({TP} - {ALB})"
            className={formulaBroken ? 'border-destructive' : ''}
          />
          <p className="text-[11px] text-muted">
            Other parameters of this test by code, in braces. Only + - * / and parentheses.
          </p>
          {formulaBroken && <p className="text-[11px] text-destructive">This formula cannot be parsed.</p>}
          {!formulaBroken && unknownRefs.length > 0 && (
            <p className="text-[11px] text-warning-text">
              No parameter in this test has the code {unknownRefs.join(', ')} yet.
            </p>
          )}
        </div>
      )}

      {/* ── Reference intervals ─────────────────────────────────────────── */}
      {draft.id ? (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <Label>Reference Intervals</Label>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowRangeForm(true)}>
              <Plus size={14} className="mr-1" />Add
            </Button>
          </div>

          {ranges.length === 0 ? (
            <p className="text-xs text-muted">
              None yet. Without an interval, results for this parameter cannot be marked high or low.
            </p>
          ) : (
            <div className="rounded-md border border-border divide-y divide-border">
              {ranges.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="text-foreground">{formatRange(r)}</span>
                    <span className="text-xs text-muted ml-2">
                      {r.gender ? r.gender : 'any sex'}
                      {(r.age_min_years !== null || r.age_max_years !== null) &&
                        ` · ${r.age_min_years ?? 0}–${r.age_max_years ?? '∞'} yrs`}
                      {(r.critical_low !== null || r.critical_high !== null) &&
                        ` · critical ${r.critical_low ?? '—'} / ${r.critical_high ?? '—'}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRange(r.id)}
                    aria-label="Remove interval"
                    className="text-muted hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {showRangeForm && (
            <RangeForm
              parameterId={draft.id}
              paramType={draft.param_type}
              options={draft.options}
              onDone={async () => { setShowRangeForm(false); await loadRanges() }}
              onCancel={() => setShowRangeForm(false)}
            />
          )}
        </div>
      ) : (
        <p className="text-xs text-muted pt-2 border-t border-border">
          Save the parameter to add its reference intervals.
        </p>
      )}

      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button
          type="button" size="sm"
          className="bg-primary hover:bg-primary-hover"
          onClick={save}
          disabled={saving || !draft.name.trim() || formulaBroken}
        >
          {saving ? 'Saving…' : draft.id ? 'Update Parameter' : 'Add Parameter'}
        </Button>
      </div>
    </div>
  )
}

function OptionAdder({ onAdd }: { onAdd: (option: string) => void }) {
  const [text, setText] = useState('')
  return (
    <div className="flex gap-2">
      <Input
        className="h-9 w-40"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Add an option"
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); if (text.trim()) { onAdd(text.trim()); setText('') } }
        }}
      />
      <Button
        type="button" size="sm" variant="outline"
        onClick={() => { if (text.trim()) { onAdd(text.trim()); setText('') } }}
      >
        Add
      </Button>
    </div>
  )
}

function RangeForm({
  parameterId, paramType, options, onDone, onCancel,
}: {
  parameterId: string
  paramType: ParamType
  options: string[]
  onDone: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    range_type: (paramType === 'qualitative' ? 'text' : 'between') as RangeType,
    gender: '',
    age_min_years: '',
    age_max_years: '',
    min_value: '',
    max_value: '',
    text_range: '',
    normal_options: [] as string[],
    critical_low: '',
    critical_high: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch })

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/lab/parameters/${parameterId}/ranges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          gender: form.gender || null,
          normal_options: form.normal_options.length ? form.normal_options : null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to add the interval')
      onDone()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-md border border-border bg-surface p-3 space-y-3">
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="r-type" className="text-xs">Interval type</Label>
          <Select
            id="r-type" className="h-9"
            value={form.range_type}
            onChange={e => set({ range_type: e.target.value as RangeType })}
          >
            {(Object.keys(RANGE_TYPE_LABELS) as RangeType[]).map(t => (
              <option key={t} value={t}>{RANGE_TYPE_LABELS[t]}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r-gender" className="text-xs">Applies to</Label>
          <Select id="r-gender" className="h-9" value={form.gender} onChange={e => set({ gender: e.target.value })}>
            <option value="">Any sex</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="r-agemin" className="text-xs">Age from</Label>
            <Input id="r-agemin" className="h-9" type="number" step="any" value={form.age_min_years}
              onChange={e => set({ age_min_years: e.target.value })} placeholder="any" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-agemax" className="text-xs">Age to</Label>
            <Input id="r-agemax" className="h-9" type="number" step="any" value={form.age_max_years}
              onChange={e => set({ age_max_years: e.target.value })} placeholder="any" />
          </div>
        </div>
      </div>

      {form.range_type === 'text' ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Normal result</Label>
          {options.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {options.map(o => (
                <label key={o} className="flex items-center gap-1.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={form.normal_options.includes(o)}
                    onChange={e => set({
                      normal_options: e.target.checked
                        ? [...form.normal_options, o]
                        : form.normal_options.filter(x => x !== o),
                    })}
                  />
                  {o}
                </label>
              ))}
            </div>
          ) : (
            <Input className="h-9" value={form.text_range} onChange={e => set({ text_range: e.target.value })}
              placeholder="Negative" />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {form.range_type !== 'less_than' && (
            <div className="space-y-1.5">
              <Label htmlFor="r-min" className="text-xs">Minimum</Label>
              <Input id="r-min" className="h-9" type="number" step="any" value={form.min_value}
                onChange={e => set({ min_value: e.target.value })} />
            </div>
          )}
          {form.range_type !== 'greater_than' && (
            <div className="space-y-1.5">
              <Label htmlFor="r-max" className="text-xs">Maximum</Label>
              <Input id="r-max" className="h-9" type="number" step="any" value={form.max_value}
                onChange={e => set({ max_value: e.target.value })} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="r-clow" className="text-xs">Critical low</Label>
            <Input id="r-clow" className="h-9" type="number" step="any" value={form.critical_low}
              onChange={e => set({ critical_low: e.target.value })} placeholder="optional" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-chigh" className="text-xs">Critical high</Label>
            <Input id="r-chigh" className="h-9" type="number" step="any" value={form.critical_high}
              onChange={e => set({ critical_high: e.target.value })} placeholder="optional" />
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted">
        Critical bounds are what mark a result as needing immediate attention. Leave them blank
        if the test has none.
      </p>

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="button" size="sm" className="bg-primary hover:bg-primary-hover" onClick={submit} disabled={saving}>
          {saving ? 'Adding…' : 'Add Interval'}
        </Button>
      </div>
    </div>
  )
}
