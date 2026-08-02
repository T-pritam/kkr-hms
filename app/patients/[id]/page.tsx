'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, User, Stethoscope, DollarSign, CreditCard, FileText, Receipt, FlaskConical } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import PatientInfoTab from '@/components/patients/patient-info-tab';
import DoctorVisitsTab from '@/components/patients/doctor-visits-tab';
import ChargesTab from '@/components/patients/charges-tab';
import PaymentsTab from '@/components/patients/payments-tab';
import CaseSheetTab from '@/components/patients/case-sheet-tab';
import BillingSettlementTab from '@/components/patients/billing-settlement-tab';
import LabHistoryTab from '@/components/patients/lab-history-tab';
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch';
import { formatAgeSex } from '@/lib/patients/age';

type Tab = 'info' | 'visits' | 'charges' | 'payments' | 'lab' | 'casesheet' | 'billing';

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

  const refreshAll = () => { fetchPatientData(); fetchBilling(); };
  useRealtimeRefetch(
    ['patients', 'patient_billing', 'patient_charges', 'patient_consultations', 'patient_case_sheets', 'patient_billing_installments'],
    refreshAll
  );

  const fetchPatientData = async () => {
    try {
      // The list endpoint ignores an `id` query parameter and returns page one,
      // so this used to set patientData to the pagination envelope and every
      // field in the header below rendered blank.
      const response = await fetch(`/api/patients/${patientId}`);
      if (response.ok) {
        const data = await response.json();
        setPatientData(data.patient ?? data);
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
    { id: 'lab' as Tab, label: 'Lab', icon: FlaskConical },
    { id: 'casesheet' as Tab, label: 'Case Sheet & Discharge', icon: FileText },
    { id: 'billing' as Tab, label: 'Billing & Settlement', icon: Receipt },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted">Loading patient details...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header Card */}
        <div className="bg-gradient-to-r from-surface to-background rounded-lg border border-border p-4 sm:p-6">
          <div className="flex items-start gap-3 sm:gap-6">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-surface-hover rounded-lg transition-colors flex-shrink-0"
              title="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-foreground truncate">
                {patientData?.name || 'Patient Details'}
              </h1>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
                <div>
                  <p className="text-muted">Patient ID</p>
                  <p className="font-mono text-info">{patientData?.patient_id}</p>
                </div>
                <div>
                  <p className="text-muted">Joined</p>
                  <p className="text-foreground">
                    {patientData?.date_of_join
                      ? new Date(patientData.date_of_join).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-muted">Age / Sex</p>
                  {/* `patientData.age` was read here for months. There has never
                      been such a column — resolveAge derives it from the date of
                      birth, or from the age the patient stated at the desk. */}
                  <p className="text-foreground">{formatAgeSex(patientData) || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted">Phone</p>
                  <p className="text-foreground">{patientData?.phone || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-surface rounded-lg border border-input-border p-3 sm:p-6">
          <div className="flex overflow-x-auto gap-0 -mx-3 px-3 sm:-mx-6 sm:px-6 mb-4 sm:mb-6 border-b border-input-border">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-3 sm:py-4 min-h-[44px] border-b-2 transition-all whitespace-nowrap text-xs sm:text-sm font-medium ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
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

            {activeTab === 'lab' && (
              <LabHistoryTab patientId={patientId} />
            )}

            {activeTab === 'casesheet' && (
              <CaseSheetTab
                patientId={patientId}
                billing={billing}
                patientName={patientData?.name}
                patientJoinDate={patientData?.date_of_join}
                onStatusChange={(s) => setPatientData((prev: any) => ({ ...prev, status: s }))}
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
