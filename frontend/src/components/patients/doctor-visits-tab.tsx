import { apiFetch } from '@/lib/api'
'use client';

import { useState, useEffect } from 'react';
import { Plus, Calendar, Clock, Search, X, Edit2, Trash2 } from 'lucide-react';
import { useUser } from '@/hooks/use-user';

interface DoctorVisitsTabProps {
    patientId: string;
    patientJoinDate?: string;
    billing?: any;
    onCreateBilling: () => void;
}

interface Doctor {
    id: string;
    name: string;
    specialist?: string;
}

export default function DoctorVisitsTab({ patientId, patientJoinDate, billing, onCreateBilling }: DoctorVisitsTabProps) {
    const { user } = useUser();
    const [consultations, setConsultations] = useState<any[]>([]);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [filteredDoctors, setFilteredDoctors] = useState<Doctor[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [dischargeDate, setDischargeDate] = useState<string | null>(null);
    const [doctorSearch, setDoctorSearch] = useState('');
    const [showDoctorDropdown, setShowDoctorDropdown] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const getCurrentTime = () => {
        const now = new Date()
        return now.toTimeString().slice(0, 5) // "HH:mm"
    }

    const [formData, setFormData] = useState({
        doctor_id: '',
        consultation_date: '',
        consultation_time: getCurrentTime(),
        notes: '',
        billing_id: billing?.id || '',
    });

    useEffect(() => {
        fetchConsultations();
        fetchDoctors();
        fetchDischargeDate();
    }, [patientId]);

    // Filter doctors based on search term
    useEffect(() => {
        if (doctorSearch.trim() === '') {
            setFilteredDoctors(doctors);
        } else {
            const searchLower = doctorSearch.toLowerCase();
            setFilteredDoctors(
                doctors.filter((doctor) =>
                    doctor.name.toLowerCase().includes(searchLower) ||
                    doctor.specialist?.toLowerCase().includes(searchLower)
                )
            );
        }
    }, [doctorSearch, doctors]);

    const fetchConsultations = async () => {
        try {
            const response = await apiFetch(`/api/patients/${patientId}/consultations`);
            if (response.ok) {
                const data = await response.json();
                setConsultations(data);
            }
        } catch (error) {
            console.error('Error fetching consultations:', error);
        }
    };

    const fetchDoctors = async () => {
        try {
            const response = await apiFetch('/api/doctors/all');
            if (response.ok) {
                const data = await response.json();
                setDoctors(Array.isArray(data) ? data : []);
                setFilteredDoctors(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Error fetching doctors:', error);
        }
    };

    const fetchDischargeDate = async () => {
        try {
            const response = await apiFetch(`/api/patients/${patientId}/case-sheets`);
            if (response.ok) {
                const data = await response.json();
                if (data && data.length > 0 && data[0].discharge_date) {
                    setDischargeDate(data[0].discharge_date);
                }
            }
        } catch (error) {
            console.error('Error fetching discharge date:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const consultationDateTime = new Date(
                `${formData.consultation_date}T${formData.consultation_time}:00+05:30`
            ).toISOString();

            const url = editingId
                ? `/api/patients/${patientId}/consultations/${editingId}`
                : `/api/patients/${patientId}/consultations`;
            const method = editingId ? 'PATCH' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    doctor_id: formData.doctor_id,
                    consultation_date: consultationDateTime,
                    notes: formData.notes,
                    billing_id: formData.billing_id,
                }),
            });

            if (response.ok) {
                await fetchConsultations();
                setShowForm(false);
                setEditingId(null);
                setDoctorSearch('');
                setShowDoctorDropdown(false);
                resetForm();
            } else {
                const error = await response.json();
                alert(error.error || 'Failed to save consultation');
            }
        } catch (error) {
            console.error('Error saving consultation:', error);
            alert('Failed to save consultation');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            doctor_id: '',
            consultation_date: '',
            consultation_time: getCurrentTime(),
            notes: '',
            billing_id: billing?.id || '',
        });
        setEditingId(null);
        setDoctorSearch('');
        setShowDoctorDropdown(false);
    };

    const handleEdit = (consultation: any) => {
        setEditingId(consultation.id);
        const dateTime = new Date(consultation.consultation_date);
        setFormData({
            doctor_id: consultation.doctor_id,
            consultation_date: dateTime.toISOString().split('T')[0],
            consultation_time: dateTime.toTimeString().slice(0, 5),
            billing_id: consultation.billing_id || billing?.id || '',
            notes: consultation.notes || '',
        });
        setShowForm(true);
    };

    const handleDelete = async (id: string, consultation: any) => {
        const confirmMsg = 'Are you sure you want to delete this consultation?' +
            (consultation.payment_status === 'paid' ? '\n\nWarning: This consultation has been settled.' : '');

        if (!confirm(confirmMsg)) return;

        try {
            const response = await apiFetch(`/api/patients/${patientId}/consultations/${id}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                await fetchConsultations();
            } else {
                const error = await response.json();
                if (error.settlementFound) {
                    alert('Cannot delete: ' + error.message);
                } else {
                    alert(error.error || 'Failed to delete consultation');
                }
            }
        } catch (error) {
            console.error('Error deleting consultation:', error);
            alert('Failed to delete consultation');
        }
    };

    const canEditOrDelete = (consultation: any) => {
        return user?.role === 'ADMIN' || consultation.created_by === user?.id;
    };

    // Calculate date constraints
    const getMaxDate = () => {
        if (dischargeDate) {
            // If discharged, can only add consultations up to discharge date
            return dischargeDate;
        }
        // If not discharged, can only add consultations up to yesterday (not tomorrow)
        const today = new Date();
        today.setDate(today.getDate() - 1);
        return today.toISOString().split('T')[0];
    };

    const minDate = patientJoinDate || new Date().toISOString().split('T')[0];
    const maxDate = getMaxDate();

    const getSelectedDoctorName = () => {
        if (!formData.doctor_id) return '';
        const doctor = doctors.find(d => d.id === formData.doctor_id);
        return doctor ? `${doctor.name} ${doctor.specialist ? `- ${doctor.specialist}` : ''}` : '';
    };

    // Format date in IST as "2nd Feb 2026 6:34 PM"
    const normalizeISO = (dateString: string) =>
        dateString.replace(/\+00:00$/, 'Z');

    const formatConsultationDateIST = (dateString: string) => {
        console.log('Formatting date:', dateString);

        const normalized = dateString.replace(/\+00:00$/, 'Z');
        const date = new Date(normalized);

        const parts = new Intl.DateTimeFormat('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        }).formatToParts(date);

        const get = (type: string) =>
            parts.find(p => p.type === type)?.value || '';

        const day = Number(get('day'));

        const suffix =
            day % 10 === 1 && day !== 11 ? 'st' :
                day % 10 === 2 && day !== 12 ? 'nd' :
                    day % 10 === 3 && day !== 13 ? 'rd' :
                        'th';

        return `${day}${suffix} ${get('month')} ${get('year')} ${get('hour')}:${get('minute')} ${get('dayPeriod')}`;
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
                            onClick={() => setShowForm(!showForm)}
                            className="flex items-center gap-2 bg-info hover:bg-info-hover text-foreground px-3 sm:px-4 py-2 rounded-lg transition-colors min-h-[44px] text-sm"
                        >
                            <Plus className="h-4 w-4" />
                            <span className="hidden sm:inline">Add Consultation</span>
                            <span className="sm:hidden">Add</span>
                        </button>
                    </div>

                    {showForm && (
                        <form onSubmit={handleSubmit} className="bg-surface-hover rounded-lg p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="relative">
                                    <label className="block text-sm font-medium text-muted mb-2">
                                        Doctor (Optional)
                                    </label>
                                    <div className="relative">
                                        <div
                                            onClick={() => setShowDoctorDropdown(!showDoctorDropdown)}
                                            className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none cursor-pointer flex items-center justify-between"
                                        >
                                            <span>{getSelectedDoctorName() || 'Select Doctor'}</span>
                                            <Search className="h-4 w-4 text-muted" />
                                        </div>

                                        {showDoctorDropdown && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-surface-inset border border-border rounded-lg shadow-lg z-10">
                                                <div className="p-2 border-b border-border">
                                                    <input
                                                        type="text"
                                                        placeholder="Search doctor name or specialist..."
                                                        value={doctorSearch}
                                                        onChange={(e) => setDoctorSearch(e.target.value)}
                                                        className="w-full bg-surface-inset text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:border-ring"
                                                    />
                                                </div>
                                                <div className="max-h-48 overflow-y-auto">
                                                    {filteredDoctors.length === 0 ? (
                                                        <div className="px-4 py-3 text-sm text-muted">
                                                            No doctors found
                                                        </div>
                                                    ) : (
                                                        filteredDoctors.map((doctor) => (
                                                            <button
                                                                key={doctor.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setFormData({ ...formData, doctor_id: doctor.id });
                                                                    setShowDoctorDropdown(false);
                                                                    setDoctorSearch('');
                                                                }}
                                                                className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-hover transition-colors ${formData.doctor_id === doctor.id
                                                                        ? 'bg-info text-foreground'
                                                                        : 'text-foreground'
                                                                    }`}
                                                            >
                                                                <div className="font-medium">{doctor.name}</div>
                                                                {doctor.specialist && (
                                                                    <div className="text-xs text-muted">
                                                                        {doctor.specialist}
                                                                    </div>
                                                                )}
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-muted mb-2">
                                        <Calendar className="inline h-4 w-4 mr-1" />
                                        Consultation Date *
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        min={minDate}
                                        max={maxDate}
                                        value={formData.consultation_date}
                                        onChange={(e) => setFormData({ ...formData, consultation_date: e.target.value })}
                                        className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                                    />
                                    <p className="text-xs text-muted mt-1">
                                        {dischargeDate
                                            ? `Consultations until discharge date: ${new Date(dischargeDate).toLocaleDateString()}`
                                            : 'Consultations up to yesterday only'
                                        }
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-muted mb-2">
                                        <Clock className="inline h-4 w-4 mr-1" />
                                        Consultation Time
                                    </label>
                                    <input
                                        type="time"
                                        value={formData.consultation_time}
                                        onChange={(e) => setFormData({ ...formData, consultation_time: e.target.value })}
                                        className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                                    />
                                </div>

                            </div>

                            <div>
                                <label className="block text-sm font-medium text-muted mb-2">
                                    Notes
                                </label>
                                <textarea
                                    rows={3}
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full bg-surface-inset text-foreground rounded-lg px-4 py-2 border border-border focus:border-ring focus:outline-none"
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="submit"
                                    disabled={loading || !formData.doctor_id}
                                    className="bg-success hover:bg-success-hover text-foreground px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    {loading ? 'Saving...' : editingId ? 'Update Consultation' : 'Save Consultation'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowForm(false);
                                        resetForm();
                                        setDoctorSearch('');
                                        setShowDoctorDropdown(false);
                                    }}
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
                                    consultations.map((consultation) => {
                                        return (
                                            <tr key={consultation.id} className="hover:bg-table-row-hover">
                                                <td className="px-4 py-3 text-sm text-foreground">
                                                    {formatConsultationDateIST(consultation.consultation_date)}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-foreground">
                                                    {consultation.doctor?.name}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-muted">
                                                    {consultation.doctor?.specialist || 'N/A'}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-muted">
                                                    {consultation.notes || '-'}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-foreground">
                                                    {consultation.created_by_user?.username || 'Unknown'}
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
                                                                onClick={() => handleDelete(consultation.id, consultation)}
                                                                className="text-destructive hover:text-destructive transition-colors"
                                                                title="Delete"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
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
                                                    onClick={() => handleDelete(consultation.id, consultation)}
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
                                            {formatConsultationDateIST(consultation.consultation_date)}
                                        </span>
                                        <span className="bg-surface-inset px-2 py-1 rounded text-muted">
                                            by {consultation.created_by_user?.username || 'Unknown'}
                                        </span>
                                    </div>
                                    {consultation.notes && (
                                        <p className="text-sm text-muted line-clamp-2">{consultation.notes}</p>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
