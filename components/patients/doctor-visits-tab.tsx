'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Edit2, Plus, Trash2 } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { UpdatedStamp } from '@/components/ui/updated-stamp';
import { ConsultationFormModal } from '@/components/patients/consultation-form-modal';
import { formatIST } from '@/lib/consultations/ist';

interface DoctorVisitsTabProps {
    patientId: string;
    patientJoinDate?: string;
    billing?: any;
    onCreateBilling: () => void;
}

export default function DoctorVisitsTab({ patientId, patientJoinDate, billing, onCreateBilling }: DoctorVisitsTabProps) {
    const { user } = useUser();
    const [consultations, setConsultations] = useState<any[]>([]);
    const [dischargeDate, setDischargeDate] = useState<string | null>(null);

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<any | null>(null);
    const [deleting, setDeleting] = useState<any | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const fetchConsultations = useCallback(async () => {
        try {
            const response = await fetch(`/api/patients/${patientId}/consultations`);
            if (response.ok) {
                const data = await response.json();
                setConsultations(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error('Error fetching consultations:', err);
        }
    }, [patientId]);

    /**
     * The ceiling for the date field when the patient has been discharged.
     *
     * This read was broken: it tested `data.length` on a `{ success, data }` envelope, so
     * the discharge date was always null and every patient silently fell through to the
     * "not discharged" branch. Reading `json.data` matches how case-sheet-tab.tsx has
     * always read the same endpoint.
     *
     * Only a *finalised* summary counts. A draft can carry a typed-but-unsigned discharge
     * date, and a patient is not discharged until the summary is finalised — clamping on a
     * draft would block legitimate entry.
     */
    const fetchDischargeDate = useCallback(async () => {
        try {
            const response = await fetch(`/api/patients/${patientId}/case-sheets`);
            if (!response.ok) return;

            const json = await response.json();
            const sheets = Array.isArray(json?.data) ? json.data : [];
            const dates = sheets
                .filter((s: any) => s.status === 'final' && s.discharge_date)
                .map((s: any) => String(s.discharge_date).slice(0, 10))
                .sort();

            setDischargeDate(dates.length > 0 ? dates[dates.length - 1] : null);
        } catch (err) {
            console.error('Error fetching discharge date:', err);
        }
    }, [patientId]);

    useEffect(() => {
        void fetchConsultations();
        void fetchDischargeDate();
    }, [fetchConsultations, fetchDischargeDate]);

    const handleAdd = () => {
        setEditing(null);
        setFormOpen(true);
    };

    const handleEdit = (consultation: any) => {
        setEditing(consultation);
        setFormOpen(true);
    };

    const closeForm = () => {
        setFormOpen(false);
        setEditing(null);
    };

    const confirmDelete = async () => {
        if (!deleting) return;

        setBusy(true);
        setError('');

        try {
            const response = await fetch(`/api/patients/${patientId}/consultations/${deleting.id}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                setDeleting(null);
                await fetchConsultations();
                return;
            }

            const body = await response.json().catch(() => ({}));
            // A settled visit cannot be removed; the route explains why, so pass it through.
            setError(body.settlementFound ? body.message : body.error || 'Failed to delete the consultation');
            setDeleting(null);
        } catch (err) {
            console.error('Error deleting consultation:', err);
            setError('Failed to delete the consultation');
            setDeleting(null);
        } finally {
            setBusy(false);
        }
    };

    const canEditOrDelete = (consultation: any) => {
        return user?.role === 'ADMIN' || consultation.created_by === user?.id;
    };

    return (
        <div className="space-y-6">
            {!billing && (
                <div className="bg-surface-hover rounded-lg p-8 text-center">
                    <p className="text-muted mb-4">No billing record found for this patient</p>
                    <button
                        onClick={onCreateBilling}
                        className="bg-info hover:bg-info-hover text-foreground px-6 py-2 rounded-lg transition-colors"
                    >
                        Create Billing Record
                    </button>
                </div>
            )}

            {billing && (
                <>
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg sm:text-xl font-semibold text-foreground">Doctor Consultations</h3>
                        <button
                            onClick={handleAdd}
                            className="flex items-center gap-2 bg-info hover:bg-info-hover text-foreground px-3 sm:px-4 py-2 rounded-lg transition-colors min-h-[44px] text-sm"
                        >
                            <Plus className="h-4 w-4" />
                            <span className="hidden sm:inline">Add Consultation</span>
                            <span className="sm:hidden">Add</span>
                        </button>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
                            <AlertCircle size={16} className="mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Desktop Table */}
                    <div className="bg-surface-hover rounded-lg overflow-hidden hidden md:block">
                        <table className="w-full">
                            <thead className="bg-surface-inset">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Date & Time</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Doctor</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Specialist</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Notes</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Created By</th>
                                    <th className="px-4 py-3 text-center text-sm font-medium text-foreground">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-input-border">
                                {consultations.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-muted">
                                            No consultations recorded yet
                                        </td>
                                    </tr>
                                ) : (
                                    consultations.map((consultation) => (
                                        <tr key={consultation.id} className="hover:bg-table-row-hover">
                                            <td className="px-4 py-3 text-sm text-foreground">
                                                {formatIST(consultation.consultation_date)}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-foreground">
                                                {consultation.doctor?.name || 'No Doctor'}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-muted">
                                                {consultation.doctor?.specialist || 'N/A'}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-muted">
                                                {consultation.notes || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-foreground">
                                                {consultation.created_by_user?.username || 'Unknown'}
                                                <UpdatedStamp by={consultation.updated_by_user?.username} at={consultation.updated_at} className="mt-0.5" />
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {canEditOrDelete(consultation) && (
                                                    <div className="flex justify-center gap-2">
                                                        <button
                                                            onClick={() => handleEdit(consultation)}
                                                            className="text-info hover:text-info transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Edit2 className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleting(consultation)}
                                                            className="text-destructive hover:text-destructive transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3">
                        {consultations.length === 0 ? (
                            <div className="bg-surface-hover rounded-lg p-6 text-center text-muted">
                                No consultations recorded yet
                            </div>
                        ) : (
                            consultations.map((consultation) => (
                                <div key={consultation.id} className="bg-surface-hover rounded-lg p-4 space-y-3">
                                    <div className="flex items-start justify-between">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium text-foreground">
                                                {consultation.doctor?.name || 'No Doctor'}
                                            </p>
                                            {consultation.doctor?.specialist && (
                                                <p className="text-xs text-muted">{consultation.doctor.specialist}</p>
                                            )}
                                        </div>
                                        {canEditOrDelete(consultation) && (
                                            <div className="flex gap-3 ml-2">
                                                <button
                                                    onClick={() => handleEdit(consultation)}
                                                    className="text-info min-h-[44px] min-w-[44px] flex items-center justify-center"
                                                    title="Edit"
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => setDeleting(consultation)}
                                                    className="text-destructive min-h-[44px] min-w-[44px] flex items-center justify-center"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        <span className="bg-surface-inset px-2 py-1 rounded text-muted">
                                            {formatIST(consultation.consultation_date)}
                                        </span>
                                        <span className="bg-surface-inset px-2 py-1 rounded text-muted">
                                            by {consultation.created_by_user?.username || 'Unknown'}
                                            <UpdatedStamp by={consultation.updated_by_user?.username} at={consultation.updated_at} />
                                        </span>
                                    </div>
                                    {consultation.notes && (
                                        <p className="text-sm text-muted line-clamp-2">{consultation.notes}</p>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    <ConsultationFormModal
                        isOpen={formOpen}
                        onClose={closeForm}
                        onSuccess={fetchConsultations}
                        patientId={patientId}
                        billingId={billing?.id ?? null}
                        patientJoinDate={patientJoinDate}
                        dischargeDate={dischargeDate}
                        consultation={editing}
                    />

                    <Modal
                        isOpen={!!deleting}
                        onClose={() => setDeleting(null)}
                        size="sm"
                        title="Delete this consultation?"
                        footer={
                            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                                <Button variant="outline" onClick={() => setDeleting(null)} disabled={busy}>
                                    Cancel
                                </Button>
                                <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
                                    Delete
                                </Button>
                            </div>
                        }
                    >
                        <div className="space-y-3">
                            <p className="text-sm text-muted">
                                {deleting?.doctor?.name || 'No Doctor'} on{' '}
                                {deleting && formatIST(deleting.consultation_date)}. This cannot be undone.
                            </p>
                            {deleting?.payment_status === 'paid' && (
                                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
                                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                    <span>This consultation has been settled.</span>
                                </div>
                            )}
                        </div>
                    </Modal>
                </>
            )}
        </div>
    );
}
