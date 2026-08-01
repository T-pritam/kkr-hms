/**
 * Fixture builders. Each returns a plausible row with sane defaults so a test only
 * has to state the fields it actually cares about.
 *
 * These describe the shape the *code* expects — there is no schema file in the repo,
 * so column sets were derived from the queries in app/api/**.
 */

import { db, type Row } from './fake-supabase'
import { TODAY, THIS_MONTH } from '../setup'

let sequence = 0
const nextId = (prefix: string) => `${prefix}-${String(++sequence).padStart(4, '0')}`

export function aUser(overrides: Row = {}): Row {
  return db.seed('users', {
    id: overrides.id ?? nextId('user'),
    username: 'testuser',
    email: `user${sequence}@hms.test`,
    password_hash: '$2b$04$notarealhashnotarealhashnotarealhashnotarealhash',
    role: 'RECEPTIONIST',
    status: 'ACTIVE',
    needs_password_change: false,
    last_login: null,
    ...overrides,
  })[0]
}

export function aPatient(overrides: Row = {}): Row {
  return db.seed('patients', {
    id: overrides.id ?? nextId('patient'),
    patient_id: `P-${sequence}`,
    name: 'Test Patient',
    phone: '9876543210',
    gender: 'Male',
    date_of_birth: '1990-01-01',
    date_of_join: TODAY,
    address: null,
    referred_by: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    medical_history: null,
    allergies: null,
    current_medications: null,
    status: 'Active',
    ...overrides,
  })[0]
}

export function aBilling(overrides: Row = {}): Row {
  return db.seed('patient_billing', {
    id: overrides.id ?? nextId('billing'),
    patient_id: overrides.patient_id ?? nextId('patient'),
    base_charge: 0,
    patient_charges_total: 0,
    total_doctor_fees: 0,
    total_charges: 0,
    patient_paid_amount: 0,
    referral_commission_amount: 0,
    referral_settled: false,
    referral_settlement_date: null,
    billing_status: 'pending',
    joined_date: TODAY,
    month_year: THIS_MONTH,
    created_by: null,
    ...overrides,
  })[0]
}

export function aDoctor(overrides: Row = {}): Row {
  return db.seed('doctors', {
    id: overrides.id ?? nextId('doctor'),
    name: 'Dr. Test',
    mobile: '9876500000',
    email: `doctor${sequence}@hms.test`,
    designation: 'Consultant',
    specialist: 'General Medicine',
    ...overrides,
  })[0]
}

export function aConsultation(overrides: Row = {}): Row {
  return db.seed('patient_consultations', {
    id: overrides.id ?? nextId('consultation'),
    patient_id: overrides.patient_id ?? nextId('patient'),
    doctor_id: null,
    billing_id: null,
    consultation_date: '2026-03-15T04:30:00.000Z',
    notes: 'Routine check',
    visit_number: 1,
    deleted_at: null,
    created_by: null,
    updated_by: null,
    ...overrides,
  })[0]
}

export function aCharge(overrides: Row = {}): Row {
  return db.seed('patient_charges', {
    id: overrides.id ?? nextId('charge'),
    patient_id: overrides.patient_id ?? nextId('patient'),
    patient_billing_id: overrides.patient_billing_id ?? nextId('billing'),
    charge_type: 'Procedure',
    description: 'Test charge',
    amount: 1000,
    qty: 1,
    charge_date: TODAY,
    created_by: null,
    ...overrides,
  })[0]
}

export function anInstallment(overrides: Row = {}): Row {
  // Note: this table has no patient_id column — installments hang off the billing row.
  return db.seed('patient_billing_installments', {
    id: overrides.id ?? nextId('installment'),
    patient_billing_id: overrides.patient_billing_id ?? nextId('billing'),
    installment_number: 1,
    amount: 500,
    payment_date: TODAY,
    payment_method: 'cash',
    transaction_reference: null,
    remarks: null,
    created_by: null,
    ...overrides,
  })[0]
}

export function aSettlement(overrides: Row = {}): Row {
  const visitCount = overrides.visit_count ?? 1
  const amountPerVisit = overrides.amount_per_visit ?? 0
  return db.seed('doctor_visit_settlements', {
    id: overrides.id ?? nextId('settlement'),
    patient_id: overrides.patient_id ?? nextId('patient'),
    patient_billing_id: overrides.patient_billing_id ?? nextId('billing'),
    doctor_id: overrides.doctor_id ?? nextId('doctor'),
    visit_count: visitCount,
    amount_per_visit: amountPerVisit,
    settled: false,
    settlement_date: null,
    settlement_amount: null,
    payment_method: null,
    transaction_reference: null,
    settlement_notes: null,
    settlement_type: 'regular',
    deleted_at: null,
    created_by: null,
    ...overrides,
  })[0]
}

export function aCaseSheet(overrides: Row = {}): Row {
  return db.seed('patient_case_sheets', {
    id: overrides.id ?? nextId('casesheet'),
    patient_id: overrides.patient_id ?? nextId('patient'),
    patient_billing_id: null,
    discharge_date: TODAY,
    discharge_notes: 'Discharged stable',
    case_sheet_url: 'https://pub-test-account.r2.dev/case-sheets/p1/1700000000_sheet.pdf',
    case_sheet_filename: 'sheet.pdf',
    uploaded_at: null,
    created_by: null,
    ...overrides,
  })[0]
}

export function aTransaction(overrides: Row = {}): Row {
  return db.seed('daily_ledger_transactions', {
    id: overrides.id ?? nextId('txn'),
    transaction_date: TODAY,
    transaction_type: 'credit',
    source: 'opd',
    amount: 500,
    payment_mode: 'cash',
    description: 'OPD collection',
    reference_number: null,
    patient_id: null,
    status: 'pending',
    created_by: null,
    verified_by: null,
    verified_at: null,
    notes: null,
    ...overrides,
  })[0]
}

export function aClosure(overrides: Row = {}): Row {
  return db.seed('daily_ledger_closures', {
    id: overrides.id ?? nextId('closure'),
    closure_date: TODAY,
    opening_balance: 0,
    total_credits: 0,
    total_debits: 0,
    net_balance: 0,
    closing_balance: 0,
    notes: null,
    closed_by: null,
    ...overrides,
  })[0]
}

export function anEmployee(overrides: Row = {}): Row {
  return db.seed('employees', {
    id: overrides.id ?? nextId('employee'),
    name: 'Test Employee',
    designation: 'Nurse',
    base_salary: 27000,
    join_date: '2025-01-01',
    status: 'Active',
    ...overrides,
  })[0]
}

export function aSalaryRecord(overrides: Row = {}): Row {
  return db.seed('salary_payments', {
    id: overrides.id ?? nextId('salary'),
    employee_id: overrides.employee_id ?? nextId('employee'),
    month_year: THIS_MONTH,
    base_salary: 27000,
    total_working_days: 27,
    days_present: 27,
    ot_days: 0,
    total_advance: 0,
    calculated_salary: 27000,
    final_salary: 27000,
    status: 'pending',
    settled_on: null,
    ...overrides,
  })[0]
}

export function anAdvance(overrides: Row = {}): Row {
  return db.seed('advances', {
    id: overrides.id ?? nextId('advance'),
    employee_id: overrides.employee_id ?? nextId('employee'),
    amount: 1000,
    date_given: TODAY,
    month_year: THIS_MONTH,
    remarks: null,
    ...overrides,
  })[0]
}

export function anExpense(overrides: Row = {}): Row {
  return db.seed('expenses', {
    id: overrides.id ?? nextId('expense'),
    expense_type: 'Electric Bill',
    amount: 5000,
    expense_date: TODAY,
    month_year: THIS_MONTH,
    remarks: null,
    ...overrides,
  })[0]
}

export function aReferral(overrides: Row = {}): Row {
  return db.seed('referrals', {
    id: overrides.id ?? nextId('referral'),
    name: 'Test Referrer',
    phone: '9876511111',
    status: 'active',
    ...overrides,
  })[0]
}

export function aLabTest(overrides: Row = {}): Row {
  return db.seed('lab_tests', {
    id: overrides.id ?? nextId('labtest'),
    name: 'Complete Blood Count',
    code: `CBC-${sequence}`,
    category: 'Hematology',
    description: null,
    sample_type: 'Whole Blood (EDTA)',
    price: 350,
    is_active: true,
    method: 'Automated Cell Counter',
    interpretation_template: null,
    ...overrides,
  })[0]
}

export function aTestParameter(overrides: Row = {}): Row {
  return db.seed('test_parameters', {
    id: overrides.id ?? nextId('param'),
    test_id: overrides.test_id ?? nextId('labtest'),
    name: 'Haemoglobin',
    unit: 'g/dL',
    min_value: 13,
    max_value: 17,
    gender_specific: false,
    male_min: null,
    male_max: null,
    female_min: null,
    female_max: null,
    display_order: 1,
    is_active: true,
    param_type: 'numeric',
    code: null,
    method: null,
    options: null,
    formula: null,
    decimals: 2,
    group_name: null,
    ...overrides,
  })[0]
}

export function aParameterRange(overrides: Row = {}): Row {
  return db.seed('test_parameter_ranges', {
    id: overrides.id ?? nextId('range'),
    parameter_id: overrides.parameter_id ?? nextId('param'),
    gender: null,
    age_min_years: null,
    age_max_years: null,
    range_type: 'between',
    min_value: 13,
    max_value: 17,
    text_range: null,
    display_text: null,
    normal_options: null,
    critical_low: null,
    critical_high: null,
    display_order: 0,
    ...overrides,
  })[0]
}

export function aLabOrder(overrides: Row = {}): Row {
  const total = overrides.total_amount ?? 350
  const discount = overrides.discount ?? 0
  return db.seed('lab_orders', {
    id: overrides.id ?? nextId('laborder'),
    order_no: overrides.order_no ?? `LAB/2026/${String(sequence).padStart(5, '0')}`,
    patient_id: null,
    patient_name: 'Walk-in Patient',
    patient_phone: '9876522222',
    patient_age: 35,
    patient_gender: 'male',
    patient_display_id: null,
    patient_status: null,
    referring_doctor_id: null,
    referring_doctor_name: null,
    priority: 'routine',
    status: 'registered',
    registered_at: `${TODAY}T09:00:00.000Z`,
    collected_at: null,
    received_at: null,
    reported_at: null,
    collected_by: null,
    created_by: null,
    total_amount: total,
    discount,
    net_amount: overrides.net_amount ?? total - discount,
    notes: null,
    ...overrides,
  })[0]
}

export function aLabOrderItem(overrides: Row = {}): Row {
  return db.seed('lab_order_items', {
    id: overrides.id ?? nextId('orderitem'),
    order_id: overrides.order_id ?? nextId('laborder'),
    test_id: overrides.test_id ?? nextId('labtest'),
    test_name: 'Complete Blood Count',
    test_code: 'CBC',
    category: 'Hematology',
    specimen: 'Whole Blood (EDTA)',
    method: 'Automated Cell Counter',
    price: 350,
    status: 'pending',
    interpretation: null,
    interpretation_by: null,
    interpretation_at: null,
    entered_by: null,
    entered_at: null,
    authorised_by: null,
    authorised_at: null,
    display_order: 0,
    ...overrides,
  })[0]
}

export function aLabResultValue(overrides: Row = {}): Row {
  return db.seed('lab_result_values', {
    id: overrides.id ?? nextId('value'),
    order_item_id: overrides.order_item_id ?? nextId('orderitem'),
    parameter_id: overrides.parameter_id ?? nextId('param'),
    value: 14,
    text_value: null,
    unit: 'g/dL',
    ref_display: '13 - 17',
    ref_min: 13,
    ref_max: 17,
    abnormal: null,
    is_critical: false,
    notes: null,
    ...overrides,
  })[0]
}

export function aTestResult(overrides: Row = {}): Row {
  const price = overrides.price ?? 350
  const discount = overrides.discount ?? 0
  return db.seed('patient_test_results', {
    id: overrides.id ?? nextId('result'),
    patient_id: null,
    test_id: overrides.test_id ?? nextId('labtest'),
    test_date: TODAY,
    sample_collected_at: null,
    result_issued_at: null,
    price,
    discount,
    final_price: overrides.final_price ?? price - discount,
    status: 'pending',
    reference_doctor_id: null,
    conducted_by: null,
    verified_by: null,
    patient_name: 'Walk-in Patient',
    patient_phone: '9876522222',
    patient_age: 35,
    patient_gender: 'male',
    notes: null,
    ...overrides,
  })[0]
}

export function aTestResultValue(overrides: Row = {}): Row {
  return db.seed('test_result_values', {
    id: overrides.id ?? nextId('value'),
    result_id: overrides.result_id ?? nextId('result'),
    parameter_id: overrides.parameter_id ?? nextId('param'),
    value: 14,
    text_value: null,
    flag: 'normal',
    unit: 'g/dL',
    ref_min: 13,
    ref_max: 17,
    notes: null,
    ...overrides,
  })[0]
}

export function aResetToken(overrides: Row = {}): Row {
  return db.seed('password_reset_tokens', {
    id: overrides.id ?? nextId('resettoken'),
    user_id: overrides.user_id ?? nextId('user'),
    token_hash: 'deadbeef',
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    is_used: false,
    used_at: null,
    ...overrides,
  })[0]
}
