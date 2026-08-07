'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronRight, Download, Pill, Plus, Printer } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { UpdatedStamp } from '@/components/ui/updated-stamp';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChargeEntryModal } from '@/components/patients/charge-entry-modal';
import { PharmacyBillAddModal } from '@/components/patients/pharmacy-bill-add-modal';
import { PharmacyBillViewModal } from '@/components/patients/pharmacy-bill-view-modal';
import { PatientChargesDownloadModal } from '@/components/patients/patient-charges-download-modal';
import { CHARGE_CATEGORY_LABELS } from '@/lib/billing/constants';
import {
  printPatientCharges, type PatientChargesPatient,
} from '@/lib/pdf/patient-charges-pdf';

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
  /** For the Download/Print PDF buttons — the Name/Age-Sex/Id No block. */
  patient?: PatientChargesPatient | null;
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

interface DayGroup {
  key: string;
  /** `YYYY-MM-DD`. */
  date: string;
  rows: any[];
  total: number;
}

export default function ChargesTab({ patientId, billing, onCreateBilling, patient }: ChargesTabProps) {
  const { user } = useUser();
  const [charges, setCharges] = useState<any[]>([]);
  const [view, setView] = useState<'date' | 'charge'>('date');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [pharmacyAddOpen, setPharmacyAddOpen] = useState(false);
  const [pharmacyViewBillId, setPharmacyViewBillId] = useState<string | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
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

  const pdfData = useMemo(() => ({
    patient: patient ?? { name: 'Patient', patient_id: null },
    charges: charges.map((c) => ({
      charge_date: c.charge_date,
      charge_type: c.charge_type || 'Charge',
      description: c.description,
      qty: c.qty || 1,
      amount: lineTotal(c),
    })),
  }), [charges, patient]);

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

  /**
   * One block per calendar day, newest first.
   *
   * A per-day service is stored as one row per day, so a long stay repeated the
   * same date down the whole table — four lines of "04/08/2026" say nothing the
   * first one didn't. The date is shown once, with that day's subtotal, and its
   * charges sit inside it.
   */
  const byDate = useMemo<DayGroup[]>(() => {
    const byDay = new Map<string, DayGroup>();

    for (const charge of charges) {
      const date = String(charge.charge_date || '').slice(0, 10);
      let day = byDay.get(date);
      if (!day) {
        day = { key: `d:${date}`, date, rows: [], total: 0 };
        byDay.set(date, day);
      }
      day.rows.push(charge);
      day.total += lineTotal(charge);
    }

    return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
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
          {/* A per-day service is one row per day, so both views collapse the
              repetition — by the day it happened, or by what was charged. */}
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            {(['date', 'charge'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-2 text-sm transition-colors ${
                  view === v
                    ? 'bg-info text-foreground'
                    : 'bg-surface-inset text-muted hover:text-foreground'
                }`}
              >
                {v === 'date' ? 'By date' : 'By charge'}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            onClick={() => setDownloadOpen(true)}
            className="min-h-[44px]"
          >
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Download PDF</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => printPatientCharges(pdfData)}
            className="min-h-[44px]"
          >
            <Printer className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Print</span>
          </Button>

          <Button variant="outline" onClick={() => setPharmacyAddOpen(true)} className="min-h-[44px]">
            <Pill className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Pharmacy Bill</span>
          </Button>

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
      ) : view === 'date' ? (
        <div className="space-y-3">
          {byDate.map((day) => {
            const isOpen = expanded.has(day.key);

            return (
              <div
                key={day.key}
                className="bg-surface-hover rounded-lg overflow-hidden border border-border"
              >
                <button
                  onClick={() => toggle(day.key)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-table-row-hover"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronRight
                      size={16}
                      className={`shrink-0 text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {new Date(day.date).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-muted">
                        {day.rows.length} charge{day.rows.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <span className="font-semibold text-foreground shrink-0">{money(day.total)}</span>
                </button>

                {isOpen && (
                  <div className="divide-y divide-input-border border-t border-input-border">
                    {day.rows.map((charge) => (
                      <ChargeDetailRow
                        key={charge.id}
                        charge={charge}
                        canModify={canModify(charge)}
                        onView={setPharmacyViewBillId}
                        onEdit={openEdit}
                        onDelete={(c) => handleDelete(c, false)}
                      />
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
                {/* Every group expands, including a single-charge one — that row's
                    own actions (a pharmacy bill's View especially) live inside. */}
                <button
                  onClick={() => toggle(group.key)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-table-row-hover"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronRight
                      size={16}
                      className={`shrink-0 text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    />
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

                {isOpen && (
                  <div className="divide-y divide-input-border border-t border-input-border">
                    {group.rows.map((charge) => (
                      <ChargeDetailRow
                        key={charge.id}
                        charge={charge}
                        canModify={canModify(charge)}
                        showDate
                        onView={setPharmacyViewBillId}
                        onEdit={openEdit}
                        onDelete={(c) => handleDelete(c, false)}
                      />
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

      <PharmacyBillAddModal
        isOpen={pharmacyAddOpen}
        onClose={() => setPharmacyAddOpen(false)}
        onSuccess={fetchCharges}
        patientId={patientId}
        billingId={billing?.id ?? null}
      />

      {pharmacyViewBillId && (
        <PharmacyBillViewModal
          isOpen={Boolean(pharmacyViewBillId)}
          onClose={() => setPharmacyViewBillId(null)}
          patientId={patientId}
          billId={pharmacyViewBillId}
          patient={patient}
          onDateChanged={fetchCharges}
        />
      )}

      <PatientChargesDownloadModal
        isOpen={downloadOpen}
        onClose={() => setDownloadOpen(false)}
        patientId={patientId}
        patient={patient}
        charges={charges}
      />
    </div>
  );
}

/**
 * One charge inside an expanded day.
 *
 * A single wrapping row rather than the separate desktop-table / mobile-card
 * pair the flat view used: inside an accordion there is no header to line up
 * with, so one flex row reads correctly at every width.
 *
 * A pharmacy charge is View-only — its medicines, amounts and GST are what the
 * pharmacy said they were, so there is nothing here to edit. Correcting one
 * means deleting it and adding the right bill.
 */
function ChargeDetailRow({
  charge,
  canModify,
  showDate,
  onView,
  onEdit,
  onDelete,
}: {
  charge: any;
  canModify: boolean;
  /** Grouping by charge rather than by date, so the day still needs saying. */
  showDate?: boolean;
  onView: (billId: string) => void;
  onEdit: (charge: any) => void;
  onDelete: (charge: any) => void;
}) {
  const bill = charge.pharmacy_bill;

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {charge.charge_type}
          {bill && <Badge variant="info" className="ml-2">Pharmacy</Badge>}
          {charge.charge_group_id && <span className="ml-2 text-xs text-muted">per day</span>}
        </p>
        {showDate && (
          <p className="text-xs text-muted mt-0.5">
            {new Date(charge.charge_date).toLocaleDateString()}
          </p>
        )}
        {charge.description && (
          <p className="text-xs text-muted mt-0.5 line-clamp-2">{charge.description}</p>
        )}
        <p className="text-xs text-muted mt-0.5">by {charge.users?.username || 'Unknown'}</p>
        <UpdatedStamp
          by={charge.updated_by_user?.username}
          at={charge.updated_at}
          className="mt-0.5"
        />
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm text-right">
          {(charge.qty || 1) > 1 && <span className="text-muted mr-2">{charge.qty} ×</span>}
          <span className="font-medium text-foreground">{money(lineTotal(charge))}</span>
        </span>

        <div className="flex gap-2">
          {bill && (
            <button
              onClick={() => onView(bill.id)}
              className="text-info text-sm font-medium"
            >
              View
            </button>
          )}
          {canModify && !bill && (
            <button onClick={() => onEdit(charge)} className="text-info text-sm font-medium">
              Edit
            </button>
          )}
          {canModify && (
            <button
              onClick={() => onDelete(charge)}
              className="text-destructive text-sm font-medium"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
