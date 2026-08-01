'use client'

import { useState, useEffect, useCallback } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ParameterEditor, emptyParameter, type ParameterDraft } from './parameter-editor'
import { TEST_CATEGORIES, SAMPLE_TYPES, PARAM_TYPE_LABELS } from '@/lib/lab/constants'
import { formatRange } from '@/lib/lab/ranges'
import { Plus, Pencil, Trash2, AlertCircle } from 'lucide-react'

interface TestEditorModalProps {
  isOpen: boolean
  /** null creates a new test. */
  testId: string | null
  onClose: () => void
  onSaved: () => void
}

interface StoredParameter {
  id: string
  name: string
  code: string | null
  unit: string | null
  param_type: 'numeric' | 'qualitative' | 'calculated'
  method: string | null
  group_name: string | null
  decimals: number
  display_order: number
  options: string[] | null
  formula: string | null
  is_active: boolean
  ranges: any[]
}

const emptyTest = {
  name: '', code: '', category: '', sample_type: '', method: '',
  price: '', description: '', interpretation_template: '', is_active: true,
}

/**
 * One screen for a test and everything under it.
 *
 * This replaces the old two-step flow — create the test in one modal, then
 * reopen a separate "manage parameters" modal from a gear icon — which meant a
 * newly created test always started with zero parameters and an empty
 * result-entry screen.
 */
export function TestEditorModal({ isOpen, testId, onClose, onSaved }: TestEditorModalProps) {
  const [test, setTest] = useState({ ...emptyTest })
  const [savedTestId, setSavedTestId] = useState<string | null>(testId)
  const [parameters, setParameters] = useState<StoredParameter[]>([])
  const [draft, setDraft] = useState<ParameterDraft | null>(null)
  const [loading, setLoading] = useState(false)
  const [savingTest, setSavingTest] = useState(false)
  const [error, setError] = useState('')

  const loadTest = useCallback(async () => {
    if (!testId) { setTest({ ...emptyTest }); setSavedTestId(null); setParameters([]); return }
    setLoading(true)
    try {
      const [testRes, paramRes] = await Promise.all([
        fetch(`/api/lab-tests/${testId}`).then(r => r.json()),
        fetch(`/api/lab-tests/${testId}/parameters`).then(r => r.json()),
      ])
      if (testRes.success) {
        const t = testRes.data
        setTest({
          name: t.name ?? '',
          code: t.code ?? '',
          category: t.category ?? '',
          sample_type: t.sample_type ?? '',
          method: t.method ?? '',
          price: String(t.price ?? ''),
          description: t.description ?? '',
          interpretation_template: t.interpretation_template ?? '',
          is_active: t.is_active !== false,
        })
        setSavedTestId(t.id)
      }
      if (paramRes.success) setParameters(paramRes.data)
    } catch (err) {
      console.error('Failed to load the test:', err)
    } finally {
      setLoading(false)
    }
  }, [testId])

  useEffect(() => {
    if (!isOpen) return
    setError('')
    setDraft(null)
    void loadTest()
  }, [isOpen, loadTest])

  const reloadParameters = async () => {
    if (!savedTestId) return
    const res = await fetch(`/api/lab-tests/${savedTestId}/parameters`).then(r => r.json())
    if (res.success) setParameters(res.data)
  }

  const saveTest = async () => {
    setSavingTest(true)
    setError('')
    try {
      const payload = {
        ...test,
        name: test.name.trim(),
        code: test.code.trim().toUpperCase(),
        price: Number(test.price) || 0,
      }

      const res = savedTestId
        ? await fetch(`/api/lab-tests/${savedTestId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/lab-tests', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })

      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save the test')

      setSavedTestId(json.data.id)
      onSaved()
      return json.data.id as string
    } catch (err: any) {
      setError(err.message)
      return null
    } finally {
      setSavingTest(false)
    }
  }

  const removeParameter = async (parameter: StoredParameter) => {
    if (!confirm(`Remove "${parameter.name}" from this test?`)) return
    const res = await fetch(`/api/test-parameters/${parameter.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok || !json.success) { setError(json.error || 'Failed to remove the parameter'); return }
    if (json.message) setError('')
    await reloadParameters()
  }

  const startEdit = (parameter: StoredParameter) => {
    setDraft({
      id: parameter.id,
      name: parameter.name ?? '',
      code: parameter.code ?? '',
      unit: parameter.unit ?? '',
      param_type: parameter.param_type ?? 'numeric',
      method: parameter.method ?? '',
      group_name: parameter.group_name ?? '',
      decimals: String(parameter.decimals ?? 2),
      display_order: String(parameter.display_order ?? 0),
      options: parameter.options ?? [],
      formula: parameter.formula ?? '',
      is_active: parameter.is_active !== false,
    })
  }

  const siblingCodes = parameters.map(p => p.code).filter(Boolean) as string[]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={testId ? 'Edit Test' : 'New Test'}
      description="Define the test, then the parameters and reference intervals it reports."
      size="full"
    >
      {loading ? (
        <div className="py-12 text-center text-muted">Loading…</div>
      ) : (
        <div className="space-y-6">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Test ─────────────────────────────────────────────────────── */}
          <section className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="t-name">Test Name <span className="text-destructive">*</span></Label>
                <Input id="t-name" value={test.name} onChange={e => setTest({ ...test, name: e.target.value })}
                  placeholder="Complete Blood Count" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-code">Test Code <span className="text-destructive">*</span></Label>
                <Input id="t-code" value={test.code}
                  onChange={e => setTest({ ...test, code: e.target.value.toUpperCase() })} placeholder="CBC" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="t-category">Department</Label>
                <Select id="t-category" value={test.category} onChange={e => setTest({ ...test, category: e.target.value })}>
                  <option value="">Not set</option>
                  {TEST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-sample">Specimen</Label>
                <Select id="t-sample" value={test.sample_type} onChange={e => setTest({ ...test, sample_type: e.target.value })}>
                  <option value="">Not set</option>
                  {SAMPLE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-method">Method</Label>
                <Input id="t-method" value={test.method} onChange={e => setTest({ ...test, method: e.target.value })}
                  placeholder="Automated Cell Counter" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-price">Price (Rs.) <span className="text-destructive">*</span></Label>
                <Input id="t-price" type="number" min={0} step="0.01" value={test.price}
                  onChange={e => setTest({ ...test, price: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="t-desc">Description</Label>
                <Textarea id="t-desc" rows={2} value={test.description}
                  onChange={e => setTest({ ...test, description: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-interp">Default Interpretation</Label>
                <Textarea id="t-interp" rows={2} value={test.interpretation_template}
                  onChange={e => setTest({ ...test, interpretation_template: e.target.value })}
                  placeholder="Offered as a starting point when results are entered" />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={test.is_active}
                  onChange={e => setTest({ ...test, is_active: e.target.checked })} />
                Available to order
              </label>
              <Button
                type="button"
                className="bg-primary hover:bg-primary-hover"
                onClick={saveTest}
                disabled={savingTest || !test.name.trim() || !test.code.trim() || test.price === ''}
              >
                {savingTest ? 'Saving…' : savedTestId ? 'Save Test' : 'Create Test'}
              </Button>
            </div>
          </section>

          {/* ── Parameters ───────────────────────────────────────────────── */}
          <section className="space-y-3 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Parameters {parameters.length > 0 && <span className="text-muted font-normal">({parameters.length})</span>}
                </h3>
                <p className="text-xs text-muted">These are the lines that appear on the report.</p>
              </div>
              <Button
                type="button" size="sm" variant="outline"
                disabled={!savedTestId || !!draft}
                onClick={() => setDraft({ ...emptyParameter, display_order: String(parameters.length) })}
              >
                <Plus size={14} className="mr-1" />Add Parameter
              </Button>
            </div>

            {!savedTestId ? (
              <p className="text-sm text-muted">Create the test first, then add its parameters.</p>
            ) : parameters.length === 0 && !draft ? (
              <p className="text-sm text-muted">
                No parameters yet. A test with none produces an empty result-entry screen and a blank report.
              </p>
            ) : (
              <div className="rounded-lg border border-border divide-y divide-border">
                {parameters.map(p => (
                  <div key={p.id} className="flex items-start gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-foreground">{p.name}</span>
                        {p.code && <Badge variant="outline">{p.code}</Badge>}
                        {p.param_type !== 'numeric' && (
                          <Badge variant="info">{PARAM_TYPE_LABELS[p.param_type]}</Badge>
                        )}
                        {!p.is_active && <Badge variant="outline">Retired</Badge>}
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        {p.group_name && <span className="mr-2">{p.group_name} ·</span>}
                        {p.unit || 'no unit'}
                        {p.ranges?.length > 0
                          ? ` · ${p.ranges.map((r: any) => formatRange(r)).join(' | ')}`
                          : ' · no reference interval'}
                        {p.formula && ` · ${p.formula}`}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button type="button" onClick={() => startEdit(p)} aria-label={`Edit ${p.name}`}
                        className="p-1.5 text-muted hover:text-foreground">
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => removeParameter(p)} aria-label={`Remove ${p.name}`}
                        className="p-1.5 text-muted hover:text-destructive">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {draft && savedTestId && (
              <ParameterEditor
                testId={savedTestId}
                draft={draft}
                siblingCodes={siblingCodes}
                onChange={setDraft}
                onSaved={async () => { setDraft(null); await reloadParameters() }}
                onCancel={() => setDraft(null)}
              />
            )}
          </section>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
