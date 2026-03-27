# KKR HMS — App Functionality Documentation

> Covers all non-patient modules: Auth · Dashboard · Doctors · Employees · Lab · Finances · Ledger · Admin · Referrals

---

## 1. Authentication & Access Control

**Routes:** `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`  
**Pages:** `/login`, `/change-password`, `/reset-password`

- Users log in with email + password (bcrypt-hashed). JWT stored in HTTP-only cookie.
- On first login (or admin-reset), `needs_password_change = true` → forced redirect to `/change-password`.
- Password reset flow: admin generates a reset token → user visits `/reset-password?token=…` to set new password.
- `middleware.ts` protects all routes; unauthenticated requests redirect to `/login`.
- Roles: **ADMIN**, **DOCTOR**, **NURSE**, **RECEPTIONIST** — enforced per API route.

---

## 2. Dashboard

**Page:** `/dashboard`

- Landing page after login.
- Provides navigation to all modules via the sidebar.
- Role-based menu visibility (e.g., Admin-only sections hidden from other roles).

---

## 3. Doctor Management

**Routes:** `GET/POST /api/doctors`, `GET/PUT/DELETE /api/doctors/[id]`  
**Page:** `/doctors`

- **List:** Paginated, searchable by name, specialist, email, or mobile.
- **Create:** Name (required), mobile, email, designation, specialist.
- **Edit:** Update any field.
- **Delete:** Hard-delete (removes record permanently).
- Doctors are linked to patient consultations and doctor visit settlements.

---

## 4. Employee Management

**Routes:** `/api/employees`, `/api/employees/[id]`, `/api/employees/import`, `/api/employees/advances`, `/api/employees/salary`  
**Pages:** `/employees`, `/employees/details/[id]`, `/employees/salary`

### 4.1 Employee CRUD
- **Create** (Admin): name, designation, base_salary, join_date, status (`Active`/`Inactive`).
- **List** (Admin/Doctor): all employees, optionally enriched with salary data for a given `month_year`.
- **Edit** (Admin): partial update of any field.
- **Deactivate** (Admin): soft-delete sets `status = Inactive` (record preserved).

### 4.2 Bulk Import
- Upload CSV with columns: `Name`, `Salary`, `Role`.
- Server validates and bulk-inserts; returns success count and any row-level errors.
- Template: `employee_import_template.csv` in project root.

### 4.3 Salary Management
**Route:** `GET /api/employees/salary`
- Fetches all active employees + their `salary_payments` record for the given `month_year`.
- Salary record fields: `base_salary`, `total_working_days` (default 27), `days_present`, `ot_days`, `total_advance`, `calculated_salary`, `final_salary`, `status` (pending/settled), `settled_on`.
- Aggregate summary returned: total advances paid/pending/settled, grand total payroll.

### 4.4 Advances
**Route:** `GET/POST /api/employees/advances`
- Record cash advances to employees: `employee_id`, `amount`, `date_given`, `month_year`, `remarks`.
- On every advance POST, the salary record's `total_advance` and `final_salary` are recalculated automatically.
- GET returns all advances for a month with aggregate totals.

---

## 5. Lab Module

**Routes:** `/api/lab-tests`, `/api/lab-tests/[id]`, `/api/test-parameters/[id]`, `/api/test-results`  
**Pages:** `/lab/tests`, `/lab/results`

### 5.1 Lab Tests (Master Catalogue)
- **Create:** Test name, unique code, category, description, sample type, price, active status.
- **List:** Paginated, filterable by category, active status, or name.
- **Edit:** Any field; code uniqueness re-validated.
- **Delete:** Hard-delete.

### 5.2 Test Parameters
- Each lab test can have multiple parameters (e.g., Haemoglobin, WBC count).
- **Edit Parameter:** name, unit, reference range (male/female/general), display order, active status.
- **Delete Parameter:** Hard-delete.
- Parameter management is accessible from the lab test detail via the Manage Parameters modal.

### 5.3 Test Orders & Results
- **Order a test:** `POST /api/test-results` — link to a patient (or anonymous), specify test, price, patient name. Creates a `patient_test_results` record with `status = pending`.
- **List results:** Paginated, filterable by status, test_id, patient_id, date range.
- **Result Entry:** Staff enters values per parameter; each value stored in `test_result_values`.
- **Verification:** Verified by a senior user; `verified_at` + `verified_by` recorded.
- **View Result:** Full result with reference ranges shown in the view modal.

---

## 6. Finances Module

**Routes:** `/api/finances/expenses`, `/api/finances/doctor-settlements`, `/api/finances/referral-commissions`, `/api/finances/summary`  
**Page:** `/finances`

### 6.1 General Expenses
- Record operational expenses: `expense_type`, `amount`, `expense_date`, `month_year`, `remarks`.
- CRUD: Create, Update, Delete — Admin only.
- GET returns all expenses for the selected month.

### 6.2 Doctor Settlements (Finance View)
- View all `doctor_visit_settlements` with doctor + patient details.
- Filterable by settled status, doctor, or patient.
- Admin can mark settlement(s) as paid → also creates a **debit ledger entry** automatically.

### 6.3 Referral Commissions
- View billing records that have referral commissions due.
- Filterable by settled status or referral agent.
- Admin marks commissions as settled → creates a **debit ledger entry** automatically.

### 6.4 Monthly Financial Summary
**Route:** `GET /api/finances/summary?month_year=MM-YYYY`
- **Revenue:** Total charges billed, total paid, pending receivables.
- **Referral:** Total commissions due, total settled.
- **Expenses:** Total general expenses for the month.
- **Payroll:** Total salary cost (from salary_payments).
- **Ledger:** Credit/debit totals from daily ledger transactions.

---

## 7. Ledger Module

**Routes:** `/api/ledger/transactions`, `/api/ledger/close-day`, `/api/ledger/close-employee-day`, `/api/ledger/daily-summary/[date]`, `/api/ledger/employee-shift-summary`  
**Pages:** `/daily-ledger/summary`, `/ledger/summary`, `/ledger/employee-shift`

### 7.1 Transactions
- Record individual cash movements: `transaction_type` (credit/debit), `source` (OPD/IPD/Lab/Expense/etc.), `amount`, `payment_mode` (Cash/Card/UPI/etc.), `reference_number`, optional `patient_id`, `description`, `notes`.
- Non-admin users see only their own transactions; Admin/Doctor see all.
- Blocked if the day is already closed (`status = day_closed`).

### 7.2 Day Close (Global)
**Route:** `POST /api/ledger/close-day`
- Admin/Doctor closes the entire ledger for a date.
- Aggregates all credit/debit transactions by payment mode.
- Creates a `daily_ledger_closures` record with totals.
- Idempotent — safe to call if already closed.

### 7.3 Employee Shift Close
**Route:** `POST /api/ledger/close-employee-day`
- Close all of one employee's transactions for a shift date.
- Returns: credit totals, debit totals — useful for end-of-shift cash handover.
- **Page:** `/ledger/employee-shift`

### 7.4 Daily Summary
**Route:** `GET /api/ledger/daily-summary/[date]`
- Current user's transactions for the date.
- Aggregates: total credits, total debits, net balance.
- Payment mode breakdown (Cash / Card / UPI).
- Closure status flag.

### 7.5 Employee Shift Summary
**Route:** `GET /api/ledger/employee-shift-summary?date=`
- Admin/Doctor view: all employees' transactions grouped by employee.
- Per-employee: credit total, debit total, transaction count, closure status.

---

## 8. Admin — User Management

**Routes:** `GET/POST /api/admin/users`, `PUT/PATCH/DELETE /api/admin/users/[id]`  
**Page:** `/admin`

- **Create User:** username, email, password (hashed), role (DOCTOR / NURSE / RECEPTIONIST — ADMIN role cannot be assigned via UI), status. New users get `needs_password_change = true`.
- **List Users:** Paginated, searchable. All roles visible.
- **Edit User:** Full (`PUT`) or partial (`PATCH`) update — username, email, role, status. Cannot promote to ADMIN. Cannot self-delete.
- **Delete User:** Hard-delete; admin cannot delete their own account.

---

## 9. Referral Management

**Routes:** `GET /api/referrals`, `POST /api/referrals`  
**Page:** Referral selection is embedded in billing modals; managed globally.

- **Create:** Referral agent name (required), phone (optional). Status defaults to `active`.
- **List:** All referrals ordered by name (id, name, phone, status).
- Referrals are linked to patient billing records at billing creation.
- Commission tracking and settlement handled via the Finances module.

---

## Role Permissions Summary

| Module / Action | ADMIN | DOCTOR | NURSE | RECEPTIONIST |
|---|---|---|---|---|
| Login / Change password | ✅ | ✅ | ✅ | ✅ |
| View dashboard | ✅ | ✅ | ✅ | ✅ |
| Doctor CRUD | ✅ | ✅ | ✅ | ✅ |
| Employee CRUD | ✅ | — | — | — |
| Employee list/view | ✅ | ✅ | — | — |
| Salary management | ✅ | ✅ | — | — |
| Record advance | ✅ | — | — | — |
| Bulk import employees | ✅ | — | — | — |
| Lab test catalogue CRUD | ✅ | ✅ | ✅ | ✅ |
| Order lab test | ✅ | ✅ | ✅ | ✅ |
| Enter/verify results | ✅ | ✅ | ✅ | ✅ |
| Finances view | ✅ | ✅ | — | — |
| Settle doctor/referral payments | ✅ | — | — | — |
| General expense CRUD | ✅ | — | — | — |
| Ledger transactions (own) | ✅ | ✅ | ✅ | ✅ |
| Ledger transactions (all) | ✅ | ✅ | — | — |
| Close day (global) | ✅ | ✅ | — | — |
| Close employee shift | ✅ | ✅ | — | — |
| User management | ✅ | — | — | — |
| Referral management | ✅ | ✅ | ✅ | ✅ |
