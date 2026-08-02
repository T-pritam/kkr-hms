'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { UpdatedStamp } from '@/components/ui/updated-stamp'
import type { CaseSheet } from '@/lib/case-sheet/types'
import { Download, Printer } from 'lucide-react'

/**
 * Read-only rendering of a discharge summary, mirroring the printed PDF.
 *
 * Print uses a scoped stylesheet rather than a bare `window.print()`, which is
 * what the old case sheet and lab report did — that printed the sidebar, the
 * navigation and the modal chrome along with the document.
 */

interface CaseSheetViewModalProps {
  isOpen: boolean
  onClose: () => void
  caseSheet: CaseSheet
  patientName?: string
  onDownload: () => void
}

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #case-sheet-print, #case-sheet-print * { visibility: visible !important; }
  #case-sheet-print {
    position: absolute; left: 0; top: 0; width: 100%;
    padding: 0; color: #000; background: #fff;
  }
  .no-print { display: none !important; }
}
`

const date = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-primary">{title}</h4>
      <div className="text-sm text-foreground whitespace-pre-wrap">{children}</div>
    </section>
  )
}

/** Prints only when there is something to print — no empty headings. */
function TextBlock({ title, value }: { title: string; value: string | null }) {
  if (!value || !value.trim()) return null
  return <Block title={title}>{value}</Block>
}

export function CaseSheetViewModal({
  isOpen,
  onClose,
  caseSheet,
  patientName,
  onDownload,
}: CaseSheetViewModalProps) {
  const vitals = [
    caseSheet.vitals_bp && `BP ${caseSheet.vitals_bp}`,
    caseSheet.vitals_pulse && `Pulse ${caseSheet.vitals_pulse}`,
    caseSheet.vitals_temp && `Temp ${caseSheet.vitals_temp}`,
    caseSheet.vitals_spo2 && `SpO2 ${caseSheet.vitals_spo2}`,
  ].filter(Boolean) as string[]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Discharge summary${caseSheet.summary_no ? ` — ${caseSheet.summary_no}` : ''}`}
      size="xl"
    >
      <style>{PRINT_CSS}</style>

      <div className="space-y-5">
        <div className="no-print flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
            <Printer size={14} className="mr-1.5" />
            Print
          </Button>
          <Button type="button" size="sm" onClick={onDownload}>
            <Download size={14} className="mr-1.5" />
            Download PDF
          </Button>
          {caseSheet.status === 'draft' && (
            <Badge variant="warning" className="self-center">Draft — not finalised</Badge>
          )}
        </div>

        <div id="case-sheet-print" className="space-y-5">
          <header className="space-y-1 border-b border-border pb-4">
            <p className="text-sm font-semibold text-foreground">{patientName || 'Patient'}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
              <span>Admitted: {date(caseSheet.admission_date)}</span>
              <span>Discharged: {date(caseSheet.discharge_date)}</span>
              {caseSheet.ward && <span>Ward: {caseSheet.ward}{caseSheet.bed ? ` / Bed ${caseSheet.bed}` : ''}</span>}
              {caseSheet.condition_on_discharge && <span>Condition: {caseSheet.condition_on_discharge}</span>}
            </div>
          </header>

          {caseSheet.doctors.length > 0 && (
            <Block title="Consulting doctors">
              {caseSheet.doctors
                .map(d => (d.doctor_specialist ? `${d.doctor_name} (${d.doctor_specialist})` : d.doctor_name))
                .join(', ')}
            </Block>
          )}

          <TextBlock title="Chief complaints" value={caseSheet.chief_complaints} />
          <TextBlock title="History of present illness" value={caseSheet.history_present_illness} />
          <TextBlock title="Past history" value={caseSheet.past_history} />
          <TextBlock title="Diagnosis" value={caseSheet.diagnosis} />
          <TextBlock title="Investigations" value={caseSheet.investigations} />
          <TextBlock title="Summary / course in hospital" value={caseSheet.clinical_summary} />

          {vitals.length > 0 && <Block title="Vitals on discharge">{vitals.join('    ')}</Block>}

          {caseSheet.medications.length > 0 && (
            <Block title="Discharge advice — medication">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="pb-1 pr-4 font-medium">Medicine</th>
                      <th className="pb-1 pr-4 font-medium">Dosage</th>
                      <th className="pb-1 pr-4 font-medium">Qty</th>
                      <th className="pb-1 font-medium">Usage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caseSheet.medications.map(med => (
                      <tr key={med.id} className="align-top">
                        <td className="py-1 pr-4 text-foreground">{med.medicine_name}</td>
                        <td className="py-1 pr-4 text-muted">{med.dosage || '—'}</td>
                        <td className="py-1 pr-4 text-muted">{med.quantity || '—'}</td>
                        <td className="py-1 text-muted">{med.usage || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Block>
          )}

          <TextBlock title="Discharge advice" value={caseSheet.advice_notes} />

          {(caseSheet.follow_up_date || caseSheet.follow_up_instructions) && (
            <Block title="Follow-up">
              {caseSheet.follow_up_date && `Review on ${date(caseSheet.follow_up_date)}\n`}
              {caseSheet.follow_up_instructions || ''}
            </Block>
          )}

          <footer className="border-t border-border pt-3 space-y-1">
            <UpdatedStamp by={caseSheet.created_by_name} at={caseSheet.created_at} action="Prepared" />
            <UpdatedStamp by={caseSheet.finalised_by_name} at={caseSheet.finalised_at} action="Finalised" />
          </footer>
        </div>
      </div>
    </Modal>
  )
}
