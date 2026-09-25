-- UNDO for 20260925000007_close_anon_access.sql — restores exactly what the
-- anon and authenticated roles had on 2026-09-25 (snapshot taken before the
-- change). Run it in the SQL editor if anything breaks after the revocation.
-- It reopens BUGS #68; it is an emergency switch, not a fix.

grant select, insert, update, delete on
  public.advances, public.case_sheet_attachments, public.case_sheet_counters, public.case_sheet_doctors, public.case_sheet_medications, public.charge_items, public.charge_sheet_counters, public.charge_sheet_items, public.charge_sheets, public.daily_ledger_closures, public.daily_ledger_day_closed_backup_20260807, public.daily_ledger_shift_settlements, public.daily_ledger_transactions, public.doctor_visit_settlements, public.doctors, public.employee_counters, public.employees, public.expenses, public.lab_interpretation_templates, public.lab_order_counters, public.lab_order_items, public.lab_orders, public.lab_result_values, public.lab_tests, public.ledger_close_batches, public.medicines, public.password_reset_tokens, public.patient_billing, public.patient_billing_installments, public.patient_case_sheets, public.patient_charges, public.patient_consultations, public.patient_counters, public.patient_test_results, public.patients, public.petty_cash_entries, public.petty_cash_entry_history, public.pharmacy_api_sessions, public.pharmacy_bill_items, public.pharmacy_bill_previews, public.pharmacy_bills, public.record_audit_log, public.referrals, public.salary_payments, public.test_parameter_ranges, public.test_parameters, public.test_result_values, public.users, public.visit_purposes
  to anon, authenticated;

grant select, usage on sequence public.advances_id_seq, public.expenses_id_seq, public.salary_payments_id_seq
  to anon, authenticated;

grant execute on function
  public.close_ledger_day(date, uuid, text), public.ledger_closure_continuity(date),
  public.ledger_open_days(integer, boolean), public.next_charge_sheet_no(),
  public.next_discharge_summary_no(), public.next_employee_code(), public.next_lab_order_no(),
  public.next_patient_id(), public.peek_next_employee_code(), public.peek_next_patient_id(),
  public.reopen_ledger_day(date, uuid, text), public.set_updated_at()
  to public, anon, authenticated;

alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges for role postgres in schema public grant select, usage on sequences to anon, authenticated;
alter default privileges for role postgres in schema public grant execute on functions to public;

-- Only needed if the old live-refresh code (before 521644e) is deployed again.
alter publication supabase_realtime add table
  public.advances, public.daily_ledger_closures, public.daily_ledger_shift_settlements, public.daily_ledger_transactions, public.doctor_visit_settlements, public.doctors, public.employees, public.expenses, public.lab_tests, public.patient_billing, public.patient_billing_installments, public.patient_case_sheets, public.patient_charges, public.patient_consultations, public.patient_test_results, public.patients, public.referrals, public.salary_payments, public.test_parameters, public.test_result_values, public.users;
