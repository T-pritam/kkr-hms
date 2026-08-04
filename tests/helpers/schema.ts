/**
 * The real column list of every table in the `public` schema, dumped from the live
 * Supabase project (bmbbifxkjqmdqriootdw) with:
 *
 *   SELECT table_name, string_agg(column_name, ',' ORDER BY ordinal_position)
 *   FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name;
 *
 * The fake client validates every select, filter and write payload against this, and
 * raises the same errors PostgREST would for an unknown column. That turns schema drift
 * — a route referencing a column the database does not have — into a failing test
 * instead of a silent production 400.
 *
 * Re-dump this whenever the schema changes.
 */

export const SCHEMA: Record<string, string[]> = {
  advances: [
    'id', 'employee_id', 'amount', 'date_given', 'month_year', 'remarks', 'created_at',
    // 20260804000003 — who handed it over, and who recorded it
    'given_by', 'created_by', 'updated_by', 'updated_at',
  ],

  daily_ledger_closures: [
    'id', 'closure_date', 'total_credits_cash', 'total_credits_upi', 'total_credits_other',
    'total_credits', 'total_debits', 'net_balance', 'transaction_count', 'credit_count',
    'debit_count', 'closed_at', 'closed_by', 'notes', 'opening_balance', 'closing_balance',
  ],

  daily_ledger_transactions: [
    'id', 'transaction_date', 'transaction_type', 'source', 'amount', 'payment_mode',
    'reference_number', 'patient_id', 'description', 'notes', 'status', 'created_at',
    'created_by', 'verified_at', 'verified_by',
    // 20260806000003 — the category the expense form always collected and never sent.
    'expense_category', 'expense_category_detail',
  ],

  doctor_visit_settlements: [
    'id', 'patient_billing_id', 'patient_id', 'doctor_id', 'visit_count', 'amount_per_visit',
    'total_amount', 'settled', 'settlement_date', 'settlement_amount', 'settlement_notes',
    'payment_method', 'transaction_reference', 'created_at', 'updated_at', 'created_by',
    'updated_by', 'deleted_at', 'settlement_type',
  ],

  doctors: [
    'id', 'name', 'mobile', 'email', 'designation', 'specialist', 'created_at', 'updated_at',
    'created_by', 'updated_by',
    // 20260803000004 — registry upgrade
    'qualification', 'registration_no', 'department', 'is_active',
  ],

  case_sheet_attachments: [
    'id', 'case_sheet_id', 'file_url', 'file_key', 'filename', 'size_bytes', 'uploaded_by',
    'uploaded_at', 'display_order',
  ],

  case_sheet_counters: ['year', 'last_no'],

  case_sheet_doctors: [
    'id', 'case_sheet_id', 'doctor_id', 'doctor_name', 'doctor_specialist', 'display_order',
    'created_at',
  ],

  case_sheet_medications: [
    'id', 'case_sheet_id', 'medicine_id', 'medicine_name', 'dosage', 'quantity', 'usage',
    'display_order', 'created_at', 'updated_at',
  ],

  medicines: [
    'id', 'name', 'form', 'strength', 'is_active', 'created_by', 'created_at', 'updated_at',
    'updated_by',
  ],

  record_audit_log: [
    'id', 'entity_type', 'entity_id', 'patient_id', 'action', 'changes', 'summary',
    'actor_id', 'actor_name', 'actor_role', 'created_at',
  ],

  employees: [
    'id', 'name', 'designation', 'base_salary', 'join_date', 'status', 'created_at', 'updated_at',
    // 20260804000001 — registration fields
    'employee_code', 'phone', 'address', 'emergency_contact_name', 'emergency_contact_relation',
    'emergency_contact_phone', 'date_of_birth', 'gender', 'id_proof_type', 'id_proof_number',
    'bank_account_no', 'bank_ifsc',
    // 20260804000003 — attribution
    'created_by', 'updated_by',
  ],

  employee_counters: ['year', 'last_no'],

  // `expense_type_detail` — 20260806000002, what a 'Miscellaneous' expense actually was.
  expenses: [
    'id', 'expense_type', 'amount', 'expense_date', 'month_year', 'remarks', 'created_at',
    'expense_type_detail',
  ],

  lab_interpretation_templates: [
    'id', 'test_id', 'title', 'body', 'is_active', 'created_by', 'created_at', 'updated_at',
  ],

  lab_order_counters: ['year', 'last_no'],

  lab_order_items: [
    'id', 'order_id', 'test_id', 'test_name', 'test_code', 'category', 'specimen', 'method',
    'price', 'status', 'interpretation', 'interpretation_by', 'interpretation_at',
    'entered_by', 'entered_at', 'authorised_by', 'authorised_at', 'display_order',
    'created_at', 'updated_at', 'updated_by',
  ],

  lab_orders: [
    'id', 'order_no', 'patient_id', 'patient_name', 'patient_phone', 'patient_age',
    'patient_gender', 'patient_display_id', 'patient_status', 'referring_doctor_id',
    'referring_doctor_name', 'priority', 'status', 'registered_at', 'collected_at',
    'received_at', 'reported_at', 'collected_by', 'created_by', 'total_amount', 'discount',
    'net_amount', 'notes', 'created_at', 'updated_at', 'updated_by',
  ],

  lab_result_values: [
    'id', 'order_item_id', 'parameter_id', 'value', 'text_value', 'unit', 'ref_display',
    'ref_min', 'ref_max', 'abnormal', 'is_critical', 'notes', 'created_at', 'updated_at',
  ],

  lab_tests: [
    'id', 'name', 'code', 'category', 'description', 'sample_type', 'price', 'is_active',
    'method', 'interpretation_template', 'created_at', 'updated_at',
  ],

  password_reset_tokens: ['id', 'user_id', 'token_hash', 'expires_at', 'is_used', 'created_at', 'used_at'],

  patient_billing: [
    'id', 'patient_id', 'base_charge', 'referral_commission_amount', 'referral_settled',
    'referral_settlement_date', 'referral_settlement_notes', 'total_doctor_fees', 'billing_status',
    'created_at', 'updated_at', 'created_by', 'updated_by', 'patient_charges_total', 'total_charges',
    'patient_paid_amount', 'payment_status', 'joined_date', 'month_year', 'referral_transaction_ref',
    'referral_settlement_payment_method', 'referral_commission_included_in_package',
    'doctor_fees_included_in_package',
  ],

  patient_billing_installments: [
    'id', 'patient_billing_id', 'installment_number', 'amount', 'payment_date', 'payment_method',
    'transaction_reference', 'remarks', 'created_at', 'created_by', 'updated_at', 'updated_by',
  ],

  patient_case_sheets: [
    'id', 'patient_id', 'patient_billing_id', 'discharge_date', 'discharge_notes', 'case_sheet_url',
    'case_sheet_filename', 'uploaded_at', 'created_at', 'created_by', 'updated_at', 'updated_by',
    'admission_date', 'ward', 'bed', 'chief_complaints', 'history_present_illness', 'past_history',
    'diagnosis', 'investigations', 'clinical_summary', 'advice_notes', 'condition_on_discharge',
    'vitals_bp', 'vitals_pulse', 'vitals_temp', 'vitals_spo2', 'follow_up_date',
    'follow_up_instructions', 'summary_no', 'status', 'finalised_by', 'finalised_at',
  ],

  patient_charges: [
    'id', 'patient_billing_id', 'patient_id', 'charge_type', 'description', 'amount', 'charge_date',
    'created_at', 'created_by', 'updated_at', 'updated_by', 'qty',
  ],

  patient_consultations: [
    'id', 'patient_id', 'doctor_id', 'consultation_date', 'visit_number', 'price_per_visit',
    'payment_status', 'notes', 'created_at', 'updated_at', 'created_by', 'updated_by', 'deleted_at',
    'billing_id',
  ],

  patient_test_results: [
    'id', 'patient_id', 'test_id', 'test_date', 'sample_collected_at', 'result_issued_at', 'price',
    'discount', 'final_price', 'status', 'reference_doctor_id', 'conducted_by', 'verified_by', 'notes',
    'created_at', 'updated_at', 'patient_name', 'patient_phone', 'patient_age', 'patient_gender',
  ],

  patients: [
    'id', 'patient_id', 'name', 'phone', 'gender', 'date_of_birth', 'date_of_join', 'address',
    'referred_by', 'emergency_contact_name', 'emergency_contact_phone', 'medical_history', 'allergies',
    'current_medications', 'status', 'created_at', 'updated_at', 'created_by', 'updated_by',
    // 20260803000001 — registration fields
    'age_years', 'age_recorded_on', 'blood_group', 'email', 'alternate_phone',
    'emergency_contact_relation', 'id_proof_type', 'id_proof_number',
  ],

  patient_counters: ['year', 'last_no'],

  referrals: ['id', 'name', 'phone', 'status', 'created_at', 'updated_at', 'created_by', 'updated_by'],

  salary_payments: [
    'id', 'employee_id', 'month_year', 'base_salary', 'total_working_days', 'days_present',
    'total_advance', 'calculated_salary', 'final_salary', 'status', 'settled_on', 'created_at',
    'updated_at', 'ot_days',
    // 20260804000003 — settled_on recorded when; these record who
    'created_by', 'updated_by', 'settled_by',
  ],

  test_parameter_ranges: [
    'id', 'parameter_id', 'gender', 'age_min_years', 'age_max_years', 'range_type',
    'min_value', 'max_value', 'text_range', 'display_text', 'normal_options',
    'critical_low', 'critical_high', 'display_order', 'created_at', 'updated_at',
  ],

  test_parameters: [
    'id', 'test_id', 'name', 'unit', 'min_value', 'max_value', 'gender_specific', 'male_min',
    'male_max', 'female_min', 'female_max', 'display_order', 'is_active', 'created_at',
    'param_type', 'code', 'method', 'options', 'formula', 'decimals', 'group_name', 'updated_at',
  ],

  test_result_values: [
    'id', 'result_id', 'parameter_id', 'value', 'text_value', 'flag', 'unit', 'ref_min', 'ref_max',
    'notes', 'created_at',
  ],

  users: [
    'id', 'username', 'email', 'password_hash', 'role', 'status', 'needs_password_change',
    'reset_token', 'reset_token_expiry', 'last_login', 'created_at', 'updated_at',
  ],
}

/** Column names that are valid in a select because they name an embedded table, not a column. */
export const EMBEDDABLE_TABLES = new Set(Object.keys(SCHEMA))

export function isKnownTable(table: string): boolean {
  return table in SCHEMA
}

export function isKnownColumn(table: string, column: string): boolean {
  const columns = SCHEMA[table]
  if (!columns) return true // unknown table — validated separately
  return columns.includes(column)
}
