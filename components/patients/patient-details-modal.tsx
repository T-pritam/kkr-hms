'use client';

import { useState, useEffect, useRef } from 'react';
import { X, User, Stethoscope, DollarSign, CreditCard, FileText, Receipt } from 'lucide-react';
import PatientInfoTab from './patient-info-tab';
import DoctorVisitsTab from './doctor-visits-tab';
import ChargesTab from './charges-tab';
import PaymentsTab from './payments-tab';
import CaseSheetTab from './case-sheet-tab';
import BillingSettlementTab from './billing-settlement-tab';

interface PatientDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientData: any;
}

type Tab = 'info' | 'visits' | 'charges' | 'payments' | 'casesheet' | 'billing';

export default function PatientDetailsModal({
  isOpen,
  onClose,
  patientId,
  patientData,
}: PatientDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [billing, setBilling] = useState<any>(null);
  const [isCreatingBilling, setIsCreatingBilling] = useState(false);
  const billingCreationInProgress = useRef(false);
  const doctorVisitsRefreshKey = useRef(0);

  useEffect(() => {
    if (isOpen && patientId) {
      fetchBilling();
    }
  }, [isOpen, patientId]);

  const fetchBilling = async () => {
    try {
      const response = await fetch(`/api/patients/${patientId}/billing`);
      if (response.ok) {
        const data = await response.json();
        // Handle new API response structure with billings array and referral object
        if (data.billings && Array.isArray(data.billings)) {
          const billingRecord = data.billings[0];
          if (billingRecord && data.referral) {
            billingRecord.referral = data.referral;
          }
          setBilling(billingRecord || null);
        } else if (Array.isArray(data)) {
          // Fallback for old API response structure
          setBilling(data[0] || null);
        } else {
          setBilling(null);
        }
      }
    } catch (error) {
      console.error('Error fetching billing:', error);
    }
  };

  const createBilling = async () => {
    // Prevent duplicate creation attempts
    if (isCreatingBilling || billingCreationInProgress.current) {
      console.log('Billing creation already in progress');
      return;
    }

    // Don't create if billing already exists
    if (billing) {
      console.log('Billing already exists:', billing.id);
      return;
    }

    try {
      setIsCreatingBilling(true);
      billingCreationInProgress.current = true;

      const response = await fetch(`/api/patients/${patientId}/billing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_charge: 0,
          referral_commission_amount: 0,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setBilling(data);
        billingCreationInProgress.current = false;
      }
    } catch (error) {
      console.error('Error creating billing:', error);
      billingCreationInProgress.current = false;
    } finally {
      setIsCreatingBilling(false);
    }
  };

  // Refresh doctor visits when settlements are updated
  const refreshDoctorVisits = () => {
    doctorVisitsRefreshKey.current += 1;
  };

  // Handle billing updates from BillingSettlementTab
  const handleBillingUpdate = async () => {
    await fetchBilling();
    // Also refresh doctor visits to show updated amounts
    refreshDoctorVisits();
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'info' as Tab, label: 'Patient Info', icon: User },
    { id: 'visits' as Tab, label: 'Doctor Visits', icon: Stethoscope },
    { id: 'charges' as Tab, label: 'Charges', icon: DollarSign },
    { id: 'payments' as Tab, label: 'Payments', icon: CreditCard },
    { id: 'casesheet' as Tab, label: 'Case Sheet & Discharge', icon: FileText },
    { id: 'billing' as Tab, label: 'Billing & Settlement', icon: Receipt },
  ];

  return (
    <div className="fixed inset-0 bg-overlay flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-surface rounded-t-2xl sm:rounded-lg shadow-xl w-full h-[95vh] sm:h-auto sm:max-h-[90vh] sm:max-w-7xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-input-border shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-2xl font-bold text-foreground truncate">
              Patient Details: {patientData?.name || 'Loading...'}
            </h2>
            <p className="text-muted mt-1 text-xs sm:text-sm">
              ID: {patientData?.patient_id} | Joined: {patientData?.date_of_join}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors p-2 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-input-border px-3 sm:px-6 overflow-x-auto shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-3 min-h-[44px] border-b-2 transition-colors whitespace-nowrap text-xs sm:text-sm ${
                  activeTab === tab.id
                    ? 'border-info text-info'
                    : 'border-transparent text-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          {activeTab === 'info' && <PatientInfoTab patient={patientData} />}
          
          {activeTab === 'visits' && (
            <DoctorVisitsTab
              key={`doctor-visits-${doctorVisitsRefreshKey.current}`}
              patientId={patientId}
              patientJoinDate={patientData?.date_of_join}
              billing={billing}
              onCreateBilling={createBilling}
            />
          )}
          
          {activeTab === 'charges' && (
            <ChargesTab
              patientId={patientId}
              billing={billing}
              onCreateBilling={createBilling}
            />
          )}
          
          {activeTab === 'payments' && (
            <PaymentsTab
              patientId={patientId}
              billing={billing}
              onCreateBilling={createBilling}
            />
          )}
          
          {activeTab === 'casesheet' && (
            <CaseSheetTab
              patientId={patientId}
              billing={billing}
              patientName={patientData?.name}
              onStatusChange={undefined}
            />
          )}
          
          {activeTab === 'billing' && (
            <BillingSettlementTab
              patientId={patientId}
              billing={billing}
              onCreateBilling={createBilling}
              onBillingUpdate={handleBillingUpdate}
              onSettlementUpdate={refreshDoctorVisits}
            />
          )}
        </div>
      </div>
    </div>
  );
}
