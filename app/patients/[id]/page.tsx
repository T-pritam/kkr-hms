'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, User, Stethoscope, DollarSign, CreditCard, FileText, Receipt } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import PatientInfoTab from '@/components/patients/patient-info-tab';
import DoctorVisitsTab from '@/components/patients/doctor-visits-tab';
import ChargesTab from '@/components/patients/charges-tab';
import PaymentsTab from '@/components/patients/payments-tab';
import CaseSheetTab from '@/components/patients/case-sheet-tab';
import BillingSettlementTab from '@/components/patients/billing-settlement-tab';

type Tab = 'info' | 'visits' | 'charges' | 'payments' | 'casesheet' | 'billing';

export default function PatientDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.id as string;

  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [patientData, setPatientData] = useState<any>(null);
  const [billing, setBilling] = useState<any>(null);
  const [isCreatingBilling, setIsCreatingBilling] = useState(false);
  const [loading, setLoading] = useState(true);
  const billingCreationInProgress = useRef(false);
  const doctorVisitsRefreshKey = useRef(0);

  useEffect(() => {
    if (patientId) {
      fetchPatientData();
      fetchBilling();
    }
  }, [patientId]);

  const fetchPatientData = async () => {
    try {
      const response = await fetch(`/api/patients?id=${patientId}`);
      if (response.ok) {
        const data = await response.json();
        const patient = Array.isArray(data) ? data[0] : data;
        setPatientData(patient);
      }
    } catch (error) {
      console.error('Error fetching patient data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBilling = async () => {
    try {
      const response = await fetch(`/api/patients/${patientId}/billing`);
      if (response.ok) {
        const data = await response.json();
        if (data.billings && Array.isArray(data.billings)) {
          const billingRecord = data.billings[0];
          if (billingRecord && data.referral) {
            billingRecord.referral = data.referral;
          }
          setBilling(billingRecord || null);
        } else if (Array.isArray(data)) {
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
    if (isCreatingBilling || billingCreationInProgress.current) {
      console.log('Billing creation already in progress');
      return;
    }

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

  const refreshDoctorVisits = () => {
    doctorVisitsRefreshKey.current += 1;
  };

  const handleBillingUpdate = async () => {
    await fetchBilling();
    refreshDoctorVisits();
  };

  const tabs = [
    { id: 'info' as Tab, label: 'Patient Info', icon: User },
    { id: 'visits' as Tab, label: 'Doctor Visits', icon: Stethoscope },
    { id: 'charges' as Tab, label: 'Charges', icon: DollarSign },
    { id: 'payments' as Tab, label: 'Payments', icon: CreditCard },
    { id: 'casesheet' as Tab, label: 'Case Sheet & Discharge', icon: FileText },
    { id: 'billing' as Tab, label: 'Billing & Settlement', icon: Receipt },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-400">Loading patient details...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header Card */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-950 rounded-lg border border-gray-600 p-6">
          <div className="flex items-start gap-6">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-600 rounded-lg transition-colors flex-shrink-0"
              title="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-white truncate">
                {patientData?.name || 'Patient Details'}
              </h1>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
                <div>
                  <p className="text-gray-400">Patient ID</p>
                  <p className="font-mono text-blue-400">{patientData?.patient_id}</p>
                </div>
                <div>
                  <p className="text-gray-400">Joined</p>
                  <p className="text-gray-300">{patientData?.date_of_join}</p>
                </div>
                <div>
                  <p className="text-gray-400">Age</p>
                  <p className="text-gray-300">{patientData?.age || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-400">Phone</p>
                  <p className="text-gray-300">{patientData?.phone || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-gray-900 rounded-lg border border-gray-700 p-6">
          <div className="flex overflow-x-auto gap-0 -mx-6 px-6 mb-6 border-b border-gray-700">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-4 border-b-2 transition-all whitespace-nowrap text-sm font-medium ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="animate-fadeIn">
            {activeTab === 'info' && patientData && (
              <PatientInfoTab patient={patientData} />
            )}

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
              />
            )}

            {activeTab === 'billing' && billing !== undefined && (
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
    </DashboardLayout>
  );
}
