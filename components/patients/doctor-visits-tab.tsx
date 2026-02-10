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
            const response = await fetch(`/api/patients/${patientId}/consultations`);
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
            const response = await fetch('/api/doctors/all');
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
            const response = await fetch(`/api/patients/${patientId}/case-sheets`);
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
            const response = await fetch(`/api/patients/${patientId}/consultations/${id}`, {
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
                <div className="bg-gray-800 rounded-lg p-8 text-center">
                    <p className="text-gray-400 mb-4">No billing record found for this patient</p>
                    <button
                        onClick={onCreateBilling}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
                    >
                        Create Billing Record
                    </button>
                </div>
            )}

            {billing && (
                <>
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-semibold text-white">Doctor Consultations</h3>
                        <button
                            onClick={() => setShowForm(!showForm)}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                        >
                            <Plus className="h-4 w-4" />
                            Add Consultation
                        </button>
                    </div>

                    {showForm && (
                        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="relative">
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        Doctor (Optional)
                                    </label>
                                    <div className="relative">
                                        <div
                                            onClick={() => setShowDoctorDropdown(!showDoctorDropdown)}
                                            className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none cursor-pointer flex items-center justify-between"
                                        >
                                            <span>{getSelectedDoctorName() || 'Select Doctor'}</span>
                                            <Search className="h-4 w-4 text-gray-400" />
                                        </div>

                                        {showDoctorDropdown && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg z-10">
                                                <div className="p-2 border-b border-gray-600">
                                                    <input
                                                        type="text"
                                                        placeholder="Search doctor name or specialist..."
                                                        value={doctorSearch}
                                                        onChange={(e) => setDoctorSearch(e.target.value)}
                                                        className="w-full bg-gray-600 text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                                    />
                                                </div>
                                                <div className="max-h-48 overflow-y-auto">
                                                    {filteredDoctors.length === 0 ? (
                                                        <div className="px-4 py-3 text-sm text-gray-400">
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
                                                                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-600 transition-colors ${formData.doctor_id === doctor.id
                                                                        ? 'bg-blue-600 text-white'
                                                                        : 'text-gray-300'
                                                                    }`}
                                                            >
                                                                <div className="font-medium">{doctor.name}</div>
                                                                {doctor.specialist && (
                                                                    <div className="text-xs text-gray-400">
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
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
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
                                        className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                                    />
                                    <p className="text-xs text-gray-400 mt-1">
                                        {dischargeDate
                                            ? `Consultations until discharge date: ${new Date(dischargeDate).toLocaleDateString()}`
                                            : 'Consultations up to yesterday only'
                                        }
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        <Clock className="inline h-4 w-4 mr-1" />
                                        Consultation Time
                                    </label>
                                    <input
                                        type="time"
                                        value={formData.consultation_time}
                                        onChange={(e) => setFormData({ ...formData, consultation_time: e.target.value })}
                                        className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                                    />
                                </div>

                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    Notes
                                </label>
                                <textarea
                                    rows={3}
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="submit"
                                    disabled={loading || !formData.doctor_id}
                                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
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
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Date & Time</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Doctor</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Specialist</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Notes</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Created By</th>
                                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-300">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {consultations.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                                            No consultations recorded yet
                                        </td>
                                    </tr>
                                ) : (
                                    consultations.map((consultation) => {
                                        return (
                                            <tr key={consultation.id} className="hover:bg-gray-700/50">
                                                <td className="px-4 py-3 text-sm text-white">
                                                    {formatConsultationDateIST(consultation.consultation_date)}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-white">
                                                    {consultation.doctor?.name}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-400">
                                                    {consultation.doctor?.specialist || 'N/A'}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-400">
                                                    {consultation.notes || '-'}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-300">
                                                    {consultation.created_by_user?.username || 'Unknown'}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {canEditOrDelete(consultation) && (
                                                        <div className="flex justify-center gap-2">
                                                            <button
                                                                onClick={() => handleEdit(consultation)}
                                                                className="text-blue-400 hover:text-blue-300 transition-colors"
                                                                title="Edit"
                                                            >
                                                                <Edit2 className="h-4 w-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(consultation.id, consultation)}
                                                                className="text-red-400 hover:text-red-300 transition-colors"
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
                </>
            )}
        </div>
    );
}
