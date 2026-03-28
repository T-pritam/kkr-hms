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
    qty: 1,
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
      qty: 1,
      charge_date: new Date().toISOString().split('T')[0],
    });
  };

  const handleEdit = (charge: any) => {
    setEditingId(charge.id);
    setFormData({
      charge_type: charge.charge_type,
      description: charge.description,
      amount: parseFloat(charge.amount),
      qty: charge.qty || 1,
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
        <h3 className="text-lg sm:text-xl font-semibold text-foreground">Patient Charges</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-info hover:bg-info-hover text-foreground px-3 sm:px-4 py-2 rounded-lg transition-colors min-h-[44px] text-sm"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add Charge</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface-hover rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Charge Type *
              </label>
              <select
                required
                value={formData.charge_type}
                onChange={(e) => setFormData({ ...formData, charge_type: e.target.value })}
                className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
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
              <label className="block text-sm font-medium text-muted mb-2">
                Amount (₹) *
              </label>
              <input
                type="number"
                required
                step="0.01"
                min="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Quantity *
              </label>
              <input
                type="number"
                required
                min="1"
                value={formData.qty}
                onChange={(e) => setFormData({ ...formData, qty: parseInt(e.target.value) || 1 })}
                className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Charge Date *
              </label>
              <input
                type="date"
                required
                value={formData.charge_date}
                onChange={(e) => setFormData({ ...formData, charge_date: e.target.value })}
                className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-muted mb-2">
                Description
              </label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                placeholder="Additional details about the charge..."
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="bg-success hover:bg-success-hover text-foreground px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Charge'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="bg-surface-inset hover:bg-surface-inset text-foreground px-6 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Desktop Table */}
      <div className="bg-surface-hover rounded-lg overflow-hidden hidden md:block">
        <table className="w-full">
          <thead className="bg-surface-inset">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Date</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Charge Type</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Description</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Created By</th>
              <th className="px-4 py-3 text-center text-sm font-medium text-foreground">Qty</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-foreground">Amount</th>
              <th className="px-4 py-3 text-center text-sm font-medium text-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-input-border">
            {charges.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  No charges recorded yet
                </td>
              </tr>
            ) : (
              <>
                {charges.map((charge) => {
                  const canEdit = user?.id === charge.created_by || user?.role === 'ADMIN';
                  const canDelete = user?.id === charge.created_by || user?.role === 'ADMIN';
                  
                  return (
                    <tr key={charge.id} className="hover:bg-table-row-hover">
                      <td className="px-4 py-3 text-sm text-foreground">
                        {new Date(charge.charge_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {charge.charge_type}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">
                        {charge.description || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">
                        {charge.users?.username || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground text-center">
                        {charge.qty || 1}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground text-right font-medium">
                        ₹{(parseFloat(charge.amount) * (charge.qty || 1)).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-2 justify-center">
                          {canEdit && (
                            <button
                              onClick={() => handleEdit(charge)}
                              className="text-info hover:text-info text-sm font-medium"
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(charge.id)}
                              className="text-destructive hover:text-destructive text-sm font-medium"
                            >
                              Delete
                            </button>
                          )}
                          {!canEdit && !canDelete && (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-surface-inset font-semibold">
                  <td colSpan={5} className="px-4 py-3 text-sm text-foreground text-right">
                    Total Charges:
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground text-right">
                    ₹{charges.reduce((sum, c) => sum + parseFloat(c.amount) * (c.qty || 1), 0).toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {charges.length === 0 ? (
          <div className="bg-surface-hover rounded-lg p-6 text-center text-muted">
            No charges recorded yet
          </div>
        ) : (
          <>
            {charges.map((charge) => {
              const canEdit = user?.id === charge.created_by || user?.role === 'ADMIN';
              const canDelete = user?.id === charge.created_by || user?.role === 'ADMIN';
              return (
                <div key={charge.id} className="bg-surface-hover rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">{charge.charge_type}</p>
                      {charge.description && (
                        <p className="text-xs text-muted mt-0.5 line-clamp-2">{charge.description}</p>
                      )}
                    </div>
                    <p className="text-base font-semibold text-foreground ml-3">₹{(parseFloat(charge.amount) * (charge.qty || 1)).toFixed(2)}{(charge.qty || 1) > 1 ? ` (${charge.qty}x)` : ''}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="bg-surface-inset px-2 py-1 rounded text-muted">
                      {new Date(charge.charge_date).toLocaleDateString()}
                    </span>
                    <span className="bg-surface-inset px-2 py-1 rounded text-muted">
                      by {charge.users?.username || 'Unknown'}
                    </span>
                  </div>
                  {(canEdit || canDelete) && (
                    <div className="flex gap-3 pt-2 border-t border-input-border">
                      {canEdit && (
                        <button
                          onClick={() => handleEdit(charge)}
                          className="text-info text-sm font-medium min-h-[44px] flex items-center"
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(charge.id)}
                          className="text-destructive text-sm font-medium min-h-[44px] flex items-center"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="bg-surface-inset rounded-lg p-4 flex justify-between items-center">
              <span className="text-sm font-semibold text-foreground">Total Charges</span>
              <span className="text-sm font-semibold text-foreground">
                ₹{charges.reduce((sum, c) => sum + parseFloat(c.amount) * (c.qty || 1), 0).toFixed(2)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
