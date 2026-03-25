'use client';

import { useState, useEffect } from 'react';
import { Plus, Check, DollarSign, Edit2, Trash2, X } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { ReferralSelect } from './referral-select';

interface BillingSettlementTabProps {
  patientId: string;
  billing: any;
  onCreateBilling: () => void;
  onBillingUpdate: () => void;
  onSettlementUpdate: () => void;
}

export default function BillingSettlementTab({
  patientId,
  billing,
  onCreateBilling,
  onBillingUpdate,
  onSettlementUpdate,
}: BillingSettlementTabProps) {
  const { user } = useUser();
  const [settlements, setSettlements] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [showChargesForm, setShowChargesForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [chargesData, setChargesData] = useState({
    base_charge: 0,
    referral_commission_amount: 0,
    referral_settlement_notes: '',
    referral_id: '',
  });
  const [referrals, setReferrals] = useState<any[]>([]);
  const [settleData, setSettleData] = useState({
    settlement_id: '',
    settlement_amount: 0,
    payment_method: 'cash',
    transaction_reference: '',
    settlement_notes: '',
    settlement_type: 'regular',
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
  const [settlePricingComplete, setSettlePricingComplete] = useState(false);
  const [showSettleReferralModal, setShowSettleReferralModal] = useState(false);
  const [settleReferralData, setSettleReferralData] = useState({
    payment_method: 'cash',
    transaction_reference: '',
    settlement_notes: '',
  });

  useEffect(() => {
    fetchDoctors();
    fetchReferrals();
    if (billing) {
      fetchSettlements();
    }
  }, [billing]);

  const fetchReferrals = async () => {
    try {
      const response = await fetch('/api/referrals');
      if (response.ok) {
        const data = await response.json();
        setReferrals(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching referrals:', error);
    }
  };

  const fetchDoctors = async () => {
    try {
      const response = await fetch('/api/doctors');
      if (response.ok) {
        const data = await response.json();
        setDoctors(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching doctors:', error);
    }
  };

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
        const data = await response.json();
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
      amount_per_visit: parseFloat(settlement.amount_per_visit || 0),
      total_amount: parseFloat(settlement.total_amount || 0),
      visit_count: settlement.visit_count || 0,
      settlement_type: settlement.settlement_type || 'regular',
      notes: settlement.settlement_notes || '',
    });
  };

  const handlePricingModeChange = (mode: 'per_visit' | 'total') => {
    setEditFormData(prev => ({
      ...prev,
      pricing_mode: mode,
    }));
  };

  const handleSettlePricingModeChange = (mode: 'per_visit' | 'total') => {
    setSettlePricingData(prev => ({
      ...prev,
      pricing_mode: mode,
    }));
  };

  const handlePriceChange = (field: 'amount_per_visit' | 'total_amount' | 'visit_count', value: number) => {
    setEditFormData(prev => {
      const updated = { ...prev, [field]: value };

      // Auto-calculate based on pricing mode
      if (prev.pricing_mode === 'per_visit' && (field === 'amount_per_visit' || field === 'visit_count')) {
        updated.total_amount = updated.amount_per_visit * updated.visit_count;
      } else if (prev.pricing_mode === 'total' && (field === 'total_amount' || field === 'visit_count')) {
        updated.amount_per_visit = updated.visit_count > 0 ? updated.total_amount / updated.visit_count : 0;
      }

      return updated;
    });
  };

  const handleSettlePriceChange = (field: 'amount_per_visit' | 'total_amount' | 'visit_count', value: number) => {
    setSettlePricingData(prev => {
      const updated = { ...prev, [field]: value };

      // Auto-calculate based on pricing mode
      if (prev.pricing_mode === 'per_visit' && (field === 'amount_per_visit' || field === 'visit_count')) {
        updated.total_amount = updated.amount_per_visit * updated.visit_count;
      } else if (prev.pricing_mode === 'total' && (field === 'total_amount' || field === 'visit_count')) {
        updated.amount_per_visit = updated.visit_count > 0 ? updated.total_amount / updated.visit_count : 0;
      }

      return updated;
    });
    // Update settlement amount automatically
    const updatedData = { ...settleData };
    if (field === 'total_amount' || (field === 'amount_per_visit' && settlePricingData.pricing_mode === 'per_visit') || (field === 'visit_count')) {
      updatedData.settlement_amount = field === 'total_amount' ? value : settlePricingData.pricing_mode === 'per_visit' ? settlePricingData.amount_per_visit * (field === 'visit_count' ? value : settlePricingData.visit_count) : settlePricingData.total_amount;
      setSettleData(updatedData);
    }
  };

  const handleConfirmSettlePricing = async () => {
    if (settlePricingData.visit_count <= 0 || settlePricingData.amount_per_visit <= 0 || settlePricingData.total_amount <= 0) {
      alert('Please fill in all pricing details');
      return;
    }

    // Update settlement with pricing details
    setLoading(true);
    try {
      const response = await fetch(`/api/doctor-settlements/${settleData.settlement_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pricing_mode: settlePricingData.pricing_mode,
          amount_per_visit: settlePricingData.amount_per_visit,
          total_amount: settlePricingData.total_amount,
          visit_count: settlePricingData.visit_count,
        }),
      });

      if (response.ok) {
        // Update settlement amount to match total_amount
        setSettleData(prev => ({
          ...prev,
          settlement_amount: settlePricingData.total_amount,
        }));
        setSettlePricingComplete(true);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to save pricing');
      }
    } catch (error) {
      console.error('Error saving pricing:', error);
      alert('Failed to save pricing');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSettlement) return;

    setLoading(true);

    try {
      const response = await fetch(`/api/doctor-settlements/${editingSettlement.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pricing_mode: editFormData.pricing_mode,
          amount_per_visit: editFormData.amount_per_visit,
          total_amount: editFormData.total_amount,
          visit_count: editFormData.visit_count,
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

  const handleMarkAsSettled = async () => {
    if (!settleData.settlement_id) return;

    setLoading(true);

    try {
      const response = await fetch(`/api/doctor-settlements/${settleData.settlement_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settled: true,
          settlement_amount: settleData.settlement_amount,
          payment_method: settleData.payment_method,
          transaction_reference: settleData.transaction_reference,
          settlement_notes: settleData.settlement_notes,
        }),
      });

      if (response.ok) {
        await fetchSettlements();
        onBillingUpdate();
        setShowSettleModal(false);
        setSettleData({
          settlement_id: '',
          settlement_amount: 0,
          payment_method: 'cash',
          transaction_reference: '',
          settlement_notes: '',
          settlement_type: 'regular',
        });
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to settle payment');
      }
    } catch (error) {
      console.error('Error settling payment:', error);
      alert('Failed to settle payment');
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
          referral_settlement_payment_method: settleReferralData.payment_method,
          referral_settlement_transaction_ref: settleReferralData.transaction_reference,
          referral_settlement_notes: settleReferralData.settlement_notes,
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

  const handleUpdateCharges = async (
    e?: React.FormEvent | null,
    isDelete = false
  ) => {
    if (e) e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/api/patients/${patientId}/billing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_id: billing.id,
          base_charge: isDelete ? 0 : chargesData.base_charge,
          referral_id: isDelete ? null : chargesData.referral_id,
          referral_commission_amount: isDelete ? 0 : chargesData.referral_commission_amount,
        }),
      });

      if (response.ok) {
        onBillingUpdate();
        setShowChargesForm(false);
        setChargesData({
          base_charge: 0,
          referral_commission_amount: 0,
          referral_settlement_notes: '',
          referral_id: '',
        });
      } else {
        alert('Failed to update charges');
      }
    } catch (error) {
      console.error('Error updating charges:', error);
      alert('Failed to update charges');
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

  return (
    <div className="space-y-6">
      {/* Billing Summary */}
      <div className="bg-surface-hover rounded-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <h3 className="text-lg sm:text-xl font-semibold text-foreground">Billing Summary</h3>
          {isAdmin && (
            <button
              onClick={() => {
                setShowChargesForm(!showChargesForm);
                setChargesData({
                  base_charge: parseFloat(billing.base_charge || 0),
                  referral_commission_amount: parseFloat(billing.referral_commission_amount || 0),
                  referral_settlement_notes: billing.referral_settlement_notes || '',
                  referral_id: billing.referral?.id || '',
                });
              }}
              className="flex items-center gap-2 bg-info hover:bg-info-hover text-foreground px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              Set Charges
            </button>
          )}
        </div>

        {showChargesForm && isAdmin && (
          <form onSubmit={handleUpdateCharges} className="bg-surface-inset rounded-lg p-4 mb-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Base Charge (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={chargesData.base_charge}
                onChange={(e) => setChargesData({ ...chargesData, base_charge: parseFloat(e.target.value) })}
                className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
              />
            </div>

            <div>
              <ReferralSelect
                value={chargesData.referral_id}
                onChange={(value) => setChargesData({ ...chargesData, referral_id: value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Referral Commission (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={chargesData.referral_commission_amount}
                onChange={(e) => setChargesData({ ...chargesData, referral_commission_amount: parseFloat(e.target.value) })}
                className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-success hover:bg-success-hover text-foreground px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Charges'}
              </button>
              <button
                type="submit"
                disabled={loading}
                onClick={() => handleUpdateCharges(null, true)}
                className="bg-destructive hover:bg-success-hover text-foreground px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={() => setShowChargesForm(false)}
                className="bg-surface-inset hover:bg-surface-inset text-foreground px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface-inset rounded-lg p-4">
            <p className="text-muted text-sm">Base Charge</p>
            <p className="text-2xl font-bold text-foreground">
              ₹{parseFloat(billing.base_charge || 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-surface-inset rounded-lg p-4">
            <p className="text-muted text-sm">Referral Person</p>
            <p className="text-sm text-foreground">
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
              ₹{parseFloat(billing.referral_commission_amount || 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-surface-inset rounded-lg p-4">
            <p className="text-muted text-sm">Doctor Fees</p>
            <p className="text-2xl font-bold text-foreground">
              ₹{parseFloat(billing.total_doctor_fees || 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-surface-inset rounded-lg p-4">
            <p className="text-muted text-sm">Other Charges</p>
            <p className="text-2xl font-bold text-foreground">
              ₹{parseFloat(billing.patient_charges_total || 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-info rounded-lg p-4">
            <p className="text-info-foreground text-sm">Total Charges</p>
            <p className="text-2xl font-bold text-foreground">
              ₹{parseFloat(billing.total_charges || 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-success rounded-lg p-4">
            <p className="text-success-foreground text-sm">Total Paid</p>
            <p className="text-2xl font-bold text-foreground">
              ₹{parseFloat(billing.patient_paid_amount || 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-primary rounded-lg p-4">
            <p className="text-primary-foreground text-sm">Balance</p>
            <p className="text-2xl font-bold text-foreground">
              ₹{(parseFloat(billing.total_charges || 0) - parseFloat(billing.patient_paid_amount || 0)).toFixed(2)}
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
                ₹{parseFloat(billing.referral_commission_amount || 0).toFixed(2)}
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
            {isAdmin && (
              <button
                onClick={handleSyncDoctorVisits}
                disabled={syncing}
                className="flex items-center gap-2 bg-success hover:bg-success-hover text-foreground px-3 sm:px-4 py-2 rounded-lg transition-colors disabled:opacity-50 min-h-[44px] text-sm"
              >
                {syncing ? 'Syncing...' : '🔄 Sync Visits'}
              </button>
            )}
          </div>
        </div>

        {/* Desktop Table */}
        <div className="bg-surface-hover rounded-lg overflow-hidden hidden md:block">
          <table className="w-full">
            <thead className="bg-surface-inset">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Patient</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Doctor</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-foreground">Visits</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-foreground">Per Visit</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-foreground">Total</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-foreground">Status</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-input-border">
              {settlements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    No settlements created yet
                  </td>
                </tr>
              ) : (
                settlements.map((settlement) => (
                  <tr key={settlement.id} className="hover:bg-table-row-hover">
                    <td className="px-4 py-3 text-sm text-foreground">
                      {settlement.patient?.name || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {settlement.doctor?.name}
                      {settlement.doctor?.specialist && (
                        <span className="text-muted text-xs block">
                          {settlement.doctor.specialist}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-center">
                      {settlement.visit_count}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-right">
                      ₹{parseFloat(settlement.amount_per_visit).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-right font-medium">
                      ₹{parseFloat(settlement.total_amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {settlement.settled ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-success-subtle text-success-text">
                          <Check className="h-3 w-3" />
                          Settled
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-warning-subtle text-warning-text">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => handleEditSettlement(settlement)}
                              className="text-info hover:text-info text-sm font-medium"
                              title="Edit"
                            >
                              Edit
                            </button>
                            {!settlement.settled && (
                              <button
                                onClick={() => {
                                  setSettlePricingData({
                                    pricing_mode: settlement.pricing_mode || 'per_visit',
                                    amount_per_visit: parseFloat(settlement.amount_per_visit || 0),
                                    total_amount: parseFloat(settlement.total_amount || 0),
                                    visit_count: settlement.visit_count || 0,
                                  });
                                  setSettlePricingComplete(false);
                                  setSettleData({
                                    settlement_id: settlement.id,
                                    settlement_amount: parseFloat(settlement.total_amount),
                                    payment_method: 'cash',
                                    transaction_reference: '',
                                    settlement_notes: '',
                                    settlement_type: settlement.settlement_type || 'regular',
                                  });
                                  setShowSettleModal(true);
                                }}
                                className="text-success-text hover:text-success-text text-sm font-medium"
                                title="Settle"
                              >
                                Settle
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteSettlement(settlement.id)}
                              className="text-destructive hover:text-destructive text-sm font-medium"
                              title="Delete"
                            >
                              Delete
                            </button>
                          </>
                        )}
                        {!isAdmin && settlement.settled && (
                          <div className="text-xs text-muted">
                            {new Date(settlement.settlement_date).toLocaleDateString()}
                            <br />
                            ₹{parseFloat(settlement.settlement_amount).toFixed(2)}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-3">
          {settlements.length === 0 ? (
            <div className="bg-surface-hover rounded-lg p-6 text-center text-muted">
              No settlements created yet
            </div>
          ) : (
            settlements.map((settlement) => (
              <div key={settlement.id} className="bg-surface-hover rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{settlement.doctor?.name}</p>
                    {settlement.doctor?.specialist && (
                      <p className="text-xs text-muted">{settlement.doctor.specialist}</p>
                    )}
                  </div>
                  {settlement.settled ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success-subtle text-success-text ml-2">
                      <Check className="h-3 w-3" />
                      Settled
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning-subtle text-warning-text ml-2">
                      Pending
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-surface-inset rounded p-2 text-center">
                    <p className="text-muted">Visits</p>
                    <p className="font-semibold text-foreground">{settlement.visit_count}</p>
                  </div>
                  <div className="bg-surface-inset rounded p-2 text-center">
                    <p className="text-muted">Per Visit</p>
                    <p className="font-semibold text-foreground">₹{parseFloat(settlement.amount_per_visit).toFixed(0)}</p>
                  </div>
                  <div className="bg-surface-inset rounded p-2 text-center">
                    <p className="text-muted">Total</p>
                    <p className="font-semibold text-foreground">₹{parseFloat(settlement.total_amount).toFixed(0)}</p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-3 pt-2 border-t border-input-border">
                    <button
                      onClick={() => handleEditSettlement(settlement)}
                      className="text-info text-sm font-medium min-h-[44px] flex items-center"
                    >
                      Edit
                    </button>
                    {!settlement.settled && (
                      <button
                        onClick={() => {
                          setSettlePricingData({
                            pricing_mode: settlement.pricing_mode || 'per_visit',
                            amount_per_visit: parseFloat(settlement.amount_per_visit || 0),
                            total_amount: parseFloat(settlement.total_amount || 0),
                            visit_count: settlement.visit_count || 0,
                          });
                          setSettlePricingComplete(false);
                          setSettleData({
                            settlement_id: settlement.id,
                            settlement_amount: parseFloat(settlement.total_amount),
                            payment_method: 'cash',
                            transaction_reference: '',
                            settlement_notes: '',
                            settlement_type: settlement.settlement_type || 'regular',
                          });
                          setShowSettleModal(true);
                        }}
                        className="text-success-text text-sm font-medium min-h-[44px] flex items-center"
                      >
                        Settle
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteSettlement(settlement.id)}
                      className="text-destructive text-sm font-medium min-h-[44px] flex items-center"
                    >
                      Delete
                    </button>
                  </div>
                )}
                {!isAdmin && settlement.settled && (
                  <div className="text-xs text-muted pt-2 border-t border-input-border">
                    Settled: {new Date(settlement.settlement_date).toLocaleDateString()} — ₹{parseFloat(settlement.settlement_amount).toFixed(2)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Mark as Settled Modal */}
      {showSettleModal && settleData.settlement_id && (
        <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-surface-hover rounded-t-2xl sm:rounded-lg p-4 sm:p-6 w-full sm:max-w-2xl space-y-4 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xl font-semibold text-foreground">
                {!settlePricingComplete ? 'Set Consultation Fee' : 'Complete Settlement'}
              </h4>
              <button
                type="button"
                onClick={() => {
                  setShowSettleModal(false);
                  setSettlePricingComplete(false);
                  setSettleData({
                    settlement_id: '',
                    settlement_amount: 0,
                    payment_method: 'cash',
                    transaction_reference: '',
                    settlement_notes: '',
                    settlement_type: 'regular',
                  });
                }}
                className="text-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!settlePricingComplete ? (
              // STEP 1: Add Consultation Fee
              <div className="space-y-4">
                <h5 className="text-lg font-semibold text-foreground">Add Consultation Fee</h5>

                {settlements.find(s => s.id === settleData.settlement_id) && (
                  <div className="bg-surface-inset rounded-lg p-4">
                    <p className="text-muted text-sm mb-1">Doctor</p>
                    <p className="text-foreground font-medium">
                      {settlements.find(s => s.id === settleData.settlement_id)?.doctor?.name}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Pricing Mode
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleSettlePricingModeChange('per_visit')}
                      className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors ${settlePricingData.pricing_mode === 'per_visit'
                          ? 'bg-info text-foreground'
                          : 'bg-surface-inset text-foreground hover:bg-surface-hover'
                        }`}
                    >
                      Price per Visit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSettlePricingModeChange('total')}
                      className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors ${settlePricingData.pricing_mode === 'total'
                          ? 'bg-info text-foreground'
                          : 'bg-surface-inset text-foreground hover:bg-surface-hover'
                        }`}
                    >
                      Total Price
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Visit Count *
                  </label>
                  <input
                    type="number"
                    required
                    readOnly
                    value={settlePricingData.visit_count}
                    onChange={(e) => handleSettlePriceChange('visit_count', parseInt(e.target.value) || 0)}
                    className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                  />
                </div>

                {settlePricingData.pricing_mode === 'per_visit' ? (
                  <div>
                    <label className="block text-sm font-medium text-muted mb-2">
                      Amount Per Visit (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0"
                      value={settlePricingData.amount_per_visit}
                      onChange={(e) => handleSettlePriceChange('amount_per_visit', parseFloat(e.target.value) || 0)}
                      className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-muted mb-2">
                      Total Amount (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0"
                      value={settlePricingData.total_amount}
                      onChange={(e) => handleSettlePriceChange('total_amount', parseFloat(e.target.value) || 0)}
                      className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                    />
                  </div>
                )}

                <div className="bg-info rounded-lg p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-info-foreground">Price per Visit:</span>
                    <span className="text-foreground font-medium">₹{settlePricingData.amount_per_visit.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-info-foreground">Total Amount:</span>
                    <span className="text-foreground font-bold text-lg">₹{settlePricingData.total_amount.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleConfirmSettlePricing}
                    disabled={loading}
                    className="flex-1 bg-success hover:bg-success-hover text-foreground px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Confirm & Continue to Settlement'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSettleModal(false);
                      setSettlePricingComplete(false);
                      setSettleData({
                        settlement_id: '',
                        settlement_amount: 0,
                        payment_method: 'cash',
                        transaction_reference: '',
                        settlement_notes: '',
                        settlement_type: 'regular',
                      });
                    }}
                    className="bg-surface-inset hover:bg-surface-inset text-foreground px-6 py-2 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // STEP 2: Complete Settlement
              <div className="space-y-4">
                {/* Fee Summary */}
                <div className="bg-surface-inset rounded-lg p-4 space-y-2">
                  <h5 className="text-lg font-semibold text-foreground mb-3">Consultation Fee Summary</h5>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Price per Visit:</span>
                    <span className="text-foreground font-medium">₹{settlePricingData.amount_per_visit.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Visit Count:</span>
                    <span className="text-foreground font-medium">{settlePricingData.visit_count}</span>
                  </div>
                  <div className="border-t border-border pt-2 mt-2 flex justify-between">
                    <span className="text-foreground font-semibold">Total Amount:</span>
                    <span className="text-info font-bold text-lg">₹{settlePricingData.total_amount.toFixed(2)}</span>
                  </div>
                </div>

                {/* Settlement Form */}
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Settlement Amount (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    value={settleData.settlement_amount}
                    onChange={(e) => setSettleData({ ...settleData, settlement_amount: parseFloat(e.target.value) })}
                    className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                  />
                  <p className="text-xs text-muted mt-1">Should match total amount: ₹{settlePricingData.total_amount.toFixed(2)}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Payment Method *
                  </label>
                  <select
                    required
                    value={settleData.payment_method}
                    onChange={(e) => setSettleData({ ...settleData, payment_method: e.target.value })}
                    className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                  >
                    <option value="cash">CASH</option>
                    <option value="upi">UPI</option>
                    <option value="card">CARD</option>
                    <option value="bank_transfer">BANK TRANSFER</option>
                    <option value="cheque">CHEQUE</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Transaction Reference
                  </label>
                  <input
                    type="text"
                    value={settleData.transaction_reference}
                    onChange={(e) => setSettleData({ ...settleData, transaction_reference: e.target.value })}
                    className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    value={settleData.settlement_notes}
                    onChange={(e) => setSettleData({ ...settleData, settlement_notes: e.target.value })}
                    className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleMarkAsSettled}
                    disabled={loading}
                    className="flex-1 bg-success hover:bg-success-hover text-foreground px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Processing...' : 'Mark as Settled'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettlePricingComplete(false)}
                    className="bg-surface-inset hover:bg-surface-inset text-foreground px-6 py-2 rounded-lg transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Settlement Modal */}
      {editingSettlement && (
        <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4">
          <form onSubmit={handleUpdateSettlement} className="bg-surface-hover rounded-t-2xl sm:rounded-lg p-4 sm:p-6 w-full sm:max-w-md space-y-4 max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xl font-semibold text-foreground">Edit Settlement</h4>
              <button
                type="button"
                onClick={() => setEditingSettlement(null)}
                className="text-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Doctor
              </label>
              <input
                type="text"
                disabled
                value={editingSettlement.doctor?.name || ''}
                className="w-full bg-surface-inset text-muted-foreground rounded-lg px-4 py-2 border border-border cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Pricing Mode
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handlePricingModeChange('per_visit')}
                  className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors ${editFormData.pricing_mode === 'per_visit'
                      ? 'bg-info text-foreground'
                      : 'bg-surface-inset text-foreground hover:bg-surface-hover'
                    }`}
                >
                  Price per Visit
                </button>
                <button
                  type="button"
                  onClick={() => handlePricingModeChange('total')}
                  className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors ${editFormData.pricing_mode === 'total'
                      ? 'bg-info text-foreground'
                      : 'bg-surface-inset text-foreground hover:bg-surface-hover'
                    }`}
                >
                  Total Price
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Visit Count *
              </label>
              <input
                type="number"
                required
                min="1"
                value={editFormData.visit_count}
                readOnly
                className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
              />
            </div>

            {editFormData.pricing_mode === 'per_visit' ? (
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Amount Per Visit (₹) *
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0"
                  value={editFormData.amount_per_visit}
                  onChange={(e) => handlePriceChange('amount_per_visit', parseFloat(e.target.value) || 0)}
                  className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Total Amount (₹) *
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0"
                  value={editFormData.total_amount}
                  onChange={(e) => handlePriceChange('total_amount', parseFloat(e.target.value) || 0)}
                  className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                />
              </div>
            )}

            <div className="bg-surface-inset rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Price per Visit:</span>
                <span className="text-foreground font-medium">₹{editFormData.amount_per_visit.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Total Amount:</span>
                <span className="text-foreground font-medium">₹{editFormData.total_amount.toFixed(2)}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Settlement Type
              </label>
              <select
                value={editFormData.settlement_type}
                onChange={(e) => setEditFormData({ ...editFormData, settlement_type: e.target.value })}
                className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
              >
                <option value="regular">REGULAR</option>
                <option value="partial">PARTIAL</option>
                <option value="adjustment">ADJUSTMENT</option>
                <option value="refund">REFUND</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Notes
              </label>
              <textarea
                rows={2}
                value={editFormData.notes}
                onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
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
              <button
                type="button"
                onClick={() => setShowSettleReferralModal(false)}
                className="text-muted hover:text-foreground"
              >
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
                <span className="text-foreground font-medium">₹{parseFloat(billing?.referral_commission_amount || 0).toFixed(2)}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Payment Method *
              </label>
              <select
                required
                value={settleReferralData.payment_method}
                onChange={(e) => setSettleReferralData({ ...settleReferralData, payment_method: e.target.value })}
                className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
              >
                <option value="cash">CASH</option>
                <option value="upi">UPI</option>
                <option value="card">CARD</option>
                <option value="bank_transfer">BANK TRANSFER</option>
                <option value="cheque">CHEQUE</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Transaction Reference
              </label>
              <input
                type="text"
                value={settleReferralData.transaction_reference}
                onChange={(e) => setSettleReferralData({ ...settleReferralData, transaction_reference: e.target.value })}
                className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Notes
              </label>
              <textarea
                rows={2}
                value={settleReferralData.settlement_notes}
                onChange={(e) => setSettleReferralData({ ...settleReferralData, settlement_notes: e.target.value })}
                className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
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

    </div>
  );
}
