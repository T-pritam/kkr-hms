'use client';

import { useState, useEffect } from 'react';
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
        setBilling(data[0] || null);
      }
    } catch (error) {
      console.error('Error fetching billing:', error);
    }
  };

  const createBilling = async () => {
    try {
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
      }
    } catch (error) {
      console.error('Error creating billing:', error);
    }
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white">
              Patient Details: {patientData?.name || 'Loading...'}
            </h2>
            <p className="text-gray-400 mt-1">
              ID: {patientData?.patient_id} | Joined: {patientData?.date_of_join}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 px-6 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-500'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'info' && <PatientInfoTab patient={patientData} />}
          
          {activeTab === 'visits' && (
            <DoctorVisitsTab
              patientId={patientId}
              patientJoinDate={patientData?.date_of_join}
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
            />
          )}
          
          {activeTab === 'billing' && (
            <BillingSettlementTab
              patientId={patientId}
              billing={billing}
              onCreateBilling={createBilling}
              onBillingUpdate={fetchBilling}
            />
          )}
        </div>
      </div>
    </div>
  );
}
