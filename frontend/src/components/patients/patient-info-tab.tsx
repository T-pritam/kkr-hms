import { apiFetch } from '@/lib/api'
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
    return <div className="text-muted">Loading patient information...</div>;
  }

  const handleStatusChange = async (newStatus: string) => {
    setIsSaving(true);
    try {
      const response = await apiFetch(`/api/patients/${patient.id}`, {
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
    if (normalizedStatus === 'active') return 'bg-success-subtle text-success-text';
    if (normalizedStatus === 'cancelled') return 'bg-destructive-subtle text-destructive';
    if (normalizedStatus === 'discharged') return 'bg-info-subtle text-info';
    return 'bg-surface-hover text-muted';
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
    <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-0 sm:pr-4">
      {/* Patient Information Section */}
      <div className="bg-surface-hover rounded-lg p-4 sm:p-6">
        <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-4 sm:mb-6">Patient Information</h3>
        
        {/* Full Name & Gender */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 mb-4 border-b border-input-border pb-4">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-muted">Full Name</label>
            <span className="text-foreground font-medium">{patient.name || 'N/A'}</span>
          </div>
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-muted">Gender</label>
            <span
              className={`px-3 py-1 rounded text-sm font-medium ${
                patient.gender?.toUpperCase() === 'MALE'
                  ? 'bg-info-subtle text-info'
                  : patient.gender?.toUpperCase() === 'FEMALE'
                  ? 'bg-accent-subtle text-accent'
                  : 'bg-surface-hover text-muted'
              }`}
            >
              {patient.gender?.toUpperCase() || 'N/A'}
            </span>
          </div>
        </div>

        {/* Date of Birth & Date of Join */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 mb-4 border-b border-input-border pb-4">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-muted">Date of Birth</label>
            <span className="text-foreground font-medium">{formatDate(patient.date_of_birth) || 'N/A'}</span>
          </div>
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-muted">Date of Join</label>
            <span className="text-foreground font-medium">{formatDate(patient.date_of_join)}</span>
          </div>
        </div>

        {/* Phone & Email */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 mb-4 border-b border-input-border pb-4">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-muted">Phone</label>
            <span className="text-foreground font-medium">{patient.phone || 'N/A'}</span>
          </div>
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-muted">Email</label>
            <span className="text-foreground font-medium">{patient.email || 'N/A'}</span>
          </div>
        </div>

        {/* Address */}
        <div className="flex justify-between items-start mb-4 border-b border-input-border pb-4">
          <label className="text-sm font-medium text-muted">Address</label>
          <span className="text-foreground font-medium text-right max-w-xs">{patient.address || 'N/A'}</span>
        </div>

        {/* Status */}
        <div className="flex justify-between items-center">
          <label className="text-sm font-medium text-muted">Status</label>
          <div className="relative">
            <button
              onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
              disabled={isSaving}
              className={`flex items-center px-4 py-2 rounded border border-border text-foreground bg-surface-inset hover:bg-surface-hover transition-colors ${
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
              <div className="absolute top-full right-0 mt-2 bg-surface-inset border border-border rounded shadow-lg z-10">
                <button
                  onClick={() => handleStatusChange('cancelled')}
                  disabled={isSaving}
                  className="block w-full text-left px-4 py-2 text-foreground hover:bg-surface-hover transition-colors whitespace-nowrap"
                >
                  Cancelled
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Medical Information Section */}
      <div className="bg-surface-hover rounded-lg p-4 sm:p-6">
        <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-4 sm:mb-6">Medical Information</h3>
        
        {/* Medical History */}
        <div className="mb-4 border-b border-input-border pb-4">
          <div className="flex justify-between items-start">
            <label className="text-sm font-medium text-muted">Medical History</label>
            <p className="text-foreground whitespace-pre-wrap text-right max-w-xs">{patient.medical_history || 'None'}</p>
          </div>
        </div>

        {/* Allergies */}
        <div className="mb-4 border-b border-input-border pb-4">
          <div className="flex justify-between items-start">
            <label className="text-sm font-medium text-muted">Allergies</label>
            <p className="text-foreground whitespace-pre-wrap text-right max-w-xs">{patient.allergies || 'None'}</p>
          </div>
        </div>

        {/* Current Medications */}
        <div className="mb-4 border-b border-input-border pb-4">
          <div className="flex justify-between items-start">
            <label className="text-sm font-medium text-muted">Current Medications</label>
            <p className="text-foreground whitespace-pre-wrap text-right max-w-xs">{patient.current_medications || 'None'}</p>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="flex justify-between items-center">
          <label className="text-sm font-medium text-muted">Emergency Contact</label>
          <span className="text-foreground font-medium">
            {patient.emergency_contact_name && patient.emergency_contact_phone
              ? `${patient.emergency_contact_name} - ${patient.emergency_contact_phone}`
              : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
}
