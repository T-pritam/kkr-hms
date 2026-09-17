# Roles & Features — KKR HMS

Release reference. What each role can see and do, as the code actually enforces it
today. Source of truth: `middleware.ts` (pages), `lib/*/authz.ts` + inline guards
(APIs), `components/layout/sidebar.tsx` (menu).

---

## The five roles

| Role | Who they are | The job the app gives them |
|---|---|---|
| **ADMIN** | Owner / manager | Everything. The only role that prices, settles, closes the day and manages users |
| **DOCTOR** | Consultant | Clinical work + payroll & finance *reads* (see the gap on §Release notes) |
| **NURSE** | Ward staff | Patients, clinical records, charges, lab results, own ledger entries |
| **RECEPTIONIST** | Front desk | Registration, charges, quotes, lab orders, cash entries |
| **LAB_TECHNICIAN** | Lab | Lab only — catalogue, orders, results. Reads patients via lab screens |

Sessions: JWT cookies, access token 10 min (auto-refreshed), refresh token 7 days.
Inactive accounts cannot log in. A password reset forces a change on next login.

---

## Menu visible per role

| Menu | ADMIN | DOCTOR | NURSE | RECEPTION | LAB TECH |
|---|:-:|:-:|:-:|:-:|:-:|
| Dashboard | ✅ | ✅ | — | — | — |
| Patients | ✅ | ✅ | ✅ | ✅ | — |
| Doctors | ✅ | ✅ | ✅ | ✅ | — |
| Charges → Sheets / Catalogue | ✅ | ✅ | ✅ | ✅ | — |
| Lab → Orders / Test Catalogue | ✅ | ✅ | ✅ | ✅ | ✅ |
| Employees → Details | ✅ | — | — | — | — |
| Employees → Salary / Advance Log | ✅ | ✅ | — | — | — |
| Finances | ✅ | ⚠️ shown, blocked | — | — | — |
| Daily Ledger → Summary | ✅ | ✅ | ✅ | ✅ | — |
| Daily Ledger → Employee Shift | ✅ | — | — | — | — |
| Admin Panel | ✅ | ⚠️ shown, blocked | — | — | — |

---

## Feature matrix

Legend: ✅ full · 👁 read only · ➖ none

### Patients & Doctors
| Action | ADMIN | DOCTOR | NURSE | RECEPTION | LAB TECH |
|---|:-:|:-:|:-:|:-:|:-:|
| View patient / doctor registry | ✅ | ✅ | ✅ | ✅ | 👁 (API) |
| Register / edit patient, change status | ✅ | ✅ | ✅ | ✅ | ➖ |
| Add / edit / **deactivate** a doctor | ✅ | ✅ | ✅ | ✅ | ➖ |
| Hard-delete patient / doctor | ✅ | ➖ | ➖ | ➖ | ➖ |
| Doctor fee schedule (₹ button) | ✅ | ➖ | ➖ | ➖ | ➖ |

Patient IDs auto-issue as `<serial>/<YY>`, restart each January, UNIQUE-enforced.
Age is stored as stated (`~45`) or as DOB — never back-computed. Status is
Active / Discharged / Cancelled; *only* finalising a discharge summary sets
Discharged.

### Charges, Billing & Pharmacy
| Action | ADMIN | DOCTOR | NURSE | RECEPTION | LAB TECH |
|---|:-:|:-:|:-:|:-:|:-:|
| Read any bill / charge | ✅ | ✅ | ✅ | ✅ | 👁 |
| Add / edit a patient charge | ✅ | ✅ | ✅ | ✅ | ➖ |
| Delete a charge | ✅ | own only | own only | own only | ➖ |
| Charge catalogue (price list) — edit | ✅ | ➖ | ➖ | ✅ | ➖ |
| Raise a charge sheet (estimate, incl. walk-in) | ✅ | ✅ | ✅ | ✅ | ➖ |
| **Forward** a charge sheet into real charges | ✅ | ➖ | ➖ | ➖ | ➖ |
| Attach a SmartPharma360 pharmacy bill | ✅ | ✅ | ✅ | ✅ | ➖ |
| Record a patient payment / installment | ✅ | ✅ | ✅ | ✅ | ⚠️ ✅ |
| Edit / delete an installment | ✅ | own only | own only | own only | own only |
| Package base charge, referral commission, settled flags | ✅ | ➖ | ➖ | ➖ | ➖ |
| Settle patient billing | ✅ | ➖ | ➖ | ➖ | ➖ |
| Record a doctor visit | ✅ | ✅ | ✅ | ✅ | ⚠️ ✅ |
| Edit / delete a doctor visit | ✅ | own only | own only | own only | own only |
| Visit purposes (config) | ✅ | ➖ | ➖ | ➖ | ➖ |
| Sync / settle / merge doctor settlements | ✅ | ➖ | ➖ | ➖ | ➖ |

Per-day charges (room rent, oxygen) create **one row per day** under a shared
group, collapsible in the Grouped view. Catalogue names and agreed doctor fees
are snapshotted — a later price change never rewrites an issued bill.

### Case Sheet / Discharge Summary
| Action | ADMIN | DOCTOR | NURSE | RECEPTION | LAB TECH |
|---|:-:|:-:|:-:|:-:|:-:|
| View, print, download (with lab reports + scans merged) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create / edit · attach scans | ✅ | ✅ | ✅ | ➖ | ➖ |
| Finalise (discharges the patient) / reopen | ✅ | ✅ | ✅ | ➖ | ➖ |
| Add to the medicine master | ✅ | ✅ | ✅ | ➖ | ➖ |
| Delete a case sheet | ✅ | ➖ | ➖ | ➖ | ➖ |
| View change history (who changed what) | ✅ | ✅ | ✅ | ✅ | ✅ |

Numbered `DS/<year>/<5 digits>`. Drafts print a DRAFT watermark. Required before
finalising: discharge date, consulting doctors, diagnosis, summary. Every
create / edit / finalise / reopen / delete is written to an append-only audit log.

### Lab / Pathology
| Action | ADMIN | DOCTOR | NURSE | RECEPTION | LAB TECH |
|---|:-:|:-:|:-:|:-:|:-:|
| View test catalogue & orders | ✅ | ✅ | ✅ | ✅ | ✅ |
| Register an order (patient or walk-in) | ✅ | ➖ | ✅ | ✅ | ✅ |
| Collect sample / receive in lab | ✅ | ➖ | ✅ | ✅ | ✅ |
| Enter / correct results | ✅ | ➖ | ✅ | ➖ | ✅ |
| Write the interpretation (+ templates) | ✅ | ✅ | ✅ | ➖ | ✅ |
| Edit catalogue, parameters, reference intervals | ✅ | ➖ | ➖ | ➖ | ✅ |
| **Authorise** a report | ✅ | ✅ | ➖ | ➖ | ➖ |
| Print / download report PDF | ✅ | ✅ | ✅ | ✅ | ✅ |

Flow: registered → collected → received → in progress → reported, each stage
timestamped on the report. Accession `LAB/<year>/<5 digits>`. Out-of-range values
flag H/L server-side; critical values print red. Authorisation is optional, and
editing results afterwards drops it. This table is deliberately permissive while
the lab is run by whoever is on shift — narrowing it is one edit to
`lib/lab/authz.ts`.

### Employees, Salary & Advances
| Action | ADMIN | DOCTOR | NURSE | RECEPTION | LAB TECH |
|---|:-:|:-:|:-:|:-:|:-:|
| Employee register, add/edit/deactivate, CSV import | ✅ | API only¹ | ➖ | ➖ | ➖ |
| Salary records, monthly credit grid, payslip PDF | ✅ | ✅ | ➖ | ➖ | ➖ |
| Settle salary (single / all) | ✅ | ✅ | ➖ | ➖ | ➖ |
| Employee Salary **list** | ✅ | ✅ | ➖ | ➖ | ➖ |
| Advance Log (month view, CSV + PDF export) | ✅ | ✅ | ➖ | ➖ | ➖ |
| Pay an advance | ✅ | ✅ | ➖ | ➖ | ➖ |

¹ The `/employees/details` **page** is ADMIN-only in middleware; the API admits
DOCTOR.

RECEPTION has no access to any part of the Employees section — not the
register, the salary list, or the advance log. Each advance records
**given by** (free text — whoever handed the cash over) and **recorded by**
(the session user). Advance codes: `EMP/<YY>/<serial>`.

### Daily Ledger
| Action | ADMIN | DOCTOR | NURSE | RECEPTION | LAB TECH |
|---|:-:|:-:|:-:|:-:|:-:|
| See the day's transactions | whole day | whole day | own only | own only | own only |
| Add expense / OPD entry / patient installment | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit / delete a transaction | any | own only | own only | own only | own only |
| Mark an entry **verified** | ✅ | ✅ | ➖ | ➖ | ➖ |
| Open-days backlog banner | ✅ | ✅ | ➖ | ➖ | ➖ |
| **Close day** / **Reopen day** (reason mandatory) | ✅ | ➖ | ➖ | ➖ | ➖ |
| Employee Shift Schedule + mark a shift settled | ✅ | ➖ | ➖ | ➖ | ➖ |
| Delete a shift settlement | ✅ | ➖ | ➖ | ➖ | ➖ |

A closed date is locked for **everyone**: no add, edit, delete or verify until an
admin reopens it. Reopening supersedes the old closure rather than deleting it,
and reports how many later closures are affected instead of silently
recalculating them. Users may only pick sources *patient / opd / expense*;
settlement and salary entries are written by the system.

### Finances (ADMIN)
Tabs: **Overview** (income, expenses, dues, net), **Settlements** (doctor payouts,
referral commissions), **Transactions** (full ledger with filters), **Expenses**
(salary / general / ledger split, 8 expense types), **Day Close** worklist.
Writes — general expenses, referral commission payout, doctor fee settlement —
are ADMIN only. The read APIs admit DOCTOR, but the page does not (see below).

### Admin Panel (ADMIN)
User list with search + paging; create, edit, activate/deactivate, delete, and
reset a password to the default (forces a change at next login). An ADMIN row
cannot be edited, deleted, or created through this panel, and nobody can delete
their own account.

---

## Cross-cutting rules

- **Own-row rule.** Non-admins may edit or delete only what they created —
  charges, installments, doctor visits, ledger entries.
- **Attribution.** "Last updated by" shows across patients, charges, payments,
  billing, doctor visits, lab orders and case sheets.
- **Snapshots.** Catalogue names, prices, reference intervals and agreed fees are
  frozen onto the record, so reprinting an old document reproduces it exactly.
- **Concurrency-safe numbering** for patient ID, employee code, lab accession,
  discharge summary and charge sheet — two people never get the same number.

---

## Release notes — known gaps to brief users on

1. **DOCTOR sees "Finances" and "Admin Panel" in the menu but is redirected to
   the dashboard on click.** Sidebar says ADMIN+DOCTOR; middleware says ADMIN.
   Either remove the two entries from the DOCTOR list in
   `components/layout/sidebar.tsx` or add DOCTOR to the finances carve-out —
   a one-line change, worth doing before release.
2. **LAB_TECHNICIAN cannot be created from the Admin Panel** — the role dropdown
   offers only Receptionist, Nurse, Doctor. Lab logins must be inserted directly
   in the database for now.
3. **The Dashboard is a placeholder** — all four tiles read 0 and both panels are
   empty. It is also where every role lands after login.
4. **Three routes have no role check** (any signed-in user, lab technician
   included): record a patient payment (`installments`), record a doctor visit
   (`consultations`), and create a referral (`referrals`). Marked ⚠️ above.
5. **Lab catalogue edit buttons are visible to roles that cannot use them** —
   the API returns 403 for non ADMIN/LAB_TECHNICIAN, but the page shows the
   controls. Cosmetic, but it looks like a failure to the user.
6. **Lab billing is not wired to invoices or the ledger** — orders carry a price
   that reaches no bill. Likewise, finalising a discharge summary raises no
   final bill, and settling a salary writes no ledger entry.
7. **PDF branding is placeholder text** in `lib/pdf/branding.ts` — address,
   phone, email and logo must be set before any document goes to a patient.
8. **RLS is disabled on every table.** Anyone holding the Supabase anon key can
   read or write rows directly, bypassing every table above. The largest
   security hole in the system; it deserves its own task.
9. `/daily-ledger/summary` and `/daily-ledger/employee-ledger` are unused stub
   pages — the live screens are under `/ledger/`.

Deeper per-module detail: `docs/PATIENT_DOCTOR_MODULE.md`,
`docs/BILLING_CHARGES_MODULE.md`, `docs/CASE_SHEET_MODULE.md`,
`docs/LAB_MODULE.md`, `docs/EMPLOYEE_MODULE.md`.
