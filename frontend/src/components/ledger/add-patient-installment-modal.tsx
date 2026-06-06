import { apiFetch } from '@/lib/api'
'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Patient {
  id: string;
  patient_id: string;
  name: string;
}

interface Billing {
  id: string;
  patient_id: string;
  total_charges: string | number;
  patient_paid_amount: string | number;
}

interface AddPatientInstallmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedDate: string;
}

export function AddPatientInstallmentModal({
  isOpen,
  onClose,
  onSuccess,
  selectedDate,
}: AddPatientInstallmentModalProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isCreatingBilling, setIsCreatingBilling] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const billingCreationInProgress = useRef(false);

  const [formData, setFormData] = useState({
    patient_id: '',
    billing_id: '',
    amount: 0,
    payment_date: selectedDate,
    payment_method: 'cash',
    transaction_reference: '',
    remarks: '',
  });

  useEffect(() => {
    if (isOpen) {
      fetchPatients();
      setFormData(prev => ({ ...prev, payment_date: selectedDate }));
    }
  }, [isOpen, selectedDate]);

  useEffect(() => {
    // Filter patients based on search query
    if (searchQuery.trim() === '') {
      setFilteredPatients(patients);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredPatients(
        patients.filter(
          p =>
            p.name.toLowerCase().includes(query) ||
            p.patient_id.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, patients]);

  const fetchPatients = async () => {
    try {
      const response = await apiFetch('/api/patients/active');
      if (response.ok) {
        const data = await response.json();
        setPatients(Array.isArray(data) ? data : []);
        setFilteredPatients(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching patients:', error);
    }
  };

  const fetchBilling = async (patientId: string) => {
    try {
      const response = await apiFetch(`/api/patients/${patientId}/billing`);
      if (response.ok) {
        const data = await response.json();
        // Handle new API response structure with billings array and referral object
        if (data.billings && Array.isArray(data.billings) && data.billings.length > 0) {
          setBilling(data.billings[0]);
          setFormData(prev => ({
            ...prev,
            billing_id: data.billings[0].id,
          }));
        } else if (Array.isArray(data) && data.length > 0) {
          // Fallback for old API response structure
          setBilling(data[0]);
          setFormData(prev => ({
            ...prev,
            billing_id: data[0].id,
          }));
        } else {
          setBilling(null);
        }
      }
    } catch (error) {
      console.error('Error fetching billing:', error);
      setBilling(null);
    }
  };

  const createBilling = async () => {
    // Prevent duplicate creation attempts
    if (isCreatingBilling || billingCreationInProgress.current) {
      console.log('Billing creation already in progress');
      return;
    }

    // Don't create if billing already exists
    if (billing) {
      console.log('Billing already exists:', billing.id);
      return;
    }

    try {
      setIsCreatingBilling(true);
      billingCreationInProgress.current = true;

      const response = await apiFetch(`/api/patients/${formData.patient_id}/billing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_charge: 0,
          referral_commission_amount: 0,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setBilling(data);
        setFormData(prev => ({
          ...prev,
          billing_id: data.id,
        }));
        billingCreationInProgress.current = false;
      } else {
        alert('Failed to create billing record');
        billingCreationInProgress.current = false;
      }
    } catch (error) {
      console.error('Error creating billing:', error);
      alert('Failed to create billing record');
      billingCreationInProgress.current = false;
    } finally {
      setIsCreatingBilling(false);
    }
  };

  const handlePatientSelect = async (patient: Patient) => {
    setFormData(prev => ({
      ...prev,
      patient_id: patient.id,
      billing_id: '',
    }));
    setBilling(null);
    setShowPatientDropdown(false);
    setSearchQuery('');

    // Fetch billing records for selected patient
    await fetchBilling(patient.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.patient_id || !formData.billing_id) {
      alert('Please select patient and billing record');
      return;
    }

    setLoading(true);

    try {
      const response = await apiFetch(
        `/api/patients/${formData.patient_id}/installments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patient_billing_id: formData.billing_id,
            amount: parseFloat(formData.amount.toString()),
            payment_date: formData.payment_date,
            payment_method: formData.payment_method,
            transaction_reference: formData.transaction_reference,
            remarks: formData.remarks,
            create_ledger_entry: true,
          }),
        }
      );

      if (response.ok) {
        alert('Installment added successfully');
        resetForm();
        onClose();
        onSuccess();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to add installment');
      }
    } catch (error) {
      console.error('Error adding installment:', error);
      alert('Failed to add installment');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      patient_id: '',
      billing_id: '',
      amount: 0,
      payment_date: selectedDate,
      payment_method: 'cash',
      transaction_reference: '',
      remarks: '',
    });
    setSearchQuery('');
    setBilling(null);
  };

  const selectedPatient = patients.find(p => p.id === formData.patient_id);

  if (!isOpen) return null;

  const paymentMethods = ['cash', 'upi', 'card', 'bank_transfer', 'cheque'];

  return (
    <div className={`fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4`}>
      <div className={`bg-surface-hover rounded-t-2xl sm:rounded-lg shadow-xl w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] flex flex-col ${showPatientDropdown ? 'min-h-[500px]' : ''}`}>
        {/* Header - Fixed */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-input-border bg-surface-hover flex-shrink-0">
          <h2 className="text-lg sm:text-xl font-semibold text-foreground">Add Patient Installment</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form - Scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Patient Dropdown */}
          <div className="relative">
            <label className="block text-sm font-medium text-muted mb-2">
              Patient *
            </label>
            <div
              onClick={() => setShowPatientDropdown(!showPatientDropdown)}
              className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none cursor-pointer flex items-center justify-between"
            >
              <span>{selectedPatient?.name || 'Select Patient'}</span>
              <Search className="h-4 w-4 text-muted" />
            </div>

            {showPatientDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-surface-inset border border-border rounded-lg shadow-lg z-10">
                <div className="p-2 border-b border-border">
                  <input
                    type="text"
                    placeholder="Search patient name or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    className="w-full bg-surface-inset text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:border-ring"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filteredPatients.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-muted">
                      No patients found
                    </div>
                  ) : (
                    filteredPatients.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => handlePatientSelect(patient)}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-hover transition-colors ${
                          formData.patient_id === patient.id
                            ? 'bg-info text-foreground'
                            : 'text-foreground'
                        }`}
                      >
                        <div className="font-medium">{patient.name}</div>
                        <div className="text-xs text-muted">
                          ID: {patient.patient_id}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Billing Check Section */}
          {formData.patient_id && !billing && (
            <div className="bg-warning-subtle border border-warning/20 rounded-lg p-4 text-center">
              <p className="text-warning-text mb-3">No billing record found for this patient</p>
              <Button
                type="button"
                onClick={createBilling}
                disabled={isCreatingBilling}
                className="w-full"
              >
                {isCreatingBilling ? 'Creating...' : 'Create Billing Record'}
              </Button>
            </div>
          )}

          {/* Payment Form - Only show if billing exists */}
          {billing && (
            <>
              {/* Billing Summary */}
              <div className="bg-info-subtle border border-info/20 rounded-lg p-3">
                <p className="text-info text-sm">
                  Paid: ₹{parseFloat(String(billing.patient_paid_amount) || '0').toFixed(2)}
                </p>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Amount (₹) *
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0.01"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: parseFloat(e.target.value) })
                  }
                  className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                />
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Payment Date *
                </label>
                <input
                  type="date"
                  required
                  value={formData.payment_date}
                  onChange={(e) =>
                    setFormData({ ...formData, payment_date: e.target.value })
                  }
                  className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Payment Method *
                </label>
                <select
                  required
                  value={formData.payment_method}
                  onChange={(e) =>
                    setFormData({ ...formData, payment_method: e.target.value })
                  }
                  className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                >
                  {paymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {method.replace('_', ' ').toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Transaction Reference */}
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Transaction Reference{formData.payment_method === 'upi' && ' *'}
                </label>
                <input
                  type="text"
                  required={formData.payment_method === 'upi'}
                  value={formData.transaction_reference}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      transaction_reference: e.target.value,
                    })
                  }
                  className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                  placeholder="UPI ID / Transaction ID"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Remarks
                </label>
                <textarea
                  rows={2}
                  value={formData.remarks}
                  onChange={(e) =>
                    setFormData({ ...formData, remarks: e.target.value })
                  }
                  className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                />
              </div>

              {/* Buttons - Sticky at bottom */}
              <div className="flex gap-3 pt-4 sticky bottom-0 bg-surface-hover -mx-6 px-6">
                <Button
                  type="submit"
                  disabled={loading || !formData.patient_id || !formData.billing_id || formData.amount <= 0}
                  className="flex-1"
                >
                  {loading ? 'Adding...' : 'Add Installment'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    onClose();
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </>
          )}

          {/* Show buttons only if patient selected but no billing */}
          {formData.patient_id && !billing && (
            <div className="flex gap-3 pt-4 sticky bottom-0 bg-surface-hover -mx-6 px-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetForm();
                  onClose();
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}