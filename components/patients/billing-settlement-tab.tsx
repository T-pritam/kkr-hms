'use client';

import { useState, useEffect } from 'react';
import { Plus, Check, DollarSign } from 'lucide-react';

interface BillingSettlementTabProps {
  patientId: string;
  billing: any;
  onCreateBilling: () => void;
  onBillingUpdate: () => void;
}

export default function BillingSettlementTab({
  patientId,
  billing,
  onCreateBilling,
  onBillingUpdate,
}: BillingSettlementTabProps) {
  const [settlements, setSettlements] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [showSettlementForm, setShowSettlementForm] = useState(false);
  const [showReferralForm, setShowReferralForm] = useState(false);
  const [showBaseChargeForm, setShowBaseChargeForm] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [baseChargeData, setBaseChargeData] = useState({
    base_charge: 0,
  });
  const [settlementFormData, setSettlementFormData] = useState({
    doctor_id: '',
    visit_count: 0,
    amount_per_visit: 0,
  });
  const [settleData, setSettleData] = useState({
    settlement_id: '',
    settlement_amount: 0,
    payment_method: 'cash',
    transaction_reference: '',
    settlement_notes: '',
  });
  const [referralData, setReferralData] = useState({
    referral_commission_amount: 0,
    referral_settlement_notes: '',
  });

  useEffect(() => {
    fetchUser();
    fetchDoctors();
    if (billing) {
      fetchSettlements();
    }
  }, [billing]);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setUser(data);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
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

  const handleAddSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/api/patients/${patientId}/settlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settlementFormData,
          patient_billing_id: billing.id,
        }),
      });

      if (response.ok) {
        await fetchSettlements();
        onBillingUpdate();
        setShowSettlementForm(false);
        setSettlementFormData({
          doctor_id: '',
          visit_count: 0,
          amount_per_visit: 0,
        });
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to add settlement');
      }
    } catch (error) {
      console.error('Error adding settlement:', error);
      alert('Failed to add settlement');
    } finally {
      setLoading(false);
    }
  };

  const handleSettlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/api/patients/${patientId}/settlements`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settleData,
          settlement_date: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        await fetchSettlements();
        onBillingUpdate();
        setSettleData({
          settlement_id: '',
          settlement_amount: 0,
          payment_method: 'cash',
          transaction_reference: '',
          settlement_notes: '',
        });
      } else {
        alert('Failed to settle payment');
      }
    } catch (error) {
      console.error('Error settling payment:', error);
      alert('Failed to settle payment');
    } finally {
      setLoading(false);
    }
  };

  const handleReferralCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/api/patients/${patientId}/billing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_id: billing.id,
          referral_commission_amount: referralData.referral_commission_amount,
          referral_settlement_notes: referralData.referral_settlement_notes,
          referral_settled: true,
          referral_settlement_date: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        onBillingUpdate();
        setShowReferralForm(false);
        setReferralData({
          referral_commission_amount: 0,
          referral_settlement_notes: '',
        });
      } else {
        alert('Failed to update referral commission');
      }
    } catch (error) {
      console.error('Error updating referral commission:', error);
      alert('Failed to update referral commission');
    } finally {
      setLoading(false);
    }
  };

  const handleBaseChargeUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/api/patients/${patientId}/billing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_id: billing.id,
          base_charge: baseChargeData.base_charge,
        }),
      });

      if (response.ok) {
        onBillingUpdate();
        setShowBaseChargeForm(false);
      } else {
        alert('Failed to update base charge');
      }
    } catch (error) {
      console.error('Error updating base charge:', error);
      alert('Failed to update base charge');
    } finally {
      setLoading(false);
    }
  };

  if (!billing) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 text-center">
        <p className="text-gray-400 mb-4">No billing record found for this patient</p>
        <button
          onClick={onCreateBilling}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
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
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-white">Billing Summary</h3>
          {isAdmin && (
            <button
              onClick={() => {
                setShowBaseChargeForm(!showBaseChargeForm);
                setBaseChargeData({ base_charge: parseFloat(billing.base_charge || 0) });
              }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              Set Base Charge
            </button>
          )}
        </div>

        {showBaseChargeForm && isAdmin && (
          <form onSubmit={handleBaseChargeUpdate} className="bg-gray-700 rounded-lg p-4 mb-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Base Charge (₹) *
              </label>
              <input
                type="number"
                required
                step="0.01"
                min="0"
                value={baseChargeData.base_charge}
                onChange={(e) => setBaseChargeData({ base_charge: parseFloat(e.target.value) })}
                className="w-full bg-gray-600 text-white rounded-lg px-4 py-2 border border-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Update'}
              </button>
              <button
                type="button"
                onClick={() => setShowBaseChargeForm(false)}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Base Charge</p>
            <p className="text-2xl font-bold text-white">
              ₹{parseFloat(billing.base_charge || 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Doctor Fees</p>
            <p className="text-2xl font-bold text-white">
              ₹{parseFloat(billing.total_doctor_fees || 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Other Charges</p>
            <p className="text-2xl font-bold text-white">
              ₹{parseFloat(billing.patient_charges_total || 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-blue-700 rounded-lg p-4">
            <p className="text-blue-200 text-sm">Total Charges</p>
            <p className="text-2xl font-bold text-white">
              ₹{parseFloat(billing.total_charges || 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-green-700 rounded-lg p-4">
            <p className="text-green-200 text-sm">Total Paid</p>
            <p className="text-2xl font-bold text-white">
              ₹{parseFloat(billing.patient_paid_amount || 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-orange-700 rounded-lg p-4">
            <p className="text-orange-200 text-sm">Balance</p>
            <p className="text-2xl font-bold text-white">
              ₹{(parseFloat(billing.total_charges || 0) - parseFloat(billing.patient_paid_amount || 0)).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Doctor Visit Settlements */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-white">Doctor Visit Settlements</h3>
          <button
            onClick={() => setShowSettlementForm(!showSettlementForm)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Settlement
          </button>
        </div>

        {showSettlementForm && (
          <form onSubmit={handleAddSettlement} className="bg-gray-800 rounded-lg p-6 mb-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Doctor *
                </label>
                <select
                  required
                  value={settlementFormData.doctor_id}
                  onChange={(e) => setSettlementFormData({ ...settlementFormData, doctor_id: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select Doctor</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Visit Count *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={settlementFormData.visit_count}
                  onChange={(e) => setSettlementFormData({ ...settlementFormData, visit_count: parseInt(e.target.value) })}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Amount per Visit (₹) *
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0"
                  value={settlementFormData.amount_per_visit}
                  onChange={(e) => setSettlementFormData({ ...settlementFormData, amount_per_visit: parseFloat(e.target.value) })}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between bg-gray-700 rounded-lg p-4">
              <span className="text-gray-400">Total Amount:</span>
              <span className="text-2xl font-bold text-white">
                ₹{(settlementFormData.visit_count * settlementFormData.amount_per_visit).toFixed(2)}
              </span>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Add Settlement'}
              </button>
              <button
                type="button"
                onClick={() => setShowSettlementForm(false)}
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Doctor</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-300">Visits</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">Per Visit</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">Total</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-300">Status</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {settlements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No settlements created yet
                  </td>
                </tr>
              ) : (
                settlements.map((settlement) => (
                  <tr key={settlement.id} className="hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-sm text-white">
                      {settlement.doctor?.name}
                      {settlement.doctor?.specialist && (
                        <span className="text-gray-400 text-xs block">
                          {settlement.doctor.specialist}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-white text-center">
                      {settlement.visit_count}
                    </td>
                    <td className="px-4 py-3 text-sm text-white text-right">
                      ₹{parseFloat(settlement.amount_per_visit).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-white text-right font-medium">
                      ₹{parseFloat(settlement.total_amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {settlement.settled ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                          <Check className="h-3 w-3" />
                          Settled
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!settlement.settled && isAdmin && (
                        <button
                          onClick={() => {
                            setSettleData({
                              settlement_id: settlement.id,
                              settlement_amount: parseFloat(settlement.total_amount),
                              payment_method: 'cash',
                              transaction_reference: '',
                              settlement_notes: '',
                            });
                          }}
                          className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                        >
                          Settle Payment
                        </button>
                      )}
                      {settlement.settled && (
                        <div className="text-xs text-gray-400">
                          {new Date(settlement.settlement_date).toLocaleDateString()}
                          <br />
                          ₹{parseFloat(settlement.settlement_amount).toFixed(2)}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settlement Form Modal */}
      {settleData.settlement_id && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <form onSubmit={handleSettlePayment} className="bg-gray-800 rounded-lg p-6 w-full max-w-md space-y-4">
            <h4 className="text-xl font-semibold text-white">Settle Doctor Payment</h4>
            
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Settlement Amount (₹) *
              </label>
              <input
                type="number"
                required
                step="0.01"
                min="0"
                value={settleData.settlement_amount}
                onChange={(e) => setSettleData({ ...settleData, settlement_amount: parseFloat(e.target.value) })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Payment Method *
              </label>
              <select
                required
                value={settleData.payment_method}
                onChange={(e) => setSettleData({ ...settleData, payment_method: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                <option value="cash">CASH</option>
                <option value="upi">UPI</option>
                <option value="card">CARD</option>
                <option value="bank_transfer">BANK TRANSFER</option>
                <option value="cheque">CHEQUE</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Transaction Reference
              </label>
              <input
                type="text"
                value={settleData.transaction_reference}
                onChange={(e) => setSettleData({ ...settleData, transaction_reference: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Notes
              </label>
              <textarea
                rows={3}
                value={settleData.settlement_notes}
                onChange={(e) => setSettleData({ ...settleData, settlement_notes: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Confirm Settlement'}
              </button>
              <button
                type="button"
                onClick={() => setSettleData({
                  settlement_id: '',
                  settlement_amount: 0,
                  payment_method: 'cash',
                  transaction_reference: '',
                  settlement_notes: '',
                })}
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Referral Commission */}
      {isAdmin && (
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-white">Referral Commission</h3>
            {!billing.referral_settled && (
              <button
                onClick={() => setShowReferralForm(!showReferralForm)}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <DollarSign className="h-4 w-4" />
                Set Commission
              </button>
            )}
          </div>

          {billing.referral_settled ? (
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Commission Amount</p>
                  <p className="text-2xl font-bold text-white">
                    ₹{parseFloat(billing.referral_commission_amount || 0).toFixed(2)}
                  </p>
                  {billing.referral_settlement_notes && (
                    <p className="text-sm text-gray-400 mt-2">{billing.referral_settlement_notes}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                    <Check className="h-3 w-3" />
                    Settled
                  </span>
                  <p className="text-xs text-gray-400 mt-1">
                    {billing.referral_settlement_date && new Date(billing.referral_settlement_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          ) : showReferralForm ? (
            <form onSubmit={handleReferralCommission} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Commission Amount (₹) *
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0"
                  value={referralData.referral_commission_amount}
                  onChange={(e) => setReferralData({ ...referralData, referral_commission_amount: parseFloat(e.target.value) })}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Notes
                </label>
                <textarea
                  rows={3}
                  value={referralData.referral_settlement_notes}
                  onChange={(e) => setReferralData({ ...referralData, referral_settlement_notes: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Commission'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowReferralForm(false)}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center text-gray-400 py-4">
              No referral commission set
            </div>
          )}
        </div>
      )}
    </div>
  );
}
