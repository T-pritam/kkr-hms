# KKR HMS — Product Requirements Document (Current State + Change Log)

| | |
|---|---|
| **Doc type** | Living PRD. Section 1–10 describe what the app does **today**. Section 11 is where new requirements go. |
| **Baseline** | Code on `main` @ `5f07acf` (2026-09-20) |
| **Method** | Written from the code (`middleware.ts`, `lib/*/authz.ts`, API routes, UI components, migrations) — not from older docs. Where an older doc disagreed with the code, the code won (see §12). |
| **Focus** | Roles **ADMIN** and **RECEPTIONIST** in full; DOCTOR / NURSE / LAB_TECHNICIAN summarised in §2.6. **Finance is §6** — the part that needs the most clarity. |

> **2026-09-21 — planning has moved to [`PRD-v2.md`](PRD-v2.md).** The client's requirements 1–11, the change-request tracker, the gap analysis, the target happy path and **all open questions** now live there. This file stays the **as-built baseline** (code @ `5f07acf`). §7, §10 and §11 below are kept for reference; each item is carried into PRD-v2 (§5.3 maps F-01…F-19, §9.11 maps the §10 questions). Corrections found while writing v2 are listed in PRD-v2 §5.5.

**Status tags used throughout**

| Tag | Meaning |
|---|---|
| ✅ | Works as described, verified in code |
| ⚠️ | Works, but inconsistent / surprising — needs a decision (listed in §7) |
| 🆕 | New requirement — not built yet (only appears in §11) |
| ❓ | Open question for the client |

**How to update this doc:** add new asks in **§11 (Change Requests)**, one row each, and answer the ❓ items in **§10**. When something ships, move its row into the module section and tick it in §13 (Change Log).

---

## Contents

1. [Product overview](#1-product-overview)
2. [Roles & access](#2-roles--access)
3. [App map — every screen](#3-app-map--every-screen)
4. [Core end-to-end flow (patient journey)](#4-core-end-to-end-flow-patient-journey)
5. [Module specs (non-finance)](#5-module-specs-non-finance)
6. [**FINANCE — the whole picture**](#6-finance--the-whole-picture)
7. [Finance clarity issues (decisions needed)](#7-finance-clarity-issues-decisions-needed)
8. [Cross-cutting rules](#8-cross-cutting-rules)
9. [Technical & security notes](#9-technical--security-notes)
10. [Open questions for the client](#10-open-questions-for-the-client)
11. [Change requests — ADD NEW REQUIREMENTS HERE](#11-change-requests--add-new-requirements-here)
12. [Corrections to older docs](#12-corrections-to-older-docs)
13. [Change log](#13-change-log)
- [Appendix A — Reference lists](#appendix-a--reference-lists)
- [Appendix B — Screen → API map](#appendix-b--screen--api-map)

---

## 1. Product overview

**What it is.** A web app for running a small hospital: register patients, record what was done to them (visits, charges, lab, pharmacy), take payments, pay doctors / referrers / staff, and reconcile the day's cash.

**Users.** Internal staff only. There is no patient portal and no self sign-up — an Admin creates every account.

**Stack.** Next.js (App Router) · TypeScript · Supabase Postgres · custom JWT auth (cookies) · Cloudflare R2 (file scans) · SmartPharma360 (external pharmacy billing, read-only fetch) · PDF via jsPDF.

**Modules**

```
 PEOPLE            CARE                   MONEY                     ADMIN
 ────────          ────────────           ─────────────────         ─────────────
 Patients          Doctor visits          Charge catalogue          User accounts
 Doctors           Case sheet /           Charge sheets (quotes)    (Admin Panel)
 Referrals         discharge summary      Patient charges
 Employees         Lab / pathology        Patient payments
                   Pharmacy bills*        Doctor fee settlements
                                          Referral commissions
                                          Salary + advances
                                          Expenses
                                          Daily ledger + day close
                                          Finances (reports)
  * pharmacy bills are fetched from SmartPharma360 and attached as a charge
```

**Design principles already in the code (keep these):**
1. Numbers are issued by the database with a row lock — two people never get the same patient ID / lab no. / discharge no. / charge sheet no. / employee code.
2. Names, prices, fees and reference ranges are **snapshotted** onto the record — later price-list changes never rewrite an issued bill.
3. Money that leaves the hospital is **admin-only**. Desk work (placing charges, taking payments) is open to reception.
4. Non-admins can only edit/delete rows **they created**.
5. A closed ledger day is **locked for everyone** until an admin reopens it with a reason.

---

## 2. Roles & access

### 2.1 Five roles

| Role | Job in the app | Created via Admin Panel? |
|---|---|---|
| **ADMIN** | Owner/manager. The only role that prices, settles money out, closes the day, manages users. | No — can't be created in the panel |
| **RECEPTIONIST** | Front desk: register patients, place charges, take payments, raise quotes, register lab orders, log cash. | Yes |
| DOCTOR | Clinical work + (currently) payroll and finance *reads* | Yes |
| NURSE | Patients, clinical records, charges, lab results | Yes |
| LAB_TECHNICIAN | Lab only | ⚠️ Not offered in the dropdown (DB insert only) |

Sessions: access token 10 min (auto-refreshed from a 7-day refresh token). Inactive accounts can't log in. Admin "reset password" sets a default and forces change on next login. Everyone lands on `/dashboard` after login.

### 2.2 Menu — what each of the two focus roles sees

| Menu item | ADMIN | RECEPTIONIST |
|---|:-:|:-:|
| Dashboard *(placeholder page, all zeros)* | ✅ | — hidden ¹ |
| Patients | ✅ | ✅ |
| Doctors | ✅ | ✅ |
| Charges → Charge Sheets | ✅ | ✅ |
| Charges → Charge Catalogue | ✅ | ✅ |
| Lab/Pathology → Lab Orders | ✅ | ✅ |
| Lab/Pathology → Test Catalogue | ✅ | ✅ (read-only) |
| Employees → Employee Details | ✅ | ❌ |
| Employees → Employee Salary | ✅ | ❌ |
| Employees → Advance Log | ✅ | ❌ |
| Finances | ✅ | ❌ |
| Daily Ledger → Daily Summary | ✅ | ✅ (own entries only) |
| Daily Ledger → Employee Shift Schedule | ✅ | ❌ |
| Admin Panel | ✅ | ❌ |

¹ Reception is still *sent* to `/dashboard` after login (the menu just doesn't list it).
Pages blocked by `middleware.ts` for non-admins (redirect to dashboard): `/employees/*` (except salary + advances, which admit DOCTOR too), `/finances`, `/admin`, `/ledger/employee-shift`, `/daily-ledger/employee-ledger`.

### 2.3 ADMIN — full capability list

| Area | Admin can |
|---|---|
| **Patients** | Everything reception can + **hard-delete** a patient (cascades to billing, charges, visits, lab orders, case sheets, with no warning ⚠️) |
| **Doctors** | Add / edit / deactivate / **hard-delete** (refused if referenced) · set **fee schedule** (₹ button) |
| **Charge catalogue** | Add / edit / deactivate |
| **Charge sheets** | Raise / edit / delete any · **Forward** to patient bill |
| **Patient billing** | **Set Charges** (base charge, referral, package flags) · **Sync Visits** · price / settle / unsettle / merge / delete / manual doctor settlements · settle referral commission (patient tab) |
| **Payments** | Add · edit/delete **any** payment (until verified / day closed) |
| **Lab** | Everything: orders, results, catalogue, authorise reports |
| **Case sheet** | Create / edit / finalise / reopen / **delete** |
| **Employees** | Register, edit, deactivate, import CSV, salary grid, settle salary (one/all), pay advances, payslip, advance log |
| **Daily ledger** | See whole day · add entries · edit/delete any entry · **verify** entries · **close day** · **reopen day** (reason ≥ 10 chars) · shift settlement (mark cashier's shift handed over, delete it) |
| **Finances** | Overview · settle doctor fees → ledger · settle referral commissions → ledger · add/edit/delete **general expenses** · transactions tab · day-close worklist |
| **Admin Panel** | List/search users · create (non-admin) · edit · activate/deactivate · delete · reset password. Can't touch ADMIN rows; can't delete self. |
| **Visit purposes** | Managed by API only (`/api/visit-purposes`) — no screen found ⚠️ |

### 2.4 RECEPTIONIST — full capability list (the "desk")

| Area | Reception CAN | Reception CANNOT |
|---|---|---|
| **Patients** | View list, search, filter · register · edit · change status (Active / Discharged / Cancelled) | Delete a patient |
| **Doctors** | View · add · edit · deactivate (feeds referring-doctor / consulting-doctor pickers) | Hard-delete · fee schedule (₹) |
| **Referrals** | Create a referrer (from the patient form / billing) ⚠️ *(API has no login check at all — anyone can)* | — |
| **Patient → Doctor Visits** | Record a visit · edit/delete **own** visits (blocked once that visit's fee is settled) | Sync visits · price/settle doctor fees |
| **Patient → Charges** | Add a charge (catalogue pick, one-time / per-day / per-hour) · edit & delete **own** charges · attach a pharmacy bill (SmartPharma360) · fix the bill's date · download charges PDF | Edit/delete someone else's charge |
| **Patient → Payments** | Record a payment · edit/delete **own** payment **until** its ledger entry is verified or its day is closed | Edit others' payments |
| **Patient → Lab** | View lab history & report PDF | — |
| **Patient → Case Sheet** | View · print · download PDF (with lab reports + scans) | Create / edit / finalise / attach scans / delete |
| **Patient → Billing & Settlement** | View totals, download billing PDF | **Set Charges**, **Sync Visits**, any settlement action. ⚠️ The "Settle Referral Commission" button is *visible* but the API returns 403 |
| **Charge catalogue** | View · **add / edit** prices (same desk that places charges) | — |
| **Charge sheets** | Raise (registered patient **or** walk-in) · edit/delete **own** · print / PDF | **Forward** to bill |
| **Lab** | View catalogue & orders · **register** an order (patient or walk-in) · collect sample · receive in lab · print report | Enter results · write interpretation · edit catalogue · authorise |
| **Daily Ledger** | See **own** entries only · add **OPD** entry (walk-in cash) · add **expense** · add **patient installment** · edit/delete **own** entries while day open | See colleagues' entries · verify · close / reopen · shift settlement |
| **Employees / Salary / Advances** | ❌ nothing at all | Whole section |
| **Finances / Admin Panel** | ❌ nothing | Whole section |

### 2.5 Same table, decision view — "who does what with money"

| Money action | Admin | Reception |
|---|:-:|:-:|
| Put a charge on a patient's bill | ✅ | ✅ |
| Change base charge / package / referral commission amount | ✅ | ❌ |
| Take a payment from a patient | ✅ | ✅ |
| Edit / delete a payment | any | own |
| Log an OPD (walk-in) cash receipt | ✅ | ✅ |
| Log a cash expense in the ledger | ✅ | ✅ |
| Verify a ledger entry | ✅ | ❌ |
| Pay a doctor fee | ✅ | ❌ |
| Pay a referral commission | ✅ | ❌ |
| Add a general expense (Finances) | ✅ | ❌ |
| Pay a salary advance / settle salary | ✅ | ❌ |
| Mark a cashier's shift handed over | ✅ | ❌ |
| Close / reopen a day | ✅ | ❌ |
| Change the price list | ✅ | ✅ |
| Forward a quote into real charges | ✅ | ❌ |

### 2.6 Other roles — one-line summary

| Role | Summary |
|---|---|
| **DOCTOR** | Same as reception on patients/charges/payments, **plus** clinical (case sheet write + finalise, interpretation, **authorise** lab reports), **plus** payroll (employee register API, salary list, settle salary, advances) and finance/ledger **reads** (whole-day ledger, verify entries, open-days banner). Menu shows *Finances* and *Admin Panel* but middleware redirects them ⚠️. |
| **NURSE** | Like reception on registry/charges/payments; also case sheet write/finalise, lab order + result entry, interpretation. Own ledger entries only. |
| **LAB_TECHNICIAN** | Lab screens (orders, results, catalogue edit, interpretation). Reads patients/doctors/case sheets. Own ledger entries only. ⚠️ Can still hit the payment and visit APIs (no role check). |

---

## 3. App map — every screen

```
/login ─ /reset-password ─ /change-password        (public)
/            → redirects to /dashboard

/dashboard                     placeholder (4 tiles, all 0)                   ADMIN, DOCTOR menu
/patients                      registry list                                  all clinical roles
/patients/[id]                 patient record — 7 tabs:
     ├ Patient Info
     ├ Doctor Visits
     ├ Charges
     ├ Payments
     ├ Lab
     ├ Case Sheet & Discharge
     └ Billing & Settlement
/doctors                       doctor registry (+ ₹ fee schedule for Admin)
/charges/catalogue             price list
/charges/sheets                quotes / estimates (walk-in or patient)
/lab/orders                    lab worklist
/lab/tests                     test catalogue + parameters + reference ranges
/employees/details             staff register            ADMIN only
/employees/salary              monthly salary            ADMIN, DOCTOR
/employees/advances            advance log               ADMIN, DOCTOR
/ledger/summary                Daily Ledger              all roles (scope differs)
/ledger/employee-shift         shift settlement          ADMIN only
/finances                      5 tabs (Overview · Settlements · Transactions · Expenses · Day Close)   ADMIN only
/admin                         user management          ADMIN only

Dead / unused stubs: /daily-ledger/summary, /daily-ledger/employee-ledger
```

---

## 4. Core end-to-end flow (patient journey)

This is the whole app in one picture. Finance touchpoints are marked **[₹]**.

```
 REGISTER                 CARE / RECORD                         MONEY IN                    MONEY OUT                     CLOSE
 ─────────                ─────────────                         ────────                    ─────────                     ─────
 Reception registers      Doctor visits recorded                [₹] Payments recorded       [₹] Doctor fee settled        [₹] Cashier shift
 patient  (ID 12/26)      (doctor + purpose)                        on Payments tab             (Finances or patient tab)      settled by Admin
      │                        │                                    │                           │                              │
      ▼                        ▼                                    ▼ (optional ledger credit)  ▼ (ledger debit — Finances    ▼
 Optional: referred_by    Charges placed [₹]                    Daily ledger CREDIT            only — see §7 F-01)        Admin verifies entries
 (referral person)        (room, oxygen, procedures,               source = patient            [₹] Referral commission        │
      │                    pharmacy bill from SmartPharma360)                                     paid to referrer              ▼
      │                        │                                 Walk-in OPD cash [₹]           (same two paths)          [₹] Admin CLOSES the day
      ▼                        ▼                                 → ledger credit source=opd     [₹] Expenses / salary /       (locks it; reopen needs reason)
 Admin sets package /     Lab orders (price recorded,                                             advances (NOT in ledger
 referral commission      but NOT billed — see F-07)                                              — see F-03)
 [₹] (Set Charges)             │
      │                        ▼
      ▼                   Case sheet → Finalise
 Admin clicks             = patient marked DISCHARGED
 "Sync Visits" [₹]        (no final bill is raised — F-11)
 → doctor fee rows
```

**Rules of thumb that explain most confusion**
- **The patient's bill is separate from the ledger.** The bill (`patient_billing`) says what the patient *owes*. The ledger (`daily_ledger_transactions`) says what cash/UPI/etc. *moved*. A payment normally creates one row in each, but they are two records (§6.4).
- **Only some money-out goes through the ledger.** Doctor fees and referral commissions (via Finances) do. Salary, advances and general expenses do **not** (§6.2).
- **"Settled"** means three different things in the app: a doctor fee is paid; a salary is paid; a ledger entry is *verified*. See glossary §6.1.

---

## 5. Module specs (non-finance)

### 5.1 Authentication & sessions ✅
- Login with email + password (bcrypt). No sign-up.
- Forgot password → email link (Brevo via Supabase edge function) → reset page.
- `needs_password_change` forces `/change-password` on next login.
- Public paths: `/login`, `/reset-password`, `/change-password`. Everything else redirects to login.

### 5.2 Patients ✅
- **Register**: required = name, patient ID, gender, phone. Optional = date of joining, referred-by, age/DOB, blood group, alt phone, email, address, emergency contact, ID proof, medical history, allergies, medications.
- **Patient ID** `<serial>/<YY>` (e.g. `5/26`), restarts each January, editable, UNIQUE.
- **Age** stored as stated (`~45`) or DOB — never back-computed.
- **Status**: Active · Discharged · Cancelled. *Discharged* is set automatically when a discharge summary is finalised.
- **List**: search (name / ID / phone), filter (status, join-date range), sort, paginate.
- Billing record: registering a patient **auto-creates** one `patient_billing` row (all zeros, `billing_status='pending'`); it is re-created on demand if that insert failed, or when a quote is forwarded. A patient **can end up with more than one** ⚠️ (F-17).

### 5.3 Doctors & referrals ✅
- Doctor: name, qualification, registration no., department (fixed list), specialist (free text), contact, active flag. **Deactivate** removes from pickers but keeps history.
- **Fee schedule** (Admin, ₹ button): one rate per (doctor × visit purpose).
- **Referral person**: name + phone; attached to a patient (`referred_by`). Referral commission amount lives on the patient's billing record.

### 5.4 Doctor visits (patient tab) ✅
- Record: date (IST), doctor, **purpose** (Consultation, Operation, Ward Round, …), notes.
- **No fee is captured at visit time** — pricing happens at settle time (⚠️ F-09).
- Edit/delete: creator or Admin; blocked once that visit's settlement is *settled*.

### 5.5 Charges (patient tab) ✅
- Pick from the **Charge Catalogue**; rate prefills and stays editable. Form depends on billing mode:

| Mode | Input | Rows created |
|---|---|---|
| `one_time` | date, qty, rate | 1 row |
| `per_day` | from–to dates, rate/day | 1 row **per day**, shared group id |
| `per_hour` | date range, hours per day, hourly rate | 1 row per day, `qty` = hours |

- Max 180 days per entry, max 24 h per day. Grouped view collapses a block to one line with a subtotal.
- Categories: Room & Bed · Medical & Nursing · Diagnostics · Procedures · Registration & Admin · Pharmacy · Other.
- Edit/delete: creator or Admin (both edit **and** delete are own-row for non-admins).
- **Pharmacy bill**: type the SmartPharma360 bill ID → *Fetch* (preview token valid for 60 min) → confirm → saved as one charge (net amount) + bill header + medicine lines. Same bill can't be attached twice. Only the bill's date is correctable.

### 5.6 Charge catalogue ✅
Name, code, category, billing mode, default price, active. **Admin and Reception edit**; everyone reads. Price changes never touch issued charges (snapshot).

### 5.7 Charge sheets (quotes) ✅
```
 Reception raises a sheet ──► prints / PDF ──► (nothing else happens — no dues, no ledger)
   subject = registered patient  OR  walk-in (name, phone, age, gender typed)
                    │
                    ▼   Admin only, patient sheets only
              FORWARD ──► lines copied into patient_charges (one group), bill recalculated,
                          sheet stamped "forwarded" (a second forward is refused)
```
Statuses: draft → forwarded / cancelled. Numbered `CS-000001` (continuous, not per-year). Non-admin can edit/delete own sheets only; a forwarded sheet can no longer be edited.

### 5.8 Lab / pathology ✅
```
 Register order → Collect sample → Receive in lab → Enter results → Interpretation → Report (→ Authorise, optional)
```
- Order = one visit, many tests, one accession `LAB/<yyyy>/<5 digits>`. Patient or walk-in.
- Test price + per-test override + discount recorded on the order — **not** connected to any bill or ledger (⚠️ F-07).
- Result types: numeric / qualitative / calculated (formulas). Reference ranges by age/sex; H/L flags computed server-side; critical values print red.
- Editing results after authorisation drops the authorisation.
- Reception: register, collect, receive, print. Admin/Lab tech/Nurse: results. Admin/Doctor: authorise.

### 5.9 Case sheet & discharge summary ✅
- One per admission, `DS/<yyyy>/<5 digits>`; Draft (watermark) → Final.
- Required to finalise: discharge date, ≥1 consulting doctor, diagnosis, summary.
- **Finalise sets patient = Discharged.** No bill is raised and no payment check is made (⚠️ F-11).
- Download merges the summary + selected lab reports + scanned pages into one PDF.
- Every create/edit/finalise/reopen/delete is written to an append-only audit log.
- Write: Admin, Doctor, Nurse. Reception: read/print only.

### 5.10 Employees, salary & advances ✅ *(Admin, Doctor — not Reception)*
- **Employee**: code `EMP/<YY>/<serial>`, name, designation, base salary, joining date + optional personal/bank fields. Soft-deactivate; CSV import.
- **Monthly salary grid** (per employee, per month):
```
 daily_rate      = base_salary / 30
 regular_salary  = base_salary − (27 − days_present) × daily_rate     (days_present 0–27)
 ot_salary       = daily_rate × ot_days                               (only if days_present = 27; ot_days 0–3)
 calculated      = regular + ot
 final_salary    = calculated − total_advances_that_month
```
- **Advance**: amount, date, month, remarks, **given by** (free text), **recorded by** (session user). Cap: cannot exceed base salary (no salary record yet) or calculated salary − advances so far (record exists); none after the month is settled. ⚠️ Two advance endpoints, one with no cap (BUGS #55).
- **Settle** salary (single or "settle all"): flips `pending → settled`, stamps date + who. **Writes nothing to the ledger** (⚠️ F-03). Settled months can't be re-generated or receive advances.
- Outputs: payslip PDF, advance-log PDF/CSV.

### 5.11 Admin panel ✅
User list (search, paginate) · create (Receptionist / Nurse / Doctor) · edit · activate/deactivate · delete · reset password to default. ADMIN accounts are protected.

### 5.12 Dashboard ⚠️
Placeholder. Four tiles (Total Patients, Active Doctors, Today's Appointments, Revenue Today) are hard-coded to 0.

---

## 6. FINANCE — the whole picture

> This is the section to read before writing any finance requirement. §6.1 defines the words, §6.2 lists every rupee event, §6.3–6.10 show each flow, §6.11 explains every number on the Finances page, §6.12 lists every lock.

### 6.1 Glossary — what each money word means *in this app today*

| Term | Meaning | Stored in |
|---|---|---|
| **Base charge** | Agreed all-in *package* price for an admission. Optional. | `patient_billing.base_charge` |
| **Package** | Exists only when `base_charge > 0`. With no base charge, the two "included" flags are ignored. | derived |
| **Patient charge** | One itemised line (room-day, oxygen-hour, procedure, pharmacy bill). Amount × qty. | `patient_charges` |
| **Doctor fee** | What the hospital pays a doctor for visits. Grouped per (doctor × purpose). Priced **at settle time**. | `doctor_visit_settlements` |
| **Referral commission** | What the hospital pays the person who referred the patient. Fixed amount typed by Admin per patient billing. | `patient_billing.referral_commission_amount` |
| **Total charges** (patient owes) | See formula §6.3 | `patient_billing.total_charges` |
| **Paid** | Sum of the patient's payments (installments) | `patient_billing.patient_paid_amount` |
| **Balance** | Total charges − Paid (computed in the UI; can go negative) | not stored |
| **Payment / installment** | One payment from the patient. Numbered #1, #2… per billing | `patient_billing_installments` |
| **Ledger entry / transaction** | One cash-book line: date, credit/debit, source, amount, mode, who | `daily_ledger_transactions` |
| **Verified** | Admin/Doctor ticked a ledger entry as checked. *Also what staff call "settled" for payments.* | ledger `status` = pending / verified |
| **Settled** (doctor fee) | Fee has been paid out | `doctor_visit_settlements.settled` |
| **Settled** (salary) | Salary marked paid for the month | `salary_payments.status` |
| **Settled** (referral) | Commission marked paid | `patient_billing.referral_settled` |
| **Shift settlement** | Admin marks "this cashier handed over their day's cash" | `daily_ledger_shift_settlements` |
| **Day close** | Admin locks a whole date after reconciling it | `daily_ledger_closures` |
| **General expense** | Hospital running cost typed by Admin in Finances (electric, oxygen supply…) | `expenses` |
| **Ledger expense** | A debit logged in the Daily Ledger with source = expense | ledger, `source='expense'` |
| **OPD entry** | Walk-in cash receipt with no patient record ("OPD <name>") | ledger, `source='opd'` |

### 6.2 Money-event register — every place money is recorded

**Legend:** *Ledger?* = does a row appear in the Daily Ledger (and therefore in day-close totals & cashier shift totals)? *In Finances?* = does it feed the Finances Overview numbers?

#### Money IN

| # | Event | Screen | Who | Written to | Ledger? | In Finances overview? |
|---|---|---|---|---|:-:|:-:|
| I-1 | Patient pays (installment) from the **patient's Payments tab** | Patient → Payments | Admin, Reception (+ any signed-in role ⚠️) | `patient_billing_installments`; **+** ledger credit `source=patient` if "create ledger entry" ticked (default ticked) | ✅ if ticked | ✅ as *Total Paid* (by payment date) |
| I-2 | Patient pays from the **Daily Ledger → Add Patient Installment** | Ledger | all roles | same as I-1 (calls the same installments API with ledger entry on) | ✅ | ✅ |
| I-3 | Walk-in **OPD** cash | Ledger → OPD entry | all roles | ledger credit `source=opd`, description `OPD <name>` | ✅ | ❌ **not in income** ⚠️ F-04 |
| I-4 | Lab order price | Lab orders | — | order total only | ❌ | ❌ ⚠️ F-07 |
| I-5 | Pharmacy bill | Patient → Charges | Admin, Reception… | becomes a patient charge (adds to bill) | ❌ (until patient pays) | via patient bill only |

#### Money OUT

| # | Event | Screen | Who | Written to | Ledger? | In Finances overview? |
|---|---|---|---|---|:-:|:-:|
| O-1 | **Doctor fee paid** via **Finances → Settlements** | Finances | Admin | fee row `settled=true` **+** ledger debit `source=doctor_settlement`, status *verified*, dated **today** | ✅ | as accrual (see §6.11) |
| O-2 | **Doctor fee paid** via **patient → Billing & Settlement** | Patient tab | Admin | fee row `settled=true` only | ❌ ⚠️ F-01 | as accrual |
| O-3 | **Referral commission paid** via Finances | Finances | Admin | billing `referral_settled=true` **+** ledger debit `source=referral_commission` (verified) | ✅ | accrual |
| O-4 | **Referral commission paid** via patient tab | Patient tab | Admin | billing `referral_settled=true` + payment method/ref/given-by fields | ❌ ⚠️ F-02 | accrual |
| O-5 | **Salary advance** | Employees → Advances | Admin, Doctor | `advances` row | ❌ ⚠️ F-03 | counted inside *Salary* |
| O-6 | **Salary settled** | Employees → Salary | Admin, Doctor | `salary_payments.status=settled` | ❌ ⚠️ F-03 | ✅ as *Salary* |
| O-7 | **General expense** | Finances → Expenses | Admin | `expenses` | ❌ ⚠️ F-03 | ✅ |
| O-8 | **Ledger expense** (petty cash etc.) | Ledger → Add Expense | all roles | ledger debit `source=expense` + category | ✅ | ✅ as *Ledger expenses* |

### 6.3 The patient bill — formula

```
total_charges =  base_charge
              +  Σ (patient_charge.amount × qty)                    ← all charge lines (incl. pharmacy bills)
              +  doctor_fees_on_bill
              +  commission_on_bill

package = base_charge > 0

doctor_fees_on_bill = 0                          if package AND doctor_fees_included_in_package
                    = Σ doctor settlement totals  otherwise

commission_on_bill  = referral_commission         if package AND NOT commission_included_in_package
                    = 0                           otherwise          (no package ⇒ commission is a payout only, never billed)

balance = total_charges − patient_paid_amount
```

**Worked examples**

| Case | Base | Charges | Doctor fees | Commission | Package flags | **Total** |
|---|--:|--:|--:|--:|---|--:|
| A. Itemised only | 0 | 12,000 | 3,000 | 1,000 | ignored | **15,000** (commission not billed) |
| B. Package, fees + commission inside | 20,000 | 2,000 | 3,000 | 1,000 | both included | **22,000** |
| C. Package, commission billed on top | 20,000 | 2,000 | 3,000 | 1,000 | doctor incl., commission NOT incl. | **23,000** |
| D. Package, nothing included | 20,000 | 2,000 | 3,000 | 1,000 | neither | **26,000** |

**When does it recalculate?** After any charge add/edit/delete, pharmacy attach, doctor-settlement create/price/settle/merge/delete, *Sync Visits*, and *Set Charges*. It does **not** recalculate on a payment (payments only update *Paid*).
⚠️ Doctor fees reach the bill only after **Sync Visits** (Admin, manual) and pricing — new visits don't move the total by themselves.

### 6.4 Flow — a patient payment

```
 Reception/Admin: Patient → Payments → "Add payment"
        │   fields: amount, date (default today), mode (cash/upi/card/bank_transfer/cheque),
        │           reference (UPI needs it), remarks, [✓] create ledger entry (default ON)
        ▼
 1. Is the ledger date closed?  ── yes ──► 409 "day closed — admin must reopen"  (nothing saved)
        │ no
        ▼
 2. INSERT installment  (#n = next number for this billing)
        ▼
 3. patient_paid_amount = Σ all installments               (billing "Paid" updates)
        ▼
 4. if ledger box ticked → validate + INSERT ledger CREDIT
        │       source=patient, description "<patientId> <name>", same amount/mode/ref
        │       └─ link back: installment.ledger_transaction_id
        ▼
     DONE.   Later:
        • Edit/Delete allowed only if: (own row or Admin)  AND  day not closed  AND  ledger entry not verified
        • Edit/Delete change the installment and "Paid" — they do NOT change or delete the ledger entry  ⚠️ F-06
```
⚠️ Order matters: step 2 happens **before** step 4's validation. A UPI payment without a reference passes step 2, fails step 4 → the API returns an error **but the payment is already saved** (and counted in Paid) with no ledger entry.

### 6.5 Flow — doctor fee, start to finish

```
 Visit recorded (doctor + purpose)         no fee captured
        │
        ▼
 Admin: Patient → Billing & Settlement → [Sync Visits]
        │   groups un-billed visits by (doctor, purpose) into ONE unsettled row per pair;
        │   visit_count = linked visits; amount_per_visit = 0 unless a legacy fee exists
        ▼
 Admin prices the row  (rate/visit, or total ÷ visits;  doctor's fee schedule is consulted as a hint)
        │   total_amount = floor(rate × visit_count)
        │   → bill recalculated  (doctor fees now inside total_charges, unless package includes them)
        ▼
 ┌─────────────── PAY ───────────────┐
 │ Path 1: Finances → Settlements    │   Path 2: Patient → Billing & Settlement → Settle
 │  select rows, pick mode/ref/notes │    enter settlement amount, mode, ref, notes
 │  ▸ row → settled                  │    ▸ row → settled
 │  ▸ ledger DEBIT (today, verified) │    ▸ NO ledger entry          ⚠️ F-01
 │  ▸ one amount only if 1 row       │
 └───────────────────────────────────┘
        ▼
 Later new visits, same doctor+purpose → a NEW unsettled row (settled rows are history)
 Unsettle / re-price a settled row → row flips back to unsettled (409 if a newer unsettled row exists)
 Merge (≥2 rows, same patient) → one row, old rows soft-deleted.   Manual settlement → typed count × rate, no purpose.
```
**Rules:** Admin only for every step. Settled rows are re-priced only by unsettling first. A visit whose fee is settled can't be edited/deleted.

### 6.6 Flow — referral commission

```
 Patient has referred_by (a referral person)         Admin sets commission amount in "Set Charges"
        │                                              (+ "included in package" flag if package)
        ▼
 Listed in Finances → Settlements (any billing with commission > 0 and not settled)
        ▼
 PAY:  Path 1 Finances → select billings, one payment mode → ledger DEBIT per billing (today, verified)
       Path 2 Patient → Billing & Settlement → "Settle Referral Commission" (mode, ref, given-by, notes) — NO ledger entry ⚠️ F-02
```
Not billed to the patient unless there's a package and the commission is *not* included in it (§6.3).

### 6.7 Flow — salary & advances

```
 Employee register (base salary)
        ▼
 Advance given (any day of month) ──► advances row (given_by = who handed cash, recorded_by = session user)
        │   cap: ≤ base (no record) / ≤ calculated − advances (record exists) / none after settled
        ▼
 Month end: Salary grid → enter days_present (0–27) + OT → "Create/Update monthly salary"
        │   final = calculated − advances ;  status = pending   (settled rows are skipped)
        ▼
 Settle (one, or "settle all" — requires every active employee to have a record)
        ▼   status = settled, settled_on, settled_by        ── no payment mode, no ledger entry ⚠️ F-03
```

### 6.8 Flow — expenses (two separate systems ⚠️ F-03)

| | **Ledger expense** | **General expense** |
|---|---|---|
| Where | Daily Ledger → Add Expense | Finances → Expenses tab |
| Who | All roles (own entries) | Admin only |
| Table | `daily_ledger_transactions` (debit, `source=expense`) | `expenses` |
| Categories | Medical Supplies · Utilities & Rent · Maintenance · Staff Bonus · Other *(Other needs detail)* | Electric Bill · Oxygen Supply · Lift Maintenance · Water & Sanitation · Cleaning Supplies · Medical Equipment Maintenance · Internet/Telecom · Miscellaneous *(needs detail)* |
| Payment mode | cash/upi/card/bank/cheque | not recorded |
| Affects day close & cashier cash | ✅ | ❌ |
| Locked by day close | ✅ | ❌ (edit/delete any time) |
| Month key | transaction date | expense date |

### 6.9 Daily ledger — the cash book

**One row =** date · credit/debit · **source** · amount · payment mode · reference · patient (optional) · description · notes · status (pending/verified) · created-by.

| Source | Created by | Users can pick it? |
|---|---|:-:|
| `patient` | Payments (installment) or ledger "Add installment" | ✅ |
| `opd` | Ledger → OPD entry | ✅ |
| `expense` | Ledger → Add Expense | ✅ |
| `doctor_settlement` | Finances → doctor fee settle | ❌ system only |
| `referral_commission` | Finances → commission settle | ❌ system only |
| `salary` | *(reserved — nothing writes it today)* | ❌ |

**Rules:** amount > 0 · UPI needs a reference · one write path (`lib/ledger/transactions.ts`) validates and checks the closed-day lock · a batch is all-or-nothing on the lock.

**Who sees what:** Admin & Doctor → the whole day (filter by user). Everyone else → **only their own rows**, enforced on the server.

**Verify:** Admin/Doctor tick an entry *verified* (+ who/when). Blocked on a closed day. A person *can* verify their own entry (BUGS #33). System settlement debits are born *verified*.

**Edit / delete:** Admin any, others own — **blocked on a closed day**. Editable fields: amount, mode, reference, description, notes, expense category. ⚠️ Admin can delete system-created rows (doctor/referral debits) and nothing warns that a fee still shows "settled".

### 6.10 Shift settlement & day close

```
 DURING THE DAY   each person adds entries (they see only their own)
        │
 END OF SHIFT     Admin → Ledger → Employee Shift Schedule
        │            per employee, for a date:
        │              cash_expected = cash credits − cash debits   (UPI/card never touch the drawer)
        │              admin types cash_handed_over (optional) + notes
        │            [Mark settled]  → shift record created (one active per employee+date)
        │                            → that employee's own PENDING entries for the date become VERIFIED
        │                              (skipped silently if the day is already closed)
        │            Allowed even after the day is closed.  Admin can delete a shift settlement.
        ▼
 END OF DAY       Admin → Daily Summary → [Close day]   (or Finances → Day Close worklist)
        │            • not in the future; date must have transactions (or be a re-close)
        │            • unverified entries do NOT block — count is stored and warned
        │            • server computes everything (browser can't supply opening balance):
        │                 opening   = previous active closure's closing balance
        │                 credits / debits / net, credits by mode, cash debits, counts, unverified count
        │                 closing_balance      = opening + credits − debits
        │                 closing_cash_balance = opening_cash + cash credits − cash debits
        │            • date becomes LOCKED for everyone: no add / edit / delete / verify
        │            • audit log entry
        ▼
 REOPEN           Admin only, reason ≥ 10 chars. Old closure kept as "superseded" (with who/why).
                  Later days' balances are NOT recalculated — the response says how many later
                  closures are now out of sync and leaves it to the admin.
 BACKLOG          "Open days" banner (Admin/Doctor): dates with activity and no closure, oldest first (today excluded).
```
⚠️ Day close and cashier totals only see **ledger** rows, so salary, advances and general expenses paid in cash are not in the cash count (F-03).

### 6.11 Finances page (Admin) — what every number means

Month picker drives Overview / Expenses. Tabs: **Overview · Settlements · Transactions · Expenses · Day Close**.

**Overview cards** (source: `GET /api/finances/summary?month_year=YYYY-MM`)

| Card | Formula | Basis |
|---|---|---|
| **Total Revenue / Net income** | Σ patient payments (installments) with `payment_date` in the month | cash |
| *Charges incurred (info)* | Σ patient-charge lines with `charge_date` in the month (**excludes** base charge & doctor fees) | accrual |
| **Pending receivables** | Σ (`total_charges` − `paid`) over billings whose **month = patient's join month** | mixed |
| **Expenses: General** | Σ `expenses` in month | cash-ish |
| **Expenses: Salary** | per employee-month: `calculated_salary` if settled, else the advances so far | mixed |
| **Expenses: Ledger** | Σ ledger debits with `source=expense` in the month | cash |
| **Expenses: Referral commissions** | Σ commission on billings of that join-month **unless "included in package"** | accrual, settled or not |
| **Expenses: Doctor fees** | Σ `total_doctor_fees` on billings of that join-month **unless "included in package"** | accrual, settled or not |
| **Total expenses** | sum of the five above | |
| **Net profit** | Net income − Total expenses | ⚠️ mixes cash and accrual (F-04) |
| **Pending settlements** *(all time, not month)* | Σ unsettled doctor-fee totals · Σ unsettled commissions | |
| **Payment-mode breakdown** | ledger credits/debits per mode for the month | cash |

**Transactions tab:** the full ledger for the month with filters (type, source, mode, status), lock icon on closed days.
**Settlements tab:** two cards → "View & Settle Doctor Fees" / "View & Settle Commissions" (paths O-1 / O-3).
**Expenses tab:** general expenses list + add/edit/delete; salary and ledger expense splits.
**Day Close tab:** worklist of open days with Close buttons.
**Exports:** finance PDF.

### 6.12 Lock & edit-rule matrix (who can change a money record, and when)

| Record | Create | Edit | Delete | Locked when |
|---|---|---|---|---|
| Patient charge | Admin, Reception, Doctor, Nurse | own / Admin | own / Admin | — (no lock at all) |
| Pharmacy bill | same | date fix only | (delete = delete its charge) | — |
| Base charge / package / commission amount | Admin | Admin | — | — |
| Doctor settlement row | Admin (sync/manual) | Admin (rate); count is derived | Admin (soft) | Pricing locked once *settled* (must unsettle) |
| Doctor visit | any | own / Admin | own / Admin | its settlement is settled |
| **Payment** | any signed-in role ⚠️ | own / Admin | own / Admin | **ledger entry verified** OR **its date closed** |
| **Ledger entry** | all roles (3 sources) | own / Admin | own / Admin | **date closed** |
| Ledger verify | — | Admin, Doctor | (unverify) Admin, Doctor | date closed |
| Shift settlement | Admin | — | Admin | *(not blocked by close)* |
| Day closure | Admin | — | Reopen: Admin + reason | — |
| Salary record | Admin, Doctor | until settled | — | settled |
| Advance | Admin, Doctor | ❌ no edit | ❌ no delete | month settled (no new ones) |
| General expense | Admin | Admin | Admin | never locked |
| Charge sheet | Admin, Reception, Doctor, Nurse | own / Admin (not once forwarded) | own / Admin | edit locked after forward |

---

## 7. Finance clarity issues (decisions needed)

These are the reasons finance "isn't clear". Each is a fact from the code; the **Decision** column is what a new requirement should settle. Severity: 🔴 money can disagree · 🟠 confusing / incomplete · 🟡 polish.

| ID | Sev | What happens today | Decision needed |
|---|:-:|---|---|
| **F-01** | 🔴 | A doctor fee can be marked paid in **two places**. Finances path writes a ledger debit; the patient-tab path doesn't. The same payout can be missing from the cash book. | One place to pay, always with a ledger debit? Or is the patient tab read-only for settlement? |
| **F-02** | 🔴 | Same split for **referral commission**: Finances → ledger debit, no payment details saved on the billing; patient tab → payment details saved, no ledger. | Same as F-01. Where do mode / ref / given-by live? |
| **F-03** | 🔴 | **Salary, advances and general expenses never reach the ledger.** Day close & cashier cash counts ignore them. There are two unrelated expense systems with different category lists, and general expenses are never locked. | Should all money-out go through the ledger (with a source per type)? One expense category list? Should general expenses lock on close? |
| **F-04** | 🔴 | **Net profit** = cash income − (cash + accrual expenses). Income counts only patient payments — **OPD cash is excluded**. Commission/doctor fees are expensed by the patient's *join month*, settled or not. | Cash basis or accrual? Define "revenue", "expense", "profit" once. Should OPD count as revenue? |
| **F-05** | 🟠 | If a package "includes" doctor fees or commission, Finances **drops them from expenses** — but the hospital still pays them. | Should "included in package" affect the *patient's bill* only, never the hospital's expenses? (recommended) |
| **F-06** | 🔴 | A payment and its ledger credit are **two records, softly linked**. Editing/deleting one doesn't change the other; the ledger credit is optional (a checkbox); a saved payment can survive a rejected ledger write (UPI without reference). | Is a payment *always* a ledger credit (one action, one transaction)? What happens to the other record on edit/delete/refund? |
| **F-07** | 🟠 | **Lab orders carry a price + discount that reach no bill and no ledger.** | Are lab tests billed on the patient bill? Walk-in lab cash → OPD entry? |
| **F-08** | 🟠 | **Walk-in money is three disconnected things**: OPD ledger entry (name typed into description), charge-sheet quote (walk-in), lab order (walk-in). | One walk-in "visit/bill" that ties them together? |
| **F-09** | 🟠 | Doctor fees: not captured at visit; priced later by Admin after a manual **Sync**; fee schedule is only a hint; **no screen to manage visit purposes**; merged/manual rows have no purpose. Bill total lags behind reality until Sync. | Capture the agreed fee at visit time (from schedule)? Automatic sync? Who manages purposes? |
| **F-10** | 🟠 | **No refunds, discounts, concessions, write-offs, receipts or invoice numbers.** Overpayment just shows a negative balance. `billing_status` is set to "pending" and never updated. | Which of these are required? Payment receipt / final invoice numbering? |
| **F-11** | 🟠 | **Discharge does not raise a final bill or check the balance.** | Block/warn on discharge with outstanding balance? Generate final invoice at discharge? |
| **F-12** | 🟡 | Server defaults for "today" use the **UTC date**, so a 2 AM IST entry lands on yesterday (payments, doctor/referral settles). | Standardise on IST dates (the visit code already does). |
| **F-13** | 🟡 | Admin can **delete a system-created ledger row** (doctor/referral debit) leaving the fee "settled" with no cash entry. | Make system rows undeletable / reversible only via unsettle? |
| **F-14** | 🟡 | "Verified" doubles as "settled" for payments; a user can verify their own entry; a shift settlement silently verifies that person's entries. | Separate "reconciled" from "locked"? Segregation of duties? |
| **F-15** | 🟡 | Money is **displayed truncated** (`parseInt`) in the billing summary and doctor totals use `floor` — paise vanish. | Whole rupees only, or two decimals everywhere? |
| **F-16** | 🟡 | Any signed-in role (even Lab Tech) can call the payment and visit APIs; referral API needs no login at all. | Lock down to billing roles. |
| **F-17** | 🟡 | A patient can hold **more than one billing record**; nothing says which is "the" bill after readmission. No Admission entity. | Billing cycle = admission? |
| **F-18** | 🟡 | Closing a day with unverified entries is allowed (decided); reopening doesn't recompute later days (decided). | Confirm both still wanted. |
| **F-19** | 🟡 | Finances shows *Pending receivables* only for billings whose join month = selected month — old dues vanish from newer months. | Receivables as a running total across all months? |

---

## 8. Cross-cutting rules

- **Own-row rule** — non-admins edit/delete only what they created (charges, payments, visits, ledger entries, quotes).
- **Attribution** — "last updated by / at" stamps on patients, charges, payments, billing, visits, lab orders, case sheets, settlements (`settled_by`).
- **Snapshots** — catalogue names/prices, reference ranges and agreed fees are frozen onto records; a reprint reproduces the original.
- **Numbering** (all concurrency-safe): patient `12/26` · lab `LAB/2026/00184` · discharge `DS/2026/00012` · charge sheet `CS-000001` · employee `EMP/26/007`.
- **Audit log** — append-only, for case sheets, day close/reopen, shift settlement. (Patient/doctor/finance edits are *not* audited field-by-field.)
- **Soft delete** — doctor settlements, employees (Inactive), doctors (Inactive). Patients, charges, payments, ledger entries, general expenses, advances-none are hard-deleted (advances can't be deleted at all).
- **Dates** — visits use IST; several server defaults use the UTC date (F-12).
- **Currency** — ₹, en-IN grouping; PDFs print `Rs.` (font has no ₹).
- **Realtime** — a hook refetches lists when data changes.
- **Documents (PDF)** — patient billing, patient charges, charge sheet, pharmacy bill, lab report, discharge summary, payslip, advance log, finance report. Letterhead branding is placeholder text ⚠️.

---

## 9. Technical & security notes

- **RLS is disabled on all tables** and the anon key is public → anyone with it can bypass every role rule above. Largest open risk.
- Role checks live in two layers: page-level in `middleware.ts`; API-level in `lib/*/authz.ts` (billing, patients, doctors, employees, lab, case-sheet) **and** inline checks in the finance/ledger/settlement routes. Ledger and finance routes still hand-roll the token-refresh + role check (`payload.role !== 'ADMIN'`), which is why rules are hard to see in one place.
- Money writes are **multi-step without transactions** (PostgREST): installment → paid total → ledger; forward sheet → stamp; doctor settle → ledger. A failure between steps leaves partial state (F-06).
- Day close/reopen and numbering are real DB functions (transactional, advisory-locked).
- Migrations: `supabase/migrations/*` (Aug–Sep 2026). Tests: Vitest with an in-memory fake Supabase; `BUGS.md` tracks known defects as `it.fails` tests (some entries are stale).
- Backup edge function `backup-database`; reset-email edge function `send-reset-email`.

---

## 10. Open questions for the client

> Superseded 2026-09-21 — answer these in [`PRD-v2.md` §9](PRD-v2.md#9-open-questions) instead (mapping in §9.11 there). Kept for reference.

Answering these turns §7 into buildable requirements.

1. ❓ **One payout path?** Doctor fees & referral commissions: pay only from Finances (with ledger), or also from the patient tab?
2. ❓ **Is every rupee that leaves the hospital a ledger debit?** (salary, advances, general expenses, doctor, referral, petty cash)
3. ❓ **Cash vs accrual** for the profit number — and what counts as *revenue* (patient payments? OPD? lab?)
4. ❓ **Package semantics** — does "included in package" change only what the patient is billed, or also what the hospital books as cost?
5. ❓ **Payment = ledger credit, always?** If yes, the checkbox goes away; what happens on edit/delete/refund?
6. ❓ **Lab & pharmacy money** — billed on the patient bill? Collected at the lab counter? Walk-in?
7. ❓ **Doctor fee timing** — captured at visit (from rate card) or agreed at settlement?
8. ❓ **Discharge & final bill** — is a final invoice needed? Should discharge check the balance?
9. ❓ **Refunds / discounts / concessions / write-offs / receipts** — which are needed?
10. ❓ **Who can verify** and can a person verify their own entry?
11. ❓ **Lab as a separate app?** (client undecided — see project notes)
12. ❓ **Should Reception see anything from Finances** (e.g. today's collection total, pending dues)?

---

## 11. Change requests — ADD NEW REQUIREMENTS HERE

> 2026-09-21 — the first batch (client requirements 1–11 → CR-01…CR-14) is tracked in [`PRD-v2.md` §2](PRD-v2.md#2-tracker). Add future change sets there too.

**How to write one:** *As a `<role>` I need `<what>` so that `<why>`.* Then fill the row. Link the F-/Q- id it resolves if any.

| ID | Module | Requirement | Role(s) | Resolves | Priority (P0–P3) | Status | Notes / acceptance criteria |
|---|---|---|---|---|:-:|:-:|---|
| CR-001 | | | | | | 🆕 | |
| CR-002 | | | | | | 🆕 | |
| CR-003 | | | | | | 🆕 | |

**Per-requirement template (copy for bigger ones)**

```
### CR-00X — <title>
- Problem / why:
- Roles affected:
- Screens affected:
- New / changed rules (be exact with numbers):
- Flow (draw it):
- Money impact (ledger? finances? day close? lock rules?):
- Out of scope:
- Acceptance criteria (Given / When / Then):
```

---

## 12. Corrections to older docs

Where this PRD differs from — or re-confirms — `docs/ROLES_AND_FEATURES.md`, the module docs and `README.md` (the code is the source):

| Older doc says | Code says |
|---|---|
| Charges: "add/edit any, delete own only" | Both **edit and delete** are own-row for non-admins |
| Doctor fee "snapshotted onto the visit at record time" (BILLING doc) | No fee captured at visit; priced at settle time (consultations route comment) |
| Daily ledger menu shows one entry for all roles | Admin/Doctor get a submenu (Summary + Shift Schedule for Admin); Nurse/Reception get a single "Daily Ledger" link |
| Salary settle writes no ledger entry (gap) | Still true — kept as F-03 |
| Lab technician can't be created from the panel | Still true |
| `BUGS.md` #49 referral has no auth | Still true in code |
| `README.md` says RLS is enabled | RLS is **off** on all tables |
| Memory note says docs are "README + 7 numbered docs" | This tree has 6 module docs + this PRD |

---

## 13. Change log

| Date | Change | By |
|---|---|---|
| 2026-09-20 | Initial PRD written from code at `5f07acf` | Claude |
| 2026-09-21 | Planning moved to `PRD-v2.md` (client requirements 1–11); pointer notes added to the header, §10 and §11 — no baseline facts changed | Claude |

---

## Appendix A — Reference lists

| List | Values |
|---|---|
| Payment modes | cash · upi · card · bank_transfer · cheque |
| Ledger source | patient · opd · expense · doctor_settlement · referral_commission · salary(reserved) |
| Ledger status | pending · verified |
| Ledger expense categories | supplies · utilities · maintenance · staff · other |
| General expense types | Electric Bill · Oxygen Supply · Lift Maintenance · Water & Sanitation · Cleaning Supplies · Medical Equipment Maintenance · Internet/Telecom · Miscellaneous |
| Charge categories | room · medical · diagnostic · procedure · registration · pharmacy · other |
| Billing modes | one_time · per_day · per_hour |
| Charge sheet status | draft · forwarded · cancelled |
| Patient status | Active · Discharged · Cancelled |
| Salary status | pending · settled |
| Doctor settlement type | regular (+ others typed on manual/merge) |
| Case sheet status | draft · final |
| Lab order stages | registered · collected · received · in_progress · reported |
| Key tables | users, patients, referrals, doctors, doctor_fee_schedule, visit_purposes, patient_consultations, patient_billing, patient_billing_installments, patient_charges, charge_items, charge_sheets(+items), pharmacy_bills(+items), doctor_visit_settlements, daily_ledger_transactions, daily_ledger_closures, daily_ledger_shift_settlements, expenses, employees, salary_payments, advances, lab_*, patient_case_sheets(+doctors, medications, attachments), medicines, record_audit_log |

## Appendix B — Screen → API map

| Screen | Main APIs |
|---|---|
| Patients list / form | `/api/patients`, `/api/patients/[id]`, `/api/patients/next-id`, `/api/referrals` |
| Patient → Visits | `/api/patients/[id]/consultations`, `/api/visit-purposes`, `/api/doctors/all` |
| Patient → Charges | `/api/patients/[id]/charges`, `/api/charge-items`, `/api/pharmacy-bills/preview`, `/api/patients/[id]/pharmacy-bills` |
| Patient → Payments | `/api/patients/[id]/installments` (+ `/[installmentId]`) |
| Patient → Billing & Settlement | `/api/patients/[id]/billing`, `/api/patients/[id]/settlements` (+ `/sync`), `/api/doctor-settlements/*`, `/api/doctors/[id]/fee-schedule` |
| Charge sheets | `/api/charge-sheets` (+ `/[id]`, `/[id]/forward`) |
| Lab | `/api/lab/orders`, `/api/lab/order-items/[id]/*`, `/api/lab-tests`, `/api/lab/parameters/*` |
| Case sheet | `/api/patients/[id]/case-sheets/*` |
| Employees | `/api/employees`, `/api/employees/salary/*`, `/api/employees/[id]/salary/advances`, `/api/employees/advances` |
| Daily ledger | `/api/ledger/daily-summary/[date]`, `/api/ledger/transactions` (+ `/[id]`, `/[id]/status`), `/api/ledger/close-day`, `/reopen-day`, `/open-days` |
| Shift schedule | `/api/ledger/employee-shift-summary`, `/api/ledger/shift-settlements` |
| Finances | `/api/finances/summary`, `/api/finances/expenses`, `/api/finances/doctor-settlements`, `/api/finances/referral-commissions` |
| Admin panel | `/api/admin/users` (+ `/[id]`, `/[id]/reset-password`) |
| Auth | `/api/auth/login`, `/logout`, `/me`, `/change-password`, `/reset-password` |
