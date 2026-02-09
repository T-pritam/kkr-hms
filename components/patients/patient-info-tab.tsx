'use client';

import { useState } from 'react';

interface PatientInfoTabProps {
  patient: any;
  onStatusChange?: (newStatus: string) => void;
}

export default function PatientInfoTab({ patient, onStatusChange }: PatientInfoTabProps) {
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (!patient) {
    return <div className="text-gray-400">Loading patient information...</div>;
  }

  const handleStatusChange = async (newStatus: string) => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/patients/${patient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (response.ok && onStatusChange) {
        onStatusChange(newStatus);
      }
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setIsSaving(false);
      setStatusDropdownOpen(false);
    }
  };

  const getStatusColor = (status: string) => {
    const normalizedStatus = status?.toLowerCase();
    if (normalizedStatus === 'active') return 'bg-green-500/20 text-green-400';
    if (normalizedStatus === 'cancelled') return 'bg-red-500/20 text-red-400';
    if (normalizedStatus === 'discharged') return 'bg-blue-500/20 text-blue-400';
    return 'bg-gray-500/20 text-gray-400';
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-GB');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-4">
      {/* Patient Information Section */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-white mb-6">Patient Information</h3>
        
        {/* Full Name & Gender */}
        <div className="grid grid-cols-2 gap-8 mb-4 border-b border-gray-700 pb-4">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-gray-400">Full Name</label>
            <span className="text-white font-medium">{patient.name || 'N/A'}</span>
          </div>
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-gray-400">Gender</label>
            <span
              className={`px-3 py-1 rounded text-sm font-medium ${
                patient.gender?.toUpperCase() === 'MALE'
                  ? 'bg-blue-500/20 text-blue-400'
                  : patient.gender?.toUpperCase() === 'FEMALE'
                  ? 'bg-pink-500/20 text-pink-400'
                  : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {patient.gender?.toUpperCase() || 'N/A'}
            </span>
          </div>
        </div>

        {/* Date of Birth & Date of Join */}
        <div className="grid grid-cols-2 gap-8 mb-4 border-b border-gray-700 pb-4">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-gray-400">Date of Birth</label>
            <span className="text-white font-medium">{formatDate(patient.date_of_birth) || 'N/A'}</span>
          </div>
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-gray-400">Date of Join</label>
            <span className="text-white font-medium">{formatDate(patient.date_of_join)}</span>
          </div>
        </div>

        {/* Phone & Email */}
        <div className="grid grid-cols-2 gap-8 mb-4 border-b border-gray-700 pb-4">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-gray-400">Phone</label>
            <span className="text-white font-medium">{patient.phone || 'N/A'}</span>
          </div>
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-gray-400">Email</label>
            <span className="text-white font-medium">{patient.email || 'N/A'}</span>
          </div>
        </div>

        {/* Address */}
        <div className="flex justify-between items-start mb-4 border-b border-gray-700 pb-4">
          <label className="text-sm font-medium text-gray-400">Address</label>
          <span className="text-white font-medium text-right max-w-xs">{patient.address || 'N/A'}</span>
        </div>

        {/* Status */}
        <div className="flex justify-between items-center">
          <label className="text-sm font-medium text-gray-400">Status</label>
          <div className="relative">
            <button
              onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
              disabled={isSaving}
              className={`flex items-center px-4 py-2 rounded border border-gray-600 text-white bg-gray-700 hover:bg-gray-600 transition-colors ${
                isSaving ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <span
                className={`inline-block px-3 py-1 rounded text-sm font-medium mr-2 ${getStatusColor(patient.status)}`}
              >
                {patient.status || 'active'}
              </span>
              <span>▼</span>
            </button>
            {statusDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 bg-gray-700 border border-gray-600 rounded shadow-lg z-10">
                <button
                  onClick={() => handleStatusChange('cancelled')}
                  disabled={isSaving}
                  className="block w-full text-left px-4 py-2 text-white hover:bg-gray-600 transition-colors whitespace-nowrap"
                >
                  Cancelled
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Medical Information Section */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-white mb-6">Medical Information</h3>
        
        {/* Medical History */}
        <div className="mb-4 border-b border-gray-700 pb-4">
          <div className="flex justify-between items-start">
            <label className="text-sm font-medium text-gray-400">Medical History</label>
            <p className="text-white whitespace-pre-wrap text-right max-w-xs">{patient.medical_history || 'None'}</p>
          </div>
        </div>

        {/* Allergies */}
        <div className="mb-4 border-b border-gray-700 pb-4">
          <div className="flex justify-between items-start">
            <label className="text-sm font-medium text-gray-400">Allergies</label>
            <p className="text-white whitespace-pre-wrap text-right max-w-xs">{patient.allergies || 'None'}</p>
          </div>
        </div>

        {/* Current Medications */}
        <div className="mb-4 border-b border-gray-700 pb-4">
          <div className="flex justify-between items-start">
            <label className="text-sm font-medium text-gray-400">Current Medications</label>
            <p className="text-white whitespace-pre-wrap text-right max-w-xs">{patient.current_medications || 'None'}</p>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="flex justify-between items-center">
          <label className="text-sm font-medium text-gray-400">Emergency Contact</label>
          <span className="text-white font-medium">
            {patient.emergency_contact_name && patient.emergency_contact_phone
              ? `${patient.emergency_contact_name} - ${patient.emergency_contact_phone}`
              : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
}
