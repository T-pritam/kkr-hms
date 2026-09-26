'use client';

import { useState, useEffect, useMemo } from 'react';
import { CommissionStamps, FeeStamps } from '@/components/patients/payout-stamps';
import { GivenByPicker } from '@/components/finances/given-by-picker';
import { Plus, Check, X, Download, RefreshCw } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { fetchPatientPDFData, generatePatientPDF } from '@/lib/pdf/patient-pdf';
import { SetChargesModal } from './set-charges-modal';
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
  const [showSetCharges, setShowSetCharges] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleData, setSettleData] = useState({
    settlement_id: '',
    settlement_amount: 0,
    payment_method: 'cash',
    transaction_reference: '',
    settlement_notes: '',
    settlement_type: 'regular',
    given_by: '',
    given_by_user_id: null as string | null,
  });
  const [syncing, setSyncing] = useState(false);
  const [editingSettlement, setEditingSettlement] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({
    pricing_mode: 'per_visit' as 'per_visit' | 'total',
    amount_per_visit: 0,
    total_amount: 0,
    visit_count: 0,
    settlement_type: 'regular',
    notes: '',
  });
  const [settlePricingData, setSettlePricingData] = useState({
    pricing_mode: 'per_visit' as 'per_visit' | 'total',
    amount_per_visit: 0,
    total_amount: 0,
    visit_count: 0,
  });
  const [showSettleNote, setShowSettleNote] = useState(false);
  const [showSettleReferralModal, setShowSettleReferralModal] = useState(false);
  const [settleReferralData, setSettleReferralData] = useState({
    payment_method: 'cash',
    transaction_reference: '',
    settlement_notes: '',
    given_by: '',
    given_by_user_id: null as string | null,
  });
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

  /**
   * Opens the settle-pricing step for a pending row. The desk types what this
   * doctor is being paid for these visits. There is no rate card to suggest
   * from: the same doctor charges differently for a consultation and for a
   * surgery, and per procedure within each, so a fixed rate was dropped as
   * misleading (Q-97, 2026-09-25).
   */
  const openSettleModal = (settlement: any) => {
    const amountPerVisit = parseInt(settlement.amount_per_visit || 0);
    const totalAmount = parseInt(settlement.total_amount || 0);

    setSettlePricingData({
      pricing_mode: 'per_visit',
      amount_per_visit: amountPerVisit,
      total_amount: totalAmount,
      visit_count: settlement.visit_count || 0,
    });
    setShowSettleNote(false);
    setSettleData({
      settlement_id: settlement.id,
      settlement_amount: totalAmount,
      payment_method: 'cash',
      transaction_reference: '',
      settlement_notes: '',
      settlement_type: settlement.settlement_type || 'regular',
      given_by: '',
    given_by_user_id: null as string | null,
    });
    setShowSettleModal(true);
  };

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

  const handleEditSettlement = (settlement: any) => {
    setEditingSettlement(settlement);
    setEditFormData({
      pricing_mode: 'per_visit',
      amount_per_visit: parseInt(settlement.amount_per_visit || 0),
      total_amount: parseInt(settlement.total_amount || 0),
      visit_count: settlement.visit_count || 0,
      settlement_type: settlement.settlement_type || 'regular',
      notes: settlement.settlement_notes || '',
    });
  };

  const handlePricingModeChange = (mode: 'per_visit' | 'total') => {
    setEditFormData(prev => ({ ...prev, pricing_mode: mode }));
  };

  const handleSettlePricingModeChange = (mode: 'per_visit' | 'total') => {
    setSettlePricingData(prev => ({ ...prev, pricing_mode: mode }));
  };

  const handlePriceChange = (field: 'amount_per_visit' | 'total_amount' | 'visit_count', value: number) => {
    setEditFormData(prev => {
      const updated = { ...prev, [field]: value };
      if (prev.pricing_mode === 'per_visit' && (field === 'amount_per_visit' || field === 'visit_count')) {
        updated.total_amount = updated.amount_per_visit * updated.visit_count;
      } else if (prev.pricing_mode === 'total' && (field === 'total_amount' || field === 'visit_count')) {
        updated.amount_per_visit = updated.visit_count > 0 ? Math.floor(updated.total_amount / updated.visit_count) : 0;
      }
      return updated;
    });
  };

  const handleSettlePriceChange = (field: 'amount_per_visit' | 'total_amount' | 'visit_count', value: number) => {
    setSettlePricingData(prev => {
      const updated = { ...prev, [field]: value };
      if (prev.pricing_mode === 'per_visit' && (field === 'amount_per_visit' || field === 'visit_count')) {
        updated.total_amount = updated.amount_per_visit * updated.visit_count;
      } else if (prev.pricing_mode === 'total' && (field === 'total_amount' || field === 'visit_count')) {
        updated.amount_per_visit = updated.visit_count > 0 ? Math.floor(updated.total_amount / updated.visit_count) : 0;
      }
      return updated;
    });
    const updatedData = { ...settleData };
    if (field === 'total_amount' || (field === 'amount_per_visit' && settlePricingData.pricing_mode === 'per_visit') || (field === 'visit_count')) {
      updatedData.settlement_amount = field === 'total_amount' ? value : settlePricingData.pricing_mode === 'per_visit' ? settlePricingData.amount_per_visit * (field === 'visit_count' ? value : settlePricingData.visit_count) : settlePricingData.total_amount;
      setSettleData(updatedData);
    }
  };

  const handleUpdateSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSettlement) return;

    setLoading(true);

    try {
      // Same reasoning as the settle-pricing call above: visit_count is not this
      // form's to set.
      const response = await fetch(`/api/doctor-settlements/${editingSettlement.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pricing_mode: editFormData.pricing_mode,
          amount_per_visit: editFormData.amount_per_visit,
          total_amount: editFormData.total_amount,
          settlement_type: editFormData.settlement_type,
          settlement_notes: editFormData.notes,
        }),
      });

      if (response.ok) {
        await fetchSettlements();
        onBillingUpdate();
        setEditingSettlement(null);
        setEditFormData({
          pricing_mode: 'per_visit',
          amount_per_visit: 0,
          total_amount: 0,
          visit_count: 0,
          settlement_type: 'regular',
          notes: '',
        });
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update settlement');
      }
    } catch (error) {
      console.error('Error updating settlement:', error);
      alert('Failed to update settlement');
    } finally {
      setLoading(false);
    }
  };

  /**
   * One step (client, 26 Sep): save the price if it changed, then pay the fee
   * in full. What is paid is the fee — the separate "settlement amount" that
   * had to match it is gone.
   */
  const handlePayDoctorFee = async () => {
    if (!settleData.settlement_id) return;
    const { amount_per_visit, total_amount, visit_count, pricing_mode } = settlePricingData;
    if (visit_count <= 0 || amount_per_visit <= 0 || total_amount <= 0) {
      alert('Enter the fee first');
      return;
    }

    setLoading(true);
    try {
      const stored = settlements.find(s => s.id === settleData.settlement_id);
      const priceChanged =
        !stored ||
        Number(stored.total_amount) !== total_amount ||
        Number(stored.amount_per_visit) !== amount_per_visit;

      if (priceChanged) {
        // No visit_count: the API derives it from the visits linked to the row.
        const priced = await fetch(`/api/doctor-settlements/${settleData.settlement_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pricing_mode, amount_per_visit, total_amount }),
        });
        if (!priced.ok) {
          const error = await priced.json().catch(() => ({}));
          alert(error.error || 'Failed to save the fee');
          return;
        }
      }

      const response = await fetch(`/api/doctor-settlements/${settleData.settlement_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settled: true,
          settlement_amount: total_amount,
          payment_method: settleData.payment_method,
          transaction_reference: settleData.payment_method === 'cash' ? '' : settleData.transaction_reference,
          settlement_notes: settleData.settlement_notes,
          given_by: settleData.given_by,
          given_by_user_id: settleData.given_by_user_id,
        }),
      });

      if (response.ok) {
        await fetchSettlements();
        onBillingUpdate();
        setShowSettleModal(false);
        setShowSettleNote(false);
        setSettleData({ settlement_id: '', settlement_amount: 0, payment_method: 'cash', transaction_reference: '', settlement_notes: '', settlement_type: 'regular', given_by: '', given_by_user_id: null });
      } else {
        const error = await response.json().catch(() => ({}));
        alert(error.error || 'Failed to pay the fee');
        // The price may already be saved; show it.
        if (priceChanged) await fetchSettlements();
      }
    } catch (error) {
      console.error('Error paying the doctor fee:', error);
      alert('Failed to pay the fee');
    } finally {
      setLoading(false);
    }
  };

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

  const handleSettleReferralCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billing?.referral?.id || billing?.referral_commission_amount <= 0) return;

    setLoading(true);

    try {
      const response = await fetch(`/api/patients/${patientId}/billing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_id: billing.id,
          referral_settled: true,
          referral_settlement_date: new Date().toISOString(),
          referral_settlement_payment_method: settleReferralData.payment_method,
          referral_settlement_transaction_ref: settleReferralData.transaction_reference,
          referral_settlement_notes: settleReferralData.settlement_notes,
          referral_settlement_given_by: settleReferralData.given_by,
          referral_given_by_user_id: settleReferralData.given_by_user_id,
        }),
      });

      if (response.ok) {
        alert('Referral commission settlement recorded successfully');
        onBillingUpdate();
        setShowSettleReferralModal(false);
        setSettleReferralData({
          payment_method: 'cash',
          transaction_reference: '',
          settlement_notes: '',
          given_by: '',
    given_by_user_id: null as string | null,
        });
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to settle referral commission');
      }
    } catch (error) {
      console.error('Error settling referral commission:', error);
      alert('Failed to settle referral commission');
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
  const commissionSettled = Boolean(billing?.referral_settled);

  // Shared input class for the inline number inputs in modals
  const numInputClass = "w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none";

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
            {(isAdmin || (canPrice && !commissionSettled)) && (
              <button
                onClick={() => setShowSetCharges(true)}
                className="flex items-center gap-2 bg-info hover:bg-info-hover text-foreground px-4 py-2 rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
                Referral & Commission
              </button>
            )}
            {!isAdmin && canPrice && commissionSettled && (
              <span className="self-center text-xs text-muted">
                Commission paid — only an admin can change it now
              </span>
            )}
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
            <p className="text-muted text-sm">Referral Person</p>
            <p className="text-2xl text-foreground">
              {billing.referral?.name || 'Not set'}
            </p>
            {billing.referral?.phone && (
              <p className="text-xs text-muted mt-1">
                {billing.referral.phone}
              </p>
            )}
          </div>
          <div className="bg-surface-inset rounded-lg p-4">
            <p className="text-muted text-sm">Referral Commission</p>
            <p className="text-2xl font-bold text-foreground">
              {inr(billing.referral_commission_amount)}
            </p>
            {Number(billing.referral_commission_amount || 0) > 0 && (
              <p className="text-xs text-muted mt-1">An expense of this patient — paid out of their payments</p>
            )}
          </div>
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

      {/* Referral Commission Settlement */}
      {billing.referral?.id && (
        <div className="bg-surface-hover rounded-lg p-6">
          <h3 className="text-xl font-semibold text-foreground mb-4">Referral Commission Settlement</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-surface-inset rounded-lg p-4">
              <p className="text-muted text-sm">Referral</p>
              <p className="text-foreground font-medium">{billing.referral?.name || 'N/A'}</p>
            </div>
            <div className="bg-surface-inset rounded-lg p-4">
              <p className="text-muted text-sm">Commission Amount</p>
              <p className="text-2xl font-bold text-foreground">
                ₹{parseInt(billing.referral_commission_amount || 0)}
              </p>
            </div>
            <div className="bg-surface-inset rounded-lg p-4">
              <p className="text-muted text-sm">Status</p>
              {billing.referral_settled ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-success-subtle text-success-text mt-2">
                  <Check className="h-3 w-3" />
                  Settled
                </span>
              ) : (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-warning-subtle text-warning-text mt-2">
                  Pending
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3 mb-4 text-sm">
            <CommissionStamps billing={billing} />
            <RecordedStamp record={billing} />
          </div>

          {!billing.referral_settled && (
            <button
              onClick={() => setShowSettleReferralModal(true)}
              className="bg-primary hover:bg-primary-hover text-foreground px-6 py-2 rounded-lg transition-colors"
            >
              Settle Referral Commission
            </button>
          )}
        </div>
      )}

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
      {showSettleModal && settleData.settlement_id && (() => {
        /**
         * Pay a doctor's fee — one small form (client, 26 Sep). It used to be
         * two steps: price, confirm, then pay, with the price summary shown
         * twice and a "settlement amount" that had to equal the total anyway.
         * Now the fee is what is paid; the price is saved first only if it
         * changed.
         */
        const row = settlements.find(s => s.id === settleData.settlement_id);
        const visits = settlePricingData.visit_count || 0;
        const total = settlePricingData.total_amount || 0;
        const needsReference = settleData.payment_method !== 'cash';
        const close = () => {
          setShowSettleModal(false);
          setShowSettleNote(false);
          setSettleData({ settlement_id: '', settlement_amount: 0, payment_method: 'cash', transaction_reference: '', settlement_notes: '', settlement_type: 'regular', given_by: '', given_by_user_id: null });
        };
        return (
          <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4">
            <form
              onSubmit={e => { e.preventDefault(); void handlePayDoctorFee(); }}
              className="bg-surface-hover rounded-t-2xl sm:rounded-lg p-4 sm:p-6 w-full sm:max-w-md space-y-4 max-h-[95vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-lg font-semibold text-foreground">Pay {row?.doctor?.name || 'the doctor'}</h4>
                  <p className="text-sm text-muted">{visits} visit{visits === 1 ? '' : 's'}</p>
                </div>
                <button type="button" onClick={close} className="text-muted hover:text-foreground" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* The fee: per visit × visits, or a total typed straight in. */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <label htmlFor="settle-amount" className="text-sm text-muted w-20 shrink-0">
                    {settlePricingData.pricing_mode === 'per_visit' ? 'Per visit' : 'Total'}
                  </label>
                  <input
                    id="settle-amount"
                    type="text"
                    inputMode="numeric"
                    required
                    autoFocus
                    value={settlePricingData.pricing_mode === 'per_visit' ? settlePricingData.amount_per_visit : settlePricingData.total_amount}
                    onFocus={e => e.target.select()}
                    onChange={e => {
                      if (!/^\d*$/.test(e.target.value)) return;
                      const n = parseInt(e.target.value) || 0;
                      handleSettlePriceChange(settlePricingData.pricing_mode === 'per_visit' ? 'amount_per_visit' : 'total_amount', n);
                    }}
                    className={`${numInputClass} w-28`}
                  />
                  {settlePricingData.pricing_mode === 'per_visit' ? (
                    <span className="text-sm text-muted whitespace-nowrap">× {visits} = <span className="font-semibold text-foreground">₹{total.toLocaleString('en-IN')}</span></span>
                  ) : (
                    <span className="text-sm text-muted whitespace-nowrap">for {visits} visit{visits === 1 ? '' : 's'}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleSettlePricingModeChange(settlePricingData.pricing_mode === 'per_visit' ? 'total' : 'per_visit')}
                  className="text-xs text-info hover:underline pl-[5.5rem]"
                >
                  {settlePricingData.pricing_mode === 'per_visit' ? 'or type the total instead' : 'or price it per visit'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="settle-mode" className="block text-sm text-muted mb-1">Paid by</label>
                  <select
                    id="settle-mode"
                    required
                    value={settleData.payment_method}
                    onChange={e => setSettleData({ ...settleData, payment_method: e.target.value })}
                    className={numInputClass}
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                {needsReference && (
                  <div>
                    <label htmlFor="settle-ref" className="block text-sm text-muted mb-1">
                      Reference{settleData.payment_method === 'upi' ? ' *' : ''}
                    </label>
                    <input
                      id="settle-ref"
                      type="text"
                      required={settleData.payment_method === 'upi'}
                      value={settleData.transaction_reference}
                      onChange={e => setSettleData({ ...settleData, transaction_reference: e.target.value })}
                      className={numInputClass}
                    />
                  </div>
                )}
              </div>

              {/* A picked user is a record; a typed name is for someone with no
                  login. Defaults to whoever is paying. */}
              <GivenByPicker
                value={{ given_by_user_id: settleData.given_by_user_id, given_by: settleData.given_by }}
                onChange={next =>
                  setSettleData({ ...settleData, given_by_user_id: next.given_by_user_id, given_by: next.given_by })
                }
              />

              {showSettleNote ? (
                <textarea
                  rows={2}
                  placeholder="Note"
                  value={settleData.settlement_notes}
                  onChange={e => setSettleData({ ...settleData, settlement_notes: e.target.value })}
                  className={numInputClass}
                />
              ) : (
                <button type="button" onClick={() => setShowSettleNote(true)} className="text-sm text-info hover:underline">
                  + Add a note
                </button>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={loading || total <= 0}
                  className="flex-1 bg-success hover:bg-success-hover text-foreground px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? 'Paying…' : `Pay ₹${total.toLocaleString('en-IN')}`}
                </button>
                <button type="button" onClick={close} className="bg-surface-inset text-foreground px-6 py-2 rounded-lg">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        );
      })()}

      {/* Edit Settlement Modal */}
      {editingSettlement && (
        <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4">
          <form onSubmit={handleUpdateSettlement} className="bg-surface-hover rounded-t-2xl sm:rounded-lg p-4 sm:p-6 w-full sm:max-w-md space-y-4 max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xl font-semibold text-foreground">Edit Settlement</h4>
              <button type="button" onClick={() => setEditingSettlement(null)} className="text-muted hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">Doctor</label>
              <input
                type="text"
                disabled
                value={editingSettlement.doctor?.name || ''}
                className="w-full bg-surface-inset text-muted-foreground rounded-lg px-4 py-2 border border-border cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">Pricing Mode</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handlePricingModeChange('per_visit')}
                  className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors ${editFormData.pricing_mode === 'per_visit' ? 'bg-info text-foreground' : 'bg-surface-inset text-foreground hover:bg-surface-hover'}`}
                >
                  Price per Visit
                </button>
                <button
                  type="button"
                  onClick={() => handlePricingModeChange('total')}
                  className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors ${editFormData.pricing_mode === 'total' ? 'bg-info text-foreground' : 'bg-surface-inset text-foreground hover:bg-surface-hover'}`}
                >
                  Total Price
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">Visit Count *</label>
              <input
                type="text"
                inputMode="numeric"
                required
                readOnly
                value={editFormData.visit_count}
                className={numInputClass}
              />
            </div>

            {editFormData.pricing_mode === 'per_visit' ? (
              <div>
                <label className="block text-sm font-medium text-muted mb-2">Amount Per Visit (₹) *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={editFormData.amount_per_visit}
                  onFocus={e => e.target.select()}
                  onChange={e => {
                    if (/^\d*$/.test(e.target.value))
                      handlePriceChange('amount_per_visit', parseInt(e.target.value) || 0);
                  }}
                  className={numInputClass}
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-muted mb-2">Total Amount (₹) *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={editFormData.total_amount}
                  onFocus={e => e.target.select()}
                  onChange={e => {
                    if (/^\d*$/.test(e.target.value))
                      handlePriceChange('total_amount', parseInt(e.target.value) || 0);
                  }}
                  className={numInputClass}
                />
              </div>
            )}

            <div className="bg-surface-inset rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Price per Visit:</span>
                <span className="text-foreground font-medium">₹{editFormData.amount_per_visit}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Total Amount:</span>
                <span className="text-foreground font-medium">₹{editFormData.total_amount}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">Settlement Type</label>
              <select
                value={editFormData.settlement_type}
                onChange={e => setEditFormData({ ...editFormData, settlement_type: e.target.value })}
                className={numInputClass}
              >
                <option value="regular">REGULAR</option>
                <option value="partial">PARTIAL</option>
                <option value="adjustment">ADJUSTMENT</option>
                <option value="refund">REFUND</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">Notes</label>
              <textarea
                rows={2}
                value={editFormData.notes}
                onChange={e => setEditFormData({ ...editFormData, notes: e.target.value })}
                className={numInputClass}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-success hover:bg-success-hover text-foreground px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Updating...' : 'Update Settlement'}
              </button>
              <button
                type="button"
                onClick={() => setEditingSettlement(null)}
                className="bg-surface-inset hover:bg-surface-inset text-foreground px-6 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Settle Referral Commission Modal */}
      {showSettleReferralModal && (
        <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4">
          <form onSubmit={handleSettleReferralCommission} className="bg-surface-hover rounded-t-2xl sm:rounded-lg p-4 sm:p-6 w-full sm:max-w-md space-y-4 max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xl font-semibold text-foreground">Settle Referral Commission</h4>
              <button type="button" onClick={() => setShowSettleReferralModal(false)} className="text-muted hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-surface-inset rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Referral:</span>
                <span className="text-foreground font-medium">{billing?.referral?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Commission Amount:</span>
                <span className="text-foreground font-medium">₹{parseInt(billing?.referral_commission_amount || 0)}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">Payment Method *</label>
              <select
                required
                value={settleReferralData.payment_method}
                onChange={e => setSettleReferralData({ ...settleReferralData, payment_method: e.target.value })}
                className={numInputClass}
              >
                <option value="cash">CASH</option>
                <option value="upi">UPI</option>
                <option value="card">CARD</option>
                <option value="bank_transfer">BANK TRANSFER</option>
                <option value="cheque">CHEQUE</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">Transaction Reference</label>
              <input
                type="text"
                value={settleReferralData.transaction_reference}
                onChange={e => setSettleReferralData({ ...settleReferralData, transaction_reference: e.target.value })}
                className={numInputClass}
              />
            </div>

            <GivenByPicker
              value={{
                given_by_user_id: settleReferralData.given_by_user_id,
                given_by: settleReferralData.given_by,
              }}
              onChange={next =>
                setSettleReferralData({
                  ...settleReferralData,
                  given_by_user_id: next.given_by_user_id,
                  given_by: next.given_by,
                })
              }
            />

            <div>
              <label className="block text-sm font-medium text-muted mb-2">Notes</label>
              <textarea
                rows={2}
                value={settleReferralData.settlement_notes}
                onChange={e => setSettleReferralData({ ...settleReferralData, settlement_notes: e.target.value })}
                className={numInputClass}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-success hover:bg-success-hover text-foreground px-6 py-2 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Recording...' : 'Record Settlement'}
              </button>
              <button
                type="button"
                onClick={() => setShowSettleReferralModal(false)}
                className="bg-surface-inset hover:bg-surface-inset text-foreground px-6 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <SetChargesModal
        isOpen={showSetCharges}
        onClose={() => setShowSetCharges(false)}
        patientId={patientId}
        billing={billing}
        onSuccess={onBillingUpdate}
      />
    </div>
  );
}