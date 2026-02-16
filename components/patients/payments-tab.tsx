'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/use-user';

interface PaymentsTabProps {
  patientId: string;
  billing: any;
  onCreateBilling: () => void;
}

export default function PaymentsTab({ patientId, billing, onCreateBilling }: PaymentsTabProps) {
  const { user } = useUser();
  const [installments, setInstallments] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    amount: 0,
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    transaction_reference: '',
    remarks: '',
    create_ledger_entry: true,
  });

  useEffect(() => {
    if (billing) {
      fetchInstallments();
    }
  }, [billing]);

  const fetchInstallments = async () => {
    try {
      const response = await fetch(`/api/patients/${patientId}/installments?billing_id=${billing.id}`);
      if (response.ok) {
        const data = await response.json();
        setInstallments(data);
      }
    } catch (error) {
      console.error('Error fetching installments:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingId) {
        const response = await fetch(`/api/patients/${patientId}/installments/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (response.ok) {
          await fetchInstallments();
          resetForm();
        } else {
          alert('Failed to update installment');
        }
      } else {
        const response = await fetch(`/api/patients/${patientId}/installments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            patient_billing_id: billing.id,
          }),
        });

        if (response.ok) {
          await fetchInstallments();
          resetForm();
        } else {
          alert('Failed to add installment');
        }
      }
    } catch (error) {
      console.error('Error saving installment:', error);
      alert('Failed to save installment');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (installment: any) => {
    setEditingId(installment.id);
    setFormData({
      amount: parseFloat(installment.amount),
      payment_date: installment.payment_date,
      payment_method: installment.payment_method,
      transaction_reference: installment.transaction_reference || '',
      remarks: installment.remarks || '',
      create_ledger_entry: true,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this installment?')) return;

    try {
      const response = await fetch(`/api/patients/${patientId}/installments/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchInstallments();
      } else {
        alert('Failed to delete installment');
      }
    } catch (error) {
      console.error('Error deleting installment:', error);
      alert('Failed to delete installment');
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      amount: 0,
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'cash',
      transaction_reference: '',
      remarks: '',
      create_ledger_entry: true,
    });
  };

  const canEditOrDelete = (installment: any) => {
    console.log('Checking permissions for installment:', user?.role, user?.id);
    return user?.role === 'ADMIN' || installment.created_by === user?.id;
  };

  console.log(user)

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

  const paymentMethods = ['cash', 'upi', 'card', 'bank_transfer', 'cheque'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-semibold text-white">Payment Installments</h3>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Payment
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Amount (₹) *
              </label>
              <input
                type="number"
                required
                step="0.01"
                min="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Payment Date *
              </label>
              <input
                type="date"
                required
                value={formData.payment_date}
                onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Payment Method *
              </label>
              <select
                required
                value={formData.payment_method}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {method.replace('_', ' ').toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Transaction Reference {formData.payment_method === 'upi' && '*'}
              </label>
              <input
                type="text"
                required={formData.payment_method === 'upi'}
                value={formData.transaction_reference}
                onChange={(e) => setFormData({ ...formData, transaction_reference: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                placeholder="UPI ID / Transaction ID"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Remarks
              </label>
              <textarea
                rows={2}
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : editingId ? 'Update Payment' : 'Save Payment'}
            </button>
            <button
              type="button"
              onClick={resetForm}
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
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">#</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Date</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Method</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Reference</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Remarks</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Created By</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">Amount</th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {installments.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No payments recorded yet
                </td>
              </tr>
            ) : (
              <>
                {installments.map((installment) => (
                  <tr key={installment.id} className="hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-sm text-white">
                      {installment.installment_number}
                    </td>
                    <td className="px-4 py-3 text-sm text-white">
                      {new Date(installment.payment_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-white">
                      {installment.payment_method.toUpperCase()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {installment.transaction_reference || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {installment.remarks || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {installment.users?.username || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-sm text-white text-right font-medium">
                      ₹{parseFloat(installment.amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {canEditOrDelete(installment) && (
                        <div className="flex justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              handleEdit(installment);
                            }}
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={(e) => {
                              handleDelete(installment.id);
                            }}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-700 font-semibold">
                  <td colSpan={6} className="px-4 py-3 text-sm text-white text-right">
                    Total Paid:
                  </td>
                  <td className="px-4 py-3 text-sm text-white text-right">
                    ₹{installments.reduce((sum, i) => sum + parseFloat(i.amount), 0).toFixed(2)}
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
