'use client';

import { useState, useEffect, useMemo } from 'react';
import { FeeStamps } from '@/components/patients/payout-stamps';
import { Check, Download, RefreshCw } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { fetchPatientPDFData, generatePatientPDF } from '@/lib/pdf/patient-pdf';
import { ReferralCommissionBlock } from './referral-commission-block';
import { EditDoctorFeeModal, PayDoctorFeeModal } from '@/components/billing/doctor-fee-modals';
import { UpdatedStamp } from '@/components/ui/updated-stamp';

interface BillingSettlementTabProps {
  patientId: string;
  billing: any;
  onCreateBilling: () => void;
  onBillingUpdate: () => void;
  onSettlementUpdate: () => void;
}

/** Who recorded a row, and — only if it was actually touched again since — who last updated it. */
function RecordedStamp({ record }: { record: any }) {
  return (
    <>
      <UpdatedStamp by={record?.created_by_user?.username} at={record?.created_at} action="Recorded" />
      {record?.updated_at && record.updated_at !== record.created_at && (
        <UpdatedStamp by={record?.updated_by_user?.username} at={record?.updated_at} action="Updated" />
      )}
    </>
  );
}

/** Rupees with paise — money was cut off with parseInt here before (G-19). */
const inr = (value: unknown) =>
  `₹${(Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function BillingSettlementTab({
  patientId,
  billing,
  onCreateBilling,
  onBillingUpdate,
}: BillingSettlementTabProps) {
  const { user } = useUser();
  const [settlements, setSettlements] = useState<any[]>([]);
  const [, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  /** The fee being paid or corrected — the shared forms (components/billing). */
  const [payingFee, setPayingFee] = useState<any>(null);
  const [editingSettlement, setEditingSettlement] = useState<any>(null);
  /** Which "Settled" summaries are expanded to show the individual payments behind them. */
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  /**
   * One card per (doctor, purpose). A doctor settled twice for the same purpose —
   * say two visits paid, then two more recorded and paid again later — produces
   * two settled rows for the same key; they combine into one "Settled" total here
   * rather than reading as duplicates. At most one row can be unsettled for a
   * given key (the database enforces it), so `pendingRow` is never ambiguous.
   */
  const settlementGroups = useMemo(() => {
    const byKey = new Map<
      string,
      {
        key: string;
        doctor: any;
        purpose: any;
        settledRows: any[];
        settledVisits: number;
        settledAmount: number;
        pendingRow: any | null;
      }
    >();

    for (const s of settlements) {
      const key = `${s.doctor_id}::${s.visit_purpose_id ?? ''}`;
      let group = byKey.get(key);
      if (!group) {
        group = {
          key,
          doctor: s.doctor,
          purpose: s.visit_purpose,
          settledRows: [],
          settledVisits: 0,
          settledAmount: 0,
          pendingRow: null,
        };
        byKey.set(key, group);
      }

      if (s.settled) {
        group.settledRows.push(s);
        group.settledVisits += Number(s.visit_count) || 0;
        // What actually left the hospital, not the priced total — they can
        // differ on a partial payment.
        group.settledAmount += Number(s.settlement_amount ?? s.total_amount) || 0;
      } else {
        group.pendingRow = s;
      }
    }

    return [...byKey.values()];
  }, [settlements]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openSettleModal = (settlement: any) => setPayingFee(settlement);

  useEffect(() => {
    if (billing) {
      fetchSettlements();
    }
  }, [billing]);



  const fetchSettlements = async () => {
    try {
      const response = await fetch(`/api/patients/${patientId}/settlements?billing_id=${billing.id}`);
      if (response.ok) {
        const data = await response.json();
        setSettlements(data);
      }
    } catch (error) {
      console.error('Error fetching settlements:', error);
    }
  };

  const handleSyncDoctorVisits = async () => {
    setSyncing(true);
    try {
      const response = await fetch(`/api/patients/${patientId}/settlements/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_id: billing?.id,
        }),
      });

      if (response.ok) {
        await fetchSettlements();
        onBillingUpdate();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to sync doctor visits');
      }
    } catch (error) {
      console.error('Error syncing doctor visits:', error);
      alert('Failed to sync doctor visits');
    } finally {
      setSyncing(false);
    }
  };

  const handleEditSettlement = (settlement: any) => setEditingSettlement(settlement);

  const handleDeleteSettlement = async (settlementId: string) => {
    if (!confirm('Are you sure you want to delete this settlement?')) return;

    setLoading(true);

    try {
      const response = await fetch(`/api/doctor-settlements/${settlementId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soft_delete: false }),
      });

      if (response.ok) {
        await fetchSettlements();
        onBillingUpdate();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to delete settlement');
      }
    } catch (error) {
      console.error('Error deleting settlement:', error);
      alert('Failed to delete settlement');
    } finally {
      setLoading(false);
    }
  };

  if (!billing) {
    return (
      <div className="bg-surface-hover rounded-lg p-8 text-center">
        <p className="text-muted mb-4">No billing record found for this patient</p>
        <button
          onClick={onCreateBilling}
          className="bg-info hover:bg-info-hover text-foreground px-6 py-2 rounded-lg transition-colors"
        >
          Create Billing Record
        </button>
      </div>
    );
  }

  const isAdmin = user?.role === 'ADMIN';

  /**
   * The desk prices and pays what is not settled yet; a settled row is the
   * admin's alone (client revision, 2026-09-24). The API enforces this — these
   * flags only stop us offering a button that would be refused.
   */
  const canPrice = isAdmin || user?.role === 'RECEPTIONIST';

  return (
    <div className="space-y-6">
      {/* Billing Summary */}
      <div className="bg-surface-hover rounded-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <h3 className="text-lg sm:text-xl font-semibold text-foreground">Billing Summary</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  const data = await fetchPatientPDFData(patientId);
                  generatePatientPDF(data);
                } catch { alert('Failed to generate PDF'); }
              }}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-foreground px-4 py-2 rounded-lg transition-colors"
              title="Download Patient Billing PDF"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download PDF</span>
            </button>
          </div>
        </div>

        {/*
          PRD v2 CR-15: charges are internal (services used) and nothing is owed
          against them, so there is no Base Charge and no Balance. The patient's
          total bill is what they paid; doctor fees and the referral commission
          are the patient's expenses, paid out of that money. Paise shown (Q-50).
        */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface-inset rounded-lg p-4">
            <p className="text-muted text-sm">Doctor Fees</p>
            <p className="text-2xl font-bold text-foreground">
              {inr(billing.total_doctor_fees)}
            </p>
            <p className="text-xs text-muted mt-1">An expense of this patient</p>
          </div>
          <div className="bg-surface-inset rounded-lg p-4">
            <p className="text-muted text-sm">Services Used</p>
            <p className="text-2xl font-bold text-foreground">
              {inr(billing.patient_charges_total)}
            </p>
            <p className="text-xs text-muted mt-1">For reference — not billed against</p>
          </div>
          <div className="bg-success rounded-lg p-4">
            <p className="text-success-foreground text-sm">Total Bill (payments received)</p>
            <p className="text-2xl font-bold text-foreground">
              {inr(billing.patient_paid_amount)}
            </p>
          </div>
        </div>
      </div>

      {/* Referral commission — set, save and pay in one place (client, 28 Sep). */}
      <ReferralCommissionBlock
        patientId={patientId}
        billing={billing}
        isAdmin={isAdmin}
        canPrice={canPrice}
        onChanged={onBillingUpdate}
      />

      {/* Doctor Visit Settlements */}
      <div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <h3 className="text-lg sm:text-xl font-semibold text-foreground">Doctor Visit Settlements</h3>
          <div className="flex gap-2">
            {canPrice && (
              <button
                onClick={handleSyncDoctorVisits}
                disabled={syncing}
                className="flex items-center gap-2 bg-success hover:bg-success-hover text-foreground px-3 sm:px-4 py-2 rounded-lg transition-colors disabled:opacity-50 min-h-[44px] text-sm"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Visits'}
              </button>
            )}
          </div>
        </div>

        {/*
          One card per (doctor, purpose) rather than one row per settlement row.
          A doctor settled more than once for the same purpose reads as one
          combined "Settled" total plus at most one "Pending" line, instead of a
          flat list where two payments for the same pair looked like a mistake.
        */}
        {settlementGroups.length === 0 ? (
          <div className="bg-surface-hover rounded-lg p-6 text-center text-muted">
            No settlements created yet
          </div>
        ) : (
          <div className="space-y-3">
            {settlementGroups.map((group) => {
              const isExpanded = expandedGroups.has(group.key);
              const hasHistory = group.settledRows.length > 1;

              return (
                <div key={group.key} className="bg-surface-hover rounded-lg overflow-hidden border border-border">
                  <div className="p-4 border-b border-input-border">
                    <p className="font-medium text-foreground">{group.doctor?.name || 'Unknown doctor'}</p>
                    <p className="text-xs text-muted">
                      {group.purpose?.name || 'No purpose'}
                      {group.doctor?.specialist && ` · ${group.doctor.specialist}`}
                    </p>
                  </div>

                  <div className="divide-y divide-input-border">
                    {group.settledVisits > 0 && (
                      <div>
                        <button
                          onClick={() => hasHistory && toggleGroup(group.key)}
                          className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left ${hasHistory ? 'hover:bg-table-row-hover' : 'cursor-default'}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success-subtle text-success-text">
                              <Check className="h-3 w-3" />
                              Settled
                            </span>
                            <span className="text-sm text-muted">
                              {group.settledVisits} visit{group.settledVisits === 1 ? '' : 's'}
                              {hasHistory && ` · ${group.settledRows.length} payments`}
                            </span>
                          </div>
                          <span className="font-semibold text-foreground">
                            ₹{group.settledAmount}
                          </span>
                        </button>

                        {isExpanded && hasHistory && (
                          <div className="divide-y divide-input-border border-t border-input-border">
                            {group.settledRows.map((s) => (
                              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 pl-8 text-sm">
                                <div>
                                  <span className="text-muted">
                                    {s.settlement_date ? new Date(s.settlement_date).toLocaleDateString() : '—'}
                                  </span>
                                  <FeeStamps settlement={s} />
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-foreground">
                                    {s.visit_count} × ₹{parseInt(s.amount_per_visit || 0)} = ₹{parseInt(s.total_amount || 0)}
                                  </span>
                                  {isAdmin && (
                                    <>
                                      <button
                                        onClick={() => handleEditSettlement(s)}
                                        className="text-info hover:text-info text-xs font-medium"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => handleDeleteSettlement(s.id)}
                                        className="text-destructive hover:text-destructive text-xs font-medium"
                                      >
                                        Delete
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {group.pendingRow && (
                      <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning-subtle text-warning-text">
                              Pending
                            </span>
                            <span className="text-sm text-muted">
                              {group.pendingRow.visit_count} visit{group.pendingRow.visit_count === 1 ? '' : 's'}
                              {Number(group.pendingRow.amount_per_visit) > 0 &&
                                ` · ₹${parseInt(group.pendingRow.amount_per_visit)}/visit`}
                            </span>
                          </div>
                          <RecordedStamp record={group.pendingRow} />
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-foreground">
                            ₹{parseInt(group.pendingRow.total_amount || 0)}
                          </span>
                          {canPrice && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEditSettlement(group.pendingRow)}
                                className="text-info hover:text-info text-sm font-medium"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => openSettleModal(group.pendingRow)}
                                className="text-success-text hover:text-success-text text-sm font-medium"
                              >
                                Settle
                              </button>
                              <button
                                onClick={() => handleDeleteSettlement(group.pendingRow.id)}
                                className="text-destructive hover:text-destructive text-sm font-medium"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mark as Settled Modal */}
      {payingFee && (
        <PayDoctorFeeModal
          fee={payingFee}
          onClose={() => setPayingFee(null)}
          onPaid={async () => {
            setPayingFee(null);
            await fetchSettlements();
            onBillingUpdate();
          }}
        />
      )}

      {editingSettlement && (
        <EditDoctorFeeModal
          fee={editingSettlement}
          onClose={() => setEditingSettlement(null)}
          onSaved={async () => {
            setEditingSettlement(null);
            await fetchSettlements();
            onBillingUpdate();
          }}
        />
      )}
    </div>
  );
}