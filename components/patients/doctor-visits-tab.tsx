'use client';

import { useState, useEffect } from 'react';
import { Plus, Calendar, Clock } from 'lucide-react';

interface DoctorVisitsTabProps {
    patientId: string;
    patientJoinDate?: string;
}

export default function DoctorVisitsTab({ patientId, patientJoinDate }: DoctorVisitsTabProps) {
    const [consultations, setConsultations] = useState<any[]>([]);
    const [doctors, setDoctors] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(false);
    const getCurrentTime = () => {
        const now = new Date()
        return now.toTimeString().slice(0, 5) // "HH:mm"
    }

    const [formData, setFormData] = useState({
        doctor_id: '',
        consultation_date: '',
        consultation_time: getCurrentTime(),
        visit_number: 1,
        price_per_visit: 0,
        notes: '',
    });

    useEffect(() => {
        fetchConsultations();
        fetchDoctors();
    }, [patientId]);

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
            const response = await fetch('/api/doctors');
            if (response.ok) {
                const data = await response.json();
                setDoctors(data.data || []);
            }
        } catch (error) {
            console.error('Error fetching doctors:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const consultationDateTime = `${formData.consultation_date}T${formData.consultation_time || '00:00'}:00`;

            const response = await fetch(`/api/patients/${patientId}/consultations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    consultation_date: consultationDateTime,
                }),
            });

            if (response.ok) {
                await fetchConsultations();
                setShowForm(false);
                setFormData({
                    doctor_id: '',
                    consultation_date: '',
                    consultation_time: '',
                    visit_number: 1,
                    price_per_visit: 0,
                    notes: '',
                });
            } else {
                const error = await response.json();
                alert(error.error || 'Failed to create consultation');
            }
        } catch (error) {
            console.error('Error creating consultation:', error);
            alert('Failed to create consultation');
        } finally {
            setLoading(false);
        }
    };

    const minDate = patientJoinDate || new Date().toISOString().split('T')[0];

    return (
        <div className="space-y-6">
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
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                Doctor *
                            </label>
                            <select
                                required
                                value={formData.doctor_id}
                                onChange={(e) => setFormData({ ...formData, doctor_id: e.target.value })}
                                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                            >
                                <option value="">Select Doctor</option>
                                {doctors.map((doctor) => (
                                    <option key={doctor.id} value={doctor.id}>
                                        {doctor.name} {doctor.specialist ? `- ${doctor.specialist}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                Visit Number *
                            </label>
                            <input
                                type="number"
                                required
                                min="1"
                                value={formData.visit_number}
                                onChange={(e) => setFormData({ ...formData, visit_number: parseInt(e.target.value) })}
                                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                            />
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
                                value={formData.consultation_date}
                                onChange={(e) => setFormData({ ...formData, consultation_date: e.target.value })}
                                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                            />
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

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                Price per Visit (₹)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={formData.price_per_visit}
                                onChange={(e) => setFormData({ ...formData, price_per_visit: parseFloat(e.target.value) })}
                                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                Total Amount: ₹{(formData.visit_number * formData.price_per_visit).toFixed(2)}
                            </label>
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
                            disabled={loading}
                            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : 'Save Consultation'}
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
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Date & Time</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Doctor</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Specialist</th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">Visits</th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">Price/Visit</th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">Total</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Notes</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {consultations.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                                    No consultations recorded yet
                                </td>
                            </tr>
                        ) : (
                            consultations.map((consultation) => (
                                <tr key={consultation.id} className="hover:bg-gray-700/50">
                                    <td className="px-4 py-3 text-sm text-white">
                                        {new Date(consultation.consultation_date).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-white">
                                        {consultation.doctor?.name}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-400">
                                        {consultation.doctor?.specialist || 'N/A'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-white text-right">
                                        {consultation.visit_number}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-white text-right">
                                        ₹{parseFloat(consultation.price_per_visit).toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-white text-right font-medium">
                                        ₹{parseFloat(consultation.total_price).toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-400">
                                        {consultation.notes || '-'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
