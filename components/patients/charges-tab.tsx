'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronRight, Plus } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { UpdatedStamp } from '@/components/ui/updated-stamp';
import { Button } from '@/components/ui/button';
import { ChargeEntryModal } from '@/components/patients/charge-entry-modal';
import { CHARGE_CATEGORY_LABELS } from '@/lib/billing/constants';

/**
 * The itemised charges on a patient's bill.
 *
 * Two things changed here beyond moving the form into a modal.
 *
 * The charge types were a hardcoded array in this file. They are now the charge
 * catalogue, so a service can be added without a redeploy and carries a price.
 *
 * And a per-day service is stored as one row per day, which is what makes a
 * single night repriceable. That is correct but unreadable at a glance — a
 * twelve-day stay is twelve near-identical lines — so the table has two views.
 * "All" is every row as stored. "Grouped" collapses each date-range block into
 * one line with a subtotal, expandable to the days inside it.
 *
 * Errors are inline rather than `alert()`, which is what the rest of the app does.
 */

interface ChargesTabProps {
  patientId: string;
  billing: any;
  onCreateBilling: () => void;
}

const money = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const lineTotal = (charge: any) => Number(charge.amount || 0) * (Number(charge.qty) || 1);

interface Group {
  key: string;
  label: string;
  category: string | null;
  rows: any[];
  total: number;
  /** A real date-range block, as opposed to unrelated rows that share a name. */
  isBlock: boolean;
}

export default function ChargesTab({ patientId, billing, onCreateBilling }: ChargesTabProps) {
  const { user } = useUser();
  const [charges, setCharges] = useState<any[]>([]);
  const [view, setView] = useState<'all' | 'grouped'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fetchCharges = useCallback(async () => {
    if (!billing) return;
    try {
      const response = await fetch(`/api/patients/${patientId}/charges?billing_id=${billing.id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to load charges');
      setCharges(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Error fetching charges:', err);
      setError(err.message);
    }
  }, [patientId, billing]);

  useEffect(() => {
    void fetchCharges();
  }, [fetchCharges]);

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (charge: any) => {
    setEditing(charge);
    setModalOpen(true);
  };

  const canModify = (charge: any) =>
    user?.role === 'ADMIN' || user?.id === charge.created_by;

  const handleDelete = async (charge: any, wholeGroup: boolean) => {
    const count = wholeGroup
      ? charges.filter((c) => c.charge_group_id === charge.charge_group_id).length
      : 1;

    const what = wholeGroup
      ? `all ${count} daily lines of "${charge.charge_type}"`
      : `this charge`;

    if (!confirm(`Delete ${what}?`)) return;

    setError('');
    setNotice('');

    try {
      const url = `/api/patients/${patientId}/charges/${charge.id}${wholeGroup ? '?group=true' : ''}`;
      const response = await fetch(url, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Failed to delete the charge');

      setNotice(body.message || 'Charge deleted');
      await fetchCharges();
    } catch (err: any) {
      console.error('Error deleting charge:', err);
      setError(err.message);
    }
  };

  const total = useMemo(() => charges.reduce((sum, c) => sum + lineTotal(c), 0), [charges]);

  /**
   * Rows a single date-range entry produced group on `charge_group_id`. Everything
   * else groups on the catalogue entry, falling back to the stored name so ad-hoc
   * charges still collect together.
   */
  const groups = useMemo<Group[]>(() => {
    const byKey = new Map<string, Group>();

    for (const charge of charges) {
      const isBlock = Boolean(charge.charge_group_id);
      const key = isBlock
        ? `g:${charge.charge_group_id}`
        : `i:${charge.charge_item_id || charge.charge_type}`;

      let group = byKey.get(key);
      if (!group) {
        group = {
          key,
          label: charge.charge_type || 'Charge',
          category: charge.charge_item?.category ?? null,
          rows: [],
          total: 0,
          isBlock,
        };
        byKey.set(key, group);
      }

      group.rows.push(charge);
      group.total += lineTotal(charge);
    }

    return [...byKey.values()];
  }, [charges]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const dateRange = (rows: any[]) => {
    const dates = rows.map((r) => String(r.charge_date).slice(0, 10)).sort();
    const first = dates[0];
    const last = dates[dates.length - 1];
    return first === last ? first : `${first} → ${last}`;
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h3 className="text-lg sm:text-xl font-semibold text-foreground">Patient Charges</h3>

        <div className="flex items-center gap-2">
          {/* Per-day charges are one row per day; grouped makes a long stay readable. */}
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            {(['all', 'grouped'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-2 text-sm transition-colors ${
                  view === v
                    ? 'bg-info text-foreground'
                    : 'bg-surface-inset text-muted hover:text-foreground'
                }`}
              >
                {v === 'all' ? 'All' : 'Grouped'}
              </button>
            ))}
          </div>

          <Button onClick={openAdd} className="min-h-[44px]">
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Charge</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="p-3 rounded-md bg-info-subtle border border-info/30 text-info-text text-sm">
          {notice}
        </div>
      )}

      {charges.length === 0 ? (
        <div className="bg-surface-hover rounded-lg p-8 text-center text-muted">
          No charges recorded yet
        </div>
      ) : view === 'all' ? (
        <>
          {/* Desktop */}
          <div className="bg-surface-hover rounded-lg overflow-hidden hidden md:block">
            <table className="w-full">
              <thead className="bg-surface-inset">
                <tr>
                  {['Date', 'Charge', 'Description', 'Created By'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-sm font-medium text-foreground">
                      {h}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-sm font-medium text-foreground">Qty</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-foreground">Amount</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-input-border">
                {charges.map((charge) => (
                  <tr key={charge.id} className="hover:bg-table-row-hover">
                    <td className="px-4 py-3 text-sm text-foreground">
                      {new Date(charge.charge_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {charge.charge_type}
                      {charge.charge_group_id && (
                        <span className="ml-2 text-xs text-muted">per day</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">{charge.description || '-'}</td>
                    <td className="px-4 py-3 text-sm text-muted">
                      {charge.users?.username || 'Unknown'}
                      <UpdatedStamp
                        by={charge.updated_by_user?.username}
                        at={charge.updated_at}
                        className="mt-0.5"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-center">
                      {charge.qty || 1}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-right font-medium">
                      {money(lineTotal(charge))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-2 justify-center">
                        {canModify(charge) ? (
                          <>
                            <button
                              onClick={() => openEdit(charge)}
                              className="text-info hover:text-info text-sm font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(charge, false)}
                              className="text-destructive hover:text-destructive text-sm font-medium"
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="bg-surface-inset font-semibold">
                  <td colSpan={5} className="px-4 py-3 text-sm text-foreground text-right">
                    Total Charges:
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground text-right">{money(total)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {charges.map((charge) => (
              <div key={charge.id} className="bg-surface-hover rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{charge.charge_type}</p>
                    {charge.description && (
                      <p className="text-xs text-muted mt-0.5 line-clamp-2">{charge.description}</p>
                    )}
                  </div>
                  <p className="text-base font-semibold text-foreground ml-3">
                    {money(lineTotal(charge))}
                    {(charge.qty || 1) > 1 ? ` (${charge.qty}x)` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="bg-surface-inset px-2 py-1 rounded text-muted">
                    {new Date(charge.charge_date).toLocaleDateString()}
                  </span>
                  <span className="bg-surface-inset px-2 py-1 rounded text-muted">
                    by {charge.users?.username || 'Unknown'}
                  </span>
                </div>
                <UpdatedStamp by={charge.updated_by_user?.username} at={charge.updated_at} />
                {canModify(charge) && (
                  <div className="flex gap-3 pt-2 border-t border-input-border">
                    <button
                      onClick={() => openEdit(charge)}
                      className="text-info text-sm font-medium min-h-[44px] flex items-center"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(charge, false)}
                      className="text-destructive text-sm font-medium min-h-[44px] flex items-center"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
            <div className="bg-surface-inset rounded-lg p-4 flex justify-between items-center">
              <span className="text-sm font-semibold text-foreground">Total Charges</span>
              <span className="text-sm font-semibold text-foreground">{money(total)}</span>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const isOpen = expanded.has(group.key);
            const multi = group.rows.length > 1;

            return (
              <div
                key={group.key}
                className="bg-surface-hover rounded-lg overflow-hidden border border-border"
              >
                <button
                  onClick={() => multi && toggle(group.key)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left ${
                    multi ? 'hover:bg-table-row-hover' : 'cursor-default'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {multi ? (
                      <ChevronRight
                        size={16}
                        className={`shrink-0 text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      />
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{group.label}</p>
                      <p className="text-xs text-muted">
                        {group.category &&
                          `${
                            CHARGE_CATEGORY_LABELS[
                              group.category as keyof typeof CHARGE_CATEGORY_LABELS
                            ] ?? group.category
                          } · `}
                        {multi
                          ? `${group.rows.length} lines · ${dateRange(group.rows)}`
                          : new Date(group.rows[0].charge_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold text-foreground">{money(group.total)}</span>
                    {group.isBlock && canModify(group.rows[0]) && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(group.rows[0], true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.stopPropagation();
                            void handleDelete(group.rows[0], true);
                          }
                        }}
                        className="text-destructive text-sm font-medium"
                      >
                        Delete all
                      </span>
                    )}
                  </div>
                </button>

                {isOpen && multi && (
                  <div className="divide-y divide-input-border border-t border-input-border">
                    {group.rows.map((charge) => (
                      <div
                        key={charge.id}
                        className="flex items-center justify-between gap-3 px-4 py-2 pl-10 text-sm"
                      >
                        <span className="text-muted">
                          {new Date(charge.charge_date).toLocaleDateString()}
                          {(charge.qty || 1) > 1 && ` · ${charge.qty}x`}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-foreground">{money(lineTotal(charge))}</span>
                          {canModify(charge) && (
                            <>
                              <button
                                onClick={() => openEdit(charge)}
                                className="text-info text-sm"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(charge, false)}
                                className="text-destructive text-sm"
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
            );
          })}

          <div className="bg-surface-inset rounded-lg p-4 flex justify-between items-center">
            <span className="text-sm font-semibold text-foreground">Total Charges</span>
            <span className="text-sm font-semibold text-foreground">{money(total)}</span>
          </div>
        </div>
      )}

      <ChargeEntryModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSuccess={fetchCharges}
        patientId={patientId}
        billingId={billing?.id ?? null}
        charge={editing}
      />
    </div>
  );
}
