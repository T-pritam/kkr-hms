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
    // 20260807000001 — one active closure per date, reopenable, with the per-mode
    // breakdown the old close routine silently dropped `card` from.
    'status', 'version', 'supersedes_id', 'reopened_at', 'reopened_by', 'reopen_reason',
    'unverified_count', 'total_credits_card', 'total_credits_bank_transfer',
    'total_credits_cheque', 'total_debits_cash', 'closing_cash_balance',
  ],

  // 20260807000002 — a shift settlement is a cash handover, not a date lock.
  daily_ledger_shift_settlements: [
    'id', 'settlement_date', 'employee_id',
    'total_credits', 'total_debits', 'net_balance',
    'credits_cash', 'credits_upi', 'credits_card', 'credits_bank_transfer', 'credits_cheque',
    'debits_cash', 'cash_expected', 'cash_handed_over', 'transaction_count',
    'notes', 'settled_at', 'settled_by',
    'status', 'reversed_at', 'reversed_by', 'reversal_reason',
  ],

  daily_ledger_transactions: [
    'id', 'transaction_date', 'transaction_type', 'source', 'amount', 'payment_mode',
    'reference_number', 'patient_id', 'description', 'notes', 'status', 'created_at',
    'created_by', 'verified_at', 'verified_by',
    // 20260806000003 — the category the expense form always collected and never sent.
    'expense_category', 'expense_category_detail',
  ],

  doctor_fee_schedule: [
    // 20260808000004 — per-doctor, per-purpose rate card
    'id', 'doctor_id', 'visit_purpose_id', 'fee', 'is_active',
    'created_at', 'created_by', 'updated_at', 'updated_by',
  ],

  doctor_visit_settlements: [
    'id', 'patient_billing_id', 'patient_id', 'doctor_id', 'visit_count', 'amount_per_visit',
    'total_amount', 'settled', 'settlement_date', 'settlement_amount', 'settlement_notes',
    'payment_method', 'transaction_reference', 'created_at', 'updated_at', 'created_by',
    'updated_by', 'deleted_at', 'settlement_type',
    // 20260805000003 — who handed the payout over (was missing from this dump)
    'given_by',
    // 20260808000005 — settlements are per purpose, not per doctor
    'visit_purpose_id',
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

  // 20260808000001 — the charge master. Replaces the hardcoded dropdown that
  // used to live in components/patients/charges-tab.tsx.
  charge_items: [
    'id', 'code', 'name', 'category', 'billing_mode', 'default_price', 'unit_label',
    'is_active', 'notes', 'created_at', 'created_by', 'updated_at', 'updated_by',
  ],

  // 20260808000003 — temporary charge sheets. Not billing until forwarded.
  charge_sheets: [
    'id', 'sheet_no', 'subject_type', 'patient_id',
    'opd_name', 'opd_phone', 'opd_age', 'opd_gender',
    'status', 'total_amount', 'notes',
    'forwarded_at', 'forwarded_by', 'forwarded_billing_id',
    'created_at', 'created_by', 'updated_at', 'updated_by',
  ],

  charge_sheet_items: [
    'id', 'charge_sheet_id', 'charge_item_id', 'description', 'unit_price', 'qty',
    'service_date', 'line_total', 'created_at', 'updated_at',
    // 20260810000002 — parity with patient charges: how the line is billed, and
    // the name split out from the note beside it
    'billing_mode', 'charge_name',
  ],

  charge_sheet_counters: ['scope', 'last_no'],

  // 20260809000006 — pharmacy bills fetched once from SmartPharma360 and stored
  pharmacy_bills: [
    'id', 'patient_id', 'patient_charge_id', 'external_bill_id', 'entry_number', 'entry_date',
    'invoice_number', 'bill_patient_name', 'doctor_name', 'invoice_url', 'net_amount',
    'gross_total', 'total_gst_value', 'total_disc', 'rounding', 'raw_response',
    'created_at', 'created_by', 'updated_at', 'updated_by',
  ],

  pharmacy_bill_items: [
    'id', 'pharmacy_bill_id', 'product_name', 'batch_number', 'packing', 'sale_quantity',
    'mrp', 'gst_percent', 'gst_value', 'net_amount', 'created_at',
  ],

  pharmacy_api_sessions: ['scope', 'access_token', 'expires_at', 'updated_at'],

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
    // 20260805000003 — who handed the commission over (was missing from this dump)
    'referral_settlement_given_by',
  ],

  patient_billing_installments: [
    'id', 'patient_billing_id', 'installment_number', 'amount', 'payment_date', 'payment_method',
    'transaction_reference', 'remarks', 'created_at', 'created_by', 'updated_at', 'updated_by',
  ],

  patient_case_sheets: [
    'id', 'patient_id', 'patient_billing_id', 'discharge_date', 'discharge_notes', 'case_sheet_url',
    'case_sheet_filename', 'uploaded_at', 'created_at', 'created_by', 'updated_at', 'updated_by',
    // ward/bed genuinely still exist in the live database — this list is a dump of
    // what's really there, not of what the app currently writes. They stay listed
    // here even though 20260809000003 retired them from CASE_SHEET_WRITABLE, or
    // this file would wrongly report a real column as nonexistent.
    'admission_date', 'ward', 'bed', 'chief_complaints', 'history_present_illness', 'past_history',
    'diagnosis', 'investigations', 'clinical_summary', 'advice_notes', 'condition_on_discharge',
    'vitals_bp', 'vitals_pulse', 'vitals_temp', 'vitals_spo2', 'follow_up_date',
    'follow_up_instructions', 'summary_no', 'status', 'finalised_by', 'finalised_at',
    // 20260809000003 — what replaced them in the app, added alongside, not instead of.
    'discharge_time', 'discharge_received_by',
  ],

  patient_charges: [
    'id', 'patient_billing_id', 'patient_id', 'charge_type', 'description', 'amount', 'charge_date',
    'created_at', 'created_by', 'updated_at', 'updated_by', 'qty',
    // 20260808000002 — catalogue link, and the group a date range's rows share
    'charge_item_id', 'billing_mode', 'charge_group_id', 'source_sheet_id',
  ],

  patient_consultations: [
    'id', 'patient_id', 'doctor_id', 'consultation_date', 'visit_number', 'price_per_visit',
    'payment_status', 'notes', 'created_at', 'updated_at', 'created_by', 'updated_by', 'deleted_at',
    'billing_id',
    // 20260808000005 — what the visit was for. price_per_visit is vestigial again —
    // pricing moved to settle time (20260809000002) and the visit form no longer
    // collects it.
    'visit_purpose_id',
    // 20260809000002 — which settlement (if any) has billed this visit. Null means
    // "not yet billed". Set only by the sync endpoint, cleared only by deleting
    // that settlement.
    'settlement_id',
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

  // 20260808000004 — what kinds of doctor visit exist
  visit_purposes: [
    'id', 'code', 'name', 'default_fee', 'sort_order', 'is_active',
    'created_at', 'created_by', 'updated_at', 'updated_by',
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
