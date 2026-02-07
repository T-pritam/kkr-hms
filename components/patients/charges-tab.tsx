'use client';

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useUser } from '@/hooks/use-user';

interface ChargesTabProps {
  patientId: string;
  billing: any;
  onCreateBilling: () => void;
}

export default function ChargesTab({ patientId, billing, onCreateBilling }: ChargesTabProps) {
  const { user } = useUser();
  const [charges, setCharges] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    charge_type: '',
    description: '',
    amount: 0,
    charge_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (billing) {
      fetchCharges();
    }
  }, [billing]);

  const fetchCharges = async () => {
    try {
      const response = await fetch(`/api/patients/${patientId}/charges?billing_id=${billing.id}`);
      if (response.ok) {
        const data = await response.json();
        setCharges(data);
      }
    } catch (error) {
      console.error('Error fetching charges:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingId) {
        const response = await fetch(`/api/patients/${patientId}/charges/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (response.ok) {
          await fetchCharges();
          resetForm();
        } else {
          alert('Failed to update charge');
        }
      } else {
        const response = await fetch(`/api/patients/${patientId}/charges`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            patient_billing_id: billing.id,
          }),
        });

        if (response.ok) {
          await fetchCharges();
          resetForm();
        } else {
          alert('Failed to add charge');
        }
      }
    } catch (error) {
      console.error('Error saving charge:', error);
      alert('Failed to save charge');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      charge_type: '',
      description: '',
      amount: 0,
      charge_date: new Date().toISOString().split('T')[0],
    });
  };

  const handleEdit = (charge: any) => {
    setEditingId(charge.id);
    setFormData({
      charge_type: charge.charge_type,
      description: charge.description,
      amount: parseFloat(charge.amount),
      charge_date: charge.charge_date,
    });
    setShowForm(true);
  };

  const handleDelete = async (chargeId: string) => {
    if (!confirm('Are you sure you want to delete this charge?')) return;

    try {
      const response = await fetch(`/api/patients/${patientId}/charges/${chargeId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchCharges();
      } else {
        alert('Failed to delete charge');
      }
    } catch (error) {
      console.error('Error deleting charge:', error);
      alert('Failed to delete charge');
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

  const chargeTypes = [
    'Consultation Fee',
    'Procedure',
    'Medication',
    'Lab Test',
    'X-Ray',
    'CT Scan',
    'MRI',
    'Room Charges',
    'ICU Charges',
    'Other',
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold text-white">Patient Charges</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Charge
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Charge Type *
              </label>
              <select
                required
                value={formData.charge_type}
                onChange={(e) => setFormData({ ...formData, charge_type: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select Type</option>
                {chargeTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

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
                Charge Date *
              </label>
              <input
                type="date"
                required
                value={formData.charge_date}
                onChange={(e) => setFormData({ ...formData, charge_date: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Description
              </label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                placeholder="Additional details about the charge..."
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Charge'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
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
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Date</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Charge Type</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Description</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Created By</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">Amount</th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {charges.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No charges recorded yet
                </td>
              </tr>
            ) : (
              <>
                {charges.map((charge) => {
                  const canEdit = user?.id === charge.created_by || user?.role === 'ADMIN';
                  const canDelete = user?.id === charge.created_by || user?.role === 'ADMIN';
                  
                  return (
                    <tr key={charge.id} className="hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-sm text-white">
                        {new Date(charge.charge_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-white">
                        {charge.charge_type}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {charge.description || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {charge.users?.username || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 text-sm text-white text-right font-medium">
                        ₹{parseFloat(charge.amount).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-2 justify-center">
                          {canEdit && (
                            <button
                              onClick={() => handleEdit(charge)}
                              className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(charge.id)}
                              className="text-red-400 hover:text-red-300 text-sm font-medium"
                            >
                              Delete
                            </button>
                          )}
                          {!canEdit && !canDelete && (
                            <span className="text-gray-500 text-sm">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-gray-700 font-semibold">
                  <td colSpan={4} className="px-4 py-3 text-sm text-white text-right">
                    Total Charges:
                  </td>
                  <td className="px-4 py-3 text-sm text-white text-right">
                    ₹{charges.reduce((sum, c) => sum + parseFloat(c.amount), 0).toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
