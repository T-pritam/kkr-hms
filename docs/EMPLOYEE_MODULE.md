# Employees, Salary & Advances

Rebuilt Aug 2026. The brief was explicit: **do not change existing
functionality.** So the salary formula, the advance caps, the settle flow, the
monthly credit grid and the CSV importer all behave exactly as they did. What
changed is presentation, attribution, and one security hole that was agreed to.

---

## What was missing

- **No employee details view at all.** Nothing in the app rendered a single
  employee. The one per-employee drill-down — the salary details modal — showed
  neither designation, nor joining date, nor whether they still work here.
- **No advance log.** `GET /api/employees/advances` existed and returned almost
  exactly the right data, and **nothing ever called it**. The only way to see an
  advance was one employee, one month, behind a row click on payroll.
- **No attribution anywhere.** `employees`, `advances` and `salary_payments` had
  no `created_by`, no `updated_by`, no `settled_by`. Money left the drawer and
  payroll was signed off with nothing recording who did either.
- **`app/employees/page.tsx` was dead and broken** — 350 lines, linked from
  nowhere, reading `data.employees` / `data.total` / `data.totalPages`, keys the
  API has never returned. Deleted.

---

## The advance log

`/employees/advances` — a month across all staff, and **the one employee screen
reception can open**.

```
Month  ▾   Employee ▾   Designation ▾   Search        [ Excel ] [ PDF ]
From — To

┌ Total advanced ┬ Advances ┬ Employees ┬ Largest single ┐
│  ₹47,000.00    │    9     │     4     │   ₹15,000.00   │
│ +18% vs July   │          │           │                │
└────────────────┴──────────┴───────────┴────────────────┘

By employee                          share of salary already drawn
  Ramesh Kumar  EMP/26/001   3 advances   [72% of salary]  ₹19,500.00
  Jane Smith    EMP/26/003   2 advances   [ 8% of salary]  ₹ 2,400.00

Every advance
  Date · Employee · Given by / Recorded by · Remarks · Amount
```

Each row carries **who handed over the cash** and **who recorded it** — two
different people more often than not, which is why they are two columns. The
per-employee block shows the share of that month's salary already drawn, with a
warning chip past 75%.

**Export** is CSV and PDF. CSV rather than `.xlsx`: it opens in Excel, Sheets
and LibreOffice with no new dependency. The quoting is proper RFC 4180, so a
remark containing a comma cannot shift a column — which is exactly the defect
the CSV *importer* still has.

---

## Given by vs recorded by

| | |
|---|---|
| `given_by` | Free text. Who physically handed over the cash — often a cashier or ward sister with no login. Deliberately not a foreign key: a name that cannot be recorded ends up in the remarks box, where nothing can query it. |
| `created_by` | Taken from the session. Never typed. |

Both appear on the log, in the salary details modal, on the payslip and in the
CSV. `settled_by` does the same job for payroll: `settled_on` recorded *when* a
salary was signed off and nothing recorded *who*.

---

## The `-0.2`

Only one formatter in the app could print a bare `-0.2` — one decimal, no
trailing zero: `toLocaleString('en-IN', { maximumFractionDigits: 2 })`, which
sets a maximum and no minimum. `toFixed(2)` would have printed `-0.20`. Both
were in use, side by side, on the same screens.

Four paths, all closed:

| Where | What was wrong |
|---|---|
| The salary page's summary cards | `formatCurrency` — the exact match. "Need to Settle" sums `final_salary`, which can legitimately go negative |
| Salary details, "Advances Deducted" | A hard-coded `-₹` prefix in front of the same formatter |
| Pay Advance, the Amount box | `type="number" step="0.01"` with **no `min`**, inside an `overflow-y-auto` body — a mouse wheel over the focused field steps it, twenty notches reach exactly `-0.2`, and the validator showed a message without ever correcting the value |
| The validation endpoint | `salaryRecord?.base_salary \|\| employee.base_salary` passed through unparsed, then `.toFixed(2)` called on it in the modal |

Now: one helper, `lib/format/currency.ts`, two decimals always, sign outside the
symbol, and `clamp` for totals that cannot meaningfully be negative. The Amount
box clamps on the way in — refusing the keystroke rather than complaining about
it is what stops the field *holding* a negative.

**The salary formula was not touched.** Brute-forcing every base salary
₹1,000–₹100,000 × days 0–27 × OT 0–3 yields no `-0.2`; it would need a ₹6 base
salary.

---

## Employee records

Added, all optional: employee code (auto), phone, address, emergency contact +
relation + phone, date of birth, gender, ID proof type + number, bank account +
IFSC.

**Registration still needs exactly what it needed before** — name, designation,
base salary, joining date. Everything else folds away behind headers showing how
much is filled.

The code is `EMP/26/007`, issued by a row-locked counter, prefilled from a
*peek* that does not consume a number. Untouched, the field is sent blank and
the server allocates — two people adding staff at once both see `007` and must
not both get it. Same mechanism as the patient ID.

**Inactive employees are reachable again.** Deleting sets status to Inactive, but
the page hardcoded `?status=Active`, so a deactivated employee vanished and could
never be restored through the UI. The Active/Inactive/All filter is what makes
the existing soft delete reversible.

---

## Documents

- **Advance log PDF** — landscape, the month and any active filters spelled out,
  KPI strip, per-employee subtotals, grand total.
- **Payslip PDF** — portrait, one employee, one month: earnings breakdown and
  the **itemised advances with date and given-by**. The only advance figure that
  ever reached a document before was the summed `total_advance` in the finance
  report, so an employee being paid could not check the deduction.

Both on `lib/pdf/base.ts`, so they match the lab report and the discharge
summary. `Rs.` rather than `₹` — jsPDF's Helvetica is WinAnsi and has no rupee
glyph.

---

## Roles

| Capability | Roles |
|---|---|
| Read the advance log | Admin, Doctor, **Receptionist** |
| Pay an advance | **Admin, Doctor** |
| Employee records · payroll · settle | **Admin, Doctor** |

`/employees/advances` is carved out of the admin-only prefix in `middleware.ts`,
matched *before* `/employees` so ordering cannot leak the other pages. The API
enforces the same split independently, in `lib/employees/authz.ts`, because
middleware does not guard `/api/**`.

### The hole that got closed

`POST /api/employees/[id]/salary/advances` and its validation sibling had **no
role check at all**. They verified the token, computed `payload`, never read
`payload.role`, and went straight to work — so any signed-in user, a lab
technician included, could pay an advance out of anyone's salary and read their
payroll figures. Both now go through `advance:write` / `advance:read`.

Every other route carried a two-line block copy-pasted fourteen times, under a
comment reading `// Admin only`, with an error reading `'Forbidden. Admin access
required.'`, and a condition that let DOCTOR through. That behaviour is
**preserved** — it is existing functionality and narrowing it is a one-line
change to `lib/employees/authz.ts` when someone decides to (BUGS.md #53).

---

## Also fixed

- **"Final Salary" showed `calculated_salary`** — the figure *before* advances
  are deducted, so a row could read ₹29,000 next to ₹28,000 of advances.
- **Search and paging moved to the server.** The register fetched the whole table
  on every keystroke and sliced it in the browser.
- **Errors are shown.** Every employee screen logged failures to the console and
  left stale rows on screen, so a failed fetch looked like an empty month.
- **Month-Year in the Pay Advance modal** was a controlled input with a `value`
  and no `onChange` — a console warning and a silently uneditable field.
- **`alert()` and `confirm()`** replaced with inline errors and `Modal`.
- Create and edit modals were ~99% duplicated; all three hand-rolled the overlay
  instead of `components/ui/modal.tsx`. One form component each now.

The test fake gained `employees.employee_code` in its `UNIQUE_INDEXES` registry
so the duplicate-code branch is testable at all.

---

## Known gaps

- **The two advance endpoints still have different rules.**
  `/api/employees/advances` enforces no cap while `/api/employees/[id]/salary/
  advances` does (BUGS.md #55). Unchanged, per the brief.
- **Settling writes no ledger entry** (BUGS.md #56), so payroll stays invisible
  in the daily cash book.
- **Advances cannot be edited or deleted.** There is no PUT/PATCH/DELETE route
  for them and this did not add one.
- **`users` and `employees` are disjoint registries** — no foreign key, no link.
  That is why "recorded by" is a user and "given by" is free text.
- **The CSV importer still splits on `,`** with no quote handling, and the
  `days/30` vs `27 working days` mismatch in the salary formula stands.
- **No month-on-month comparison view**, no employee profile PDF, no advance
  voucher — offered and not selected.
- **RLS is disabled on every table in this project.** Anyone with the anon key
  bypasses every role check above.
