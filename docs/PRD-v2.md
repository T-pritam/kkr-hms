# KKR HMS — PRD v2
### Desk permissions · Petty cash · Ledger log & closing · Registration fee · Patient money

| | |
|---|---|
| **Doc type** | Change-set PRD: target behaviour + build tracker. The as-built description of today's app stays in [`PRD.md`](PRD.md) (the baseline). |
| **Baseline code** | `main` @ `5f07acf` (2026-09-17) |
| **Requirements source** | Client requirements 1–11 (2026-09-21) and requirement 12, patient money + patient dashboard (2026-09-22, clarified the same day). Each is quoted at the top of its CR. |
| **Status** | Rounds 1, 2 and 3 answered (2026-09-22 / 23), with the include/exclude meaning corrected by you. **Nothing is open** ([`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md)). |
| **Built** | Not deployed; migrations not applied (§8.4). CR-11, CR-12 and CR-14 are on `feature/v2-registration-fee-payments`. CR-15 and CR-16 are on `feature/v2-patient-money`, stacked on it. |
| **Last updated** | 2026-09-23 |

## How to use this doc

1. **§2 Tracker** is the progress board: one row per change request (CR). Flip the status as work moves.
2. Every rule in §4 carries a tag:
   - **[D]** decided: from the client's requirement text or an answer in the log (§9.1 – §9.4).
   - **[Q-nn]** pending: waits on an answer. Nothing tagged Q gets built until it's answered. **Nothing is pending as of 2026-09-23.**
   - **[P]** proposed: an engineering suggestion that doesn't change business behaviour. Change freely.
3. New questions go in [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md) and are answered by ID: `Q-82: A`, `Q-80: as proposed`, or free text.
4. When a CR ships, tick its acceptance criteria, set it ✅ in §2, update the baseline [`PRD.md`](PRD.md), and add a line to §10.

**Tracker status:** ⛔ blocked on questions · 🔲 ready to build · 🟡 built on the branch, not deployed · ✅ live · ❌ dropped
**Gap severity:** 🔴 money records can disagree · 🟠 confusing / incomplete / weak control · 🟡 polish

## Contents

1. [What is changing](#1-what-is-changing)
2. [Tracker](#2-tracker)
3. [Target model: the rules everything else follows](#3-target-model)
4. [Change requests CR-01 … CR-17](#4-change-requests)
5. [Gap analysis: payments & charges](#5-gap-analysis--payments--charges)
6. [Happy path: registration → charges → payment → close](#6-happy-path--registration--charges--payment--close)
7. [Screens & navigation](#7-screens--navigation)
8. [Data, API & deployment](#8-data-api--deployment)
9. [**Open questions (→ OPEN-QUESTIONS.md) and the answer log**](#9-open-questions)
10. [Change log](#10-change-log)

---

## 1. What is changing

| Req | Client requirement (short form) | CR |
|:-:|---|---|
| 1 | Admin can do everything. Reception sees everything admin adds, edits only its own entries, and can't edit a status-based entry once it's closed. Permanent rule. | CR-01 |
| 2 | Petty cash: admin gives cash; reception expenses and advances come out of it. One shared pool, and a statement-style log with no status. | CR-02 |
| 3 | Reception pays employee advances without seeing salary figures. Each advance shows which user gave it. | CR-03 |
| 4 | Reception can add doctor visit pricing, referral commission and related data, under rule 1 (and can also pay them out: Q-19). | CR-04 |
| 5 | The ledger shows everyone's entries. Simpler fetching and UX. | CR-05 |
| 6 | Replace day close: admin bulk-selects rows and marks them closed, with a separate "not closed" tab. | CR-06 |
| 7 | Admin expenses are general expenses, not petty cash. | CR-07 |
| 8 | The ledger is no longer day-based. | CR-08 |
| 9 | Remove the base package. **Merged into CR-15** (confirmed by the clarification: nothing is pre-decided). | CR-09 → CR-15 |
| 10 | Finance restructure into log views: ledger, petty cash, expenses. | CR-10 |
| 11 | **High priority.** Registration fee pre-filled at registration, with "collected" and cash/UPI, recorded as a payment. | CR-11 🟡 |
| 12 | **New (2026-09-22), clarified the same day.** Charges are for internal knowledge only. The patient's total bill is the payments received. All money comes in through the desk. Doctor fees and the referral commission are always paid from the patient's money (expenses). Only **lab and medicine** ask when saved, defaulting to **Excluded**: excluded means the desk collects it now as its own payment tagged Lab/Medicine, and included means the regular payments already cover it. Payments carry labels (advance, regular, discharge, misc, lab, medicine, registration). Plus a patient dashboard. | CR-15 🟡, CR-16 |
| Q-54 | A new bill for each stay → Q-74: "consider it as new patient admission for now" (register them again). | CR-17 ❌ for now |
| — | From the gap analysis: a payment and its ledger entry stay one record · one payout path · India dates. | CR-12 🟡 · CR-13 · CR-14 🟡 |

**Before → after**

```
 TODAY                                                  AFTER v2
 ─────                                                  ────────
 Daily Ledger: one date at a time; reception            Ledger log: any date range; everyone sees every
   sees only its own rows                                 row; edit rights follow rule 1
 Verify (per row) + Shift settle (per user per day)     One step: admin bulk-selects rows → Closed.
   + Day close (per date, locks everyone)                 Closed rows lock for reception
 Desk expenses paid from the same cash as               Petty cash: admin tops up one shared pool; desk
   patient collections, booked in the ledger              spending lives only in the petty cash log
 Admin expenses in two places (ledger + Finances)       Admin expenses = General expenses only
 Registration fee: an ordinary charge, if at all        Pre-filled at registration, ☑ collected → payment   [built]
 A payment and its ledger entry drift apart             One record: saved, edited, deleted together       [built]
 Charges drive a bill total and a "Balance"             Charges are internal. Total bill = payments received;
   (plus a base package with "included" flags)            expenses = doctor fees + referral commission
 Payments have no type                                  Every payment labelled: Advance · Regular · Discharge ·
                                                          Lab · Medicine · Misc · Registration
 Numbers spread over several patient tabs               Patient Overview tab: total bill, what is passed on,
                                                          expenses, net, services used (internal)   [built]
 Doctor pricing, referral commission, payouts: admin    Reception too (own entries only)
 Advances: admin/doctor only                            Reception pays advances (no salary figures shown)
```

---

## 2. Tracker

| CR | Title | Req | Priority | Depends on | Waiting on | Status |
|---|---|:-:|:-:|---|---|:-:|
| [CR-01](#cr-01--own-row-rule-view-all-closed-lock-req-1) | Own-row rule, view-all, closed lock, enforced on the server | 1 | P0 | — | — | 🔲 |
| [CR-02](#cr-02--petty-cash-log-req-2-7) | Petty cash log (with an edit history, Q-70) | 2, 7 | P1 | CR-01 | — | 🔲 |
| [CR-03](#cr-03--employee-advance-for-reception-req-3) | Employee advance for reception | 3 | P1 | CR-01, CR-02 | — | 🔲 |
| [CR-04](#cr-04--reception-doctor-visit-pricing-referral-commission--payouts-req-4) | Reception: doctor pricing, referral commission & payouts | 4 | P2 | CR-01, CR-13 | — | 🔲 |
| [CR-05](#cr-05--ledger-log-all-entries-simple-fetching--ux-req-5) | Ledger log: all entries, simpler fetching & UX | 5 | P0 | CR-01 | — | 🔲 |
| [CR-06](#cr-06--closing-entries-req-6) | Closing: bulk close + "Not closed" tab | 6 | P1 | CR-05 | — | 🔲 |
| [CR-07](#cr-07--admin-expenses-are-general-expenses-req-7) | Admin expenses = general expenses | 7 | P2 | — | — | 🔲 |
| [CR-08](#cr-08--retire-the-day-based-daily-ledger-req-8) | Retire the day-based ledger (day close, shift settlement) | 8 | P1 | CR-05, CR-06 | — | 🔲 |
| [CR-09](#cr-09--remove-the-base-package-req-9--merged-into-cr-15) | Remove the base package | 9 | — | — | — | → CR-15 |
| [CR-10](#cr-10--admin-finance-restructure-req-10) | Admin finance restructure (log views) | 10 | P2 | CR-02, CR-05 – CR-07 | — | 🔲 |
| [CR-11](#cr-11--registration-fee-at-registration-req-11) | Registration fee at registration | 11 | **P0** | — | deploy (§8.4) | 🟡 |
| [CR-12](#cr-12--a-payment-and-its-ledger-entry-stay-one-record) | A payment and its ledger entry stay one record | gap | P0 | — | deploy (§8.4) | 🟡 |
| [CR-13](#cr-13--one-payout-path) | One payout path for doctor fees & referral commission | gap | P2 | CR-05 | — | 🔲 |
| [CR-14](#cr-14--india-ist-dates-everywhere) | India (IST) dates everywhere | gap | P1 | — | deploy (§8.4) | 🟡 |
| [CR-15](#cr-15--patient-money-income-expenses-lab-and-medicine-included-or-not-req-12) | Patient money: charges internal; lab & medicine excluded/included; payment labels; package removed | 12, 9 | P1 | CR-12 | deploy (§8.4) | 🟡 |
| [CR-16](#cr-16--patient-overview-dashboard-req-12) | Patient Overview (dashboard) | 12 | P1 | CR-15 | deploy (§8.4) | 🟡 |
| [CR-17](#cr-17--a-new-bill-for-each-stay-q-54) | A new bill for each stay | Q-54 | — | — | dropped for now (Q-74) | ❌ |

Priorities are from Q-56 and Q-76 ("as proposed"), with CR-11 at P0 from the client. **No CR is waiting on a question**: rounds 1–3 are all answered (§9).

**Definition of done (every CR):** the rule is enforced in the API, not only hidden in the UI · screens show an action only when it's allowed · tests added or updated under `tests/` · baseline `PRD.md` updated · row ticked here and logged in §10.

**Build order**

```
 Phase 1 (P0)                        Phase 2 (P1)                     Phase 3 (P2)
 ────────────                        ────────────                     ────────────
 🟡 CR-11 Registration fee            CR-06 Closing                    CR-04 Pricing & payouts by reception
 🟡 CR-12 Payment ⇄ ledger            CR-08 Retire day close           CR-07 Admin expenses
 🟡 CR-14 IST dates                   CR-02 Petty cash                 CR-10 Finance restructure
    CR-01 Rules on the server         CR-03 Advances by reception      CR-13 One payout path
    CR-05 Ledger log                  🟡 CR-15 Patient money & labels
                                   🟡 CR-16 Patient Overview
```

**Built so far** (branches `feature/v2-registration-fee-payments` → `feature/v2-patient-money`):
- CR-11, CR-12, CR-14 (registration fee, payment ⇄ ledger, IST dates) and CR-15, CR-16 (patient money, Overview)
- all 59 test files pass: 1,762 tests, plus 31 tests that record still-open bugs
- typecheck clean · `next build` passes
- BUGS #21 is resolved; BUGS #19 is half resolved

---

## 3. Target model

### 3.1 Words used in this doc

| Term | Meaning after v2 |
|---|---|
| **Entry** | Any row a person creates: a payment, charge, OPD receipt, expense, advance, price, top-up… |
| **Owner** | The user who created the entry. For a price, it's the user who last set it (Q-20 = A). |
| **Open / Closed** | Status of a closable ledger entry. Admin moves entries from Open to Closed in bulk (CR-06). |
| **Ledger** | The log of money received and paid out: patient payments, registration fees, OPD receipts, doctor and referral payouts. Not day-based. Desk spending isn't in it (Q-07 = A). |
| **Petty cash** | One shared pool of cash the admin gives the desk. Desk expenses and advances come out of it. A log only, with no status. |
| **Top-up** | Petty cash IN: admin → a receptionist. "Given to" is for information only. |
| **General expense** | An expense the admin pays. Never petty cash. |
| **Registration fee** | Taken at registration. Both a charge line and a payment (Q-45 = B), counted as income. |
| **Charges (services used)** | What the patient used: room, procedures, nursing, the registration line and so on. Recorded for internal knowledge only; **no finance figure uses them**, and there's no balance or due (req 12). |
| **Patient income / total bill** | Every payment received for the stay, all labels, including the registration fee when it was collected. |
| **Passed on** | Money the desk collected for the lab or pharmacy: the payments labelled Lab or Medicine. It's in the total bill, but it isn't the hospital's (Q-82). |
| **Hospital income** | Total bill − passed on. |
| **Patient expenses** | Doctor fees + referral commission only, always paid from the patient's money, counted as soon as they're priced (Q-81c). A lab or medicine charge marked **Included** is income, not an expense (Q-83). |
| **Net** | Hospital income − patient expenses: what the hospital keeps from the stay. Admin only (Q-66). |
| **Included / Excluded (lab / medicine)** | Asked when a lab or medicine charge is saved; default **Excluded**. **Excluded — collect now:** the app adds a separate payment tagged Lab or Medicine (Ledger IN). **Excluded — collect later:** the charge reads "collect ₹x from the patient" until someone collects it. **Included:** the patient's regular payments already cover it, so nothing extra is collected. |
| **Payment label** | Advance · Regular · Discharge · Lab · Medicine · Misc · Registration, shown as "12/26 Ramesh Kumar (Advance)" (Q-80). |
| **Stay** | One admission, with one bill (Q-54 = new bill per stay, CR-17). |

### 3.2 The permission rule (Req 1)

**[D]** Admin can do everything. Reception can view everything admin adds, except the areas in the "hidden" list below (Q-05). It edits or deletes only entries it created (money entries: Q-01 = B), and not once they're closed.

```
canModify(user, entry):
  if user.role == ADMIN           → allowed; a Closed ledger entry must be reopened first (Q-04 = B)
  if entry is a shared record     → allowed for any receptionist (Q-01 = B), except the
                                    registration fee catalogue item (admin only, Q-40)
  if entry.created_by != user.id  → refused (403)
  if entry is locked (column B)   → refused (409)
  otherwise                       → allowed        ("edit" includes delete: Q-04 a)
```

| # | Record | Reception may edit/delete **[D]** | Locks for reception when **[D]** |
|:-:|---|---|---|
| 1 | Patient record | any patient (shared record) | never |
| 2 | Doctor (registry) | any doctor | — |
| 3 | Referral person | create only (as today) | — |
| 4 | Charge catalogue item | any item, **except the registration fee item (admin only)** | — |
| 5 | Lab order steps | any order (workflow step) | as today |
| 6 | Doctor visit | own | its fee is paid |
| 7 | Patient charge | own | the patient is **Discharged** (Q-03 = B) |
| 8 | Charge sheet (quote) | own | forwarded |
| 9 | Patient payment (incl. registration fee) | own | its ledger entry is Closed |
| 10 | OPD receipt | own | Closed |
| 11 | Petty cash debit (expense) | own | **never**: petty cash has no status (Q-12 = A) |
| 12 | Employee advance | own | its salary month is settled (Q-17) |
| 13 | Petty cash top-up | never (admin's) | — |
| 14 | Doctor fee schedule rate | own | — |
| 15 | Doctor fee price on a patient | own (the last one to set it, Q-20) | the fee is paid |
| 16 | Referral commission | own (the last one to set it, Q-20) | the commission is paid |
| 17 | Doctor fee / referral payout made by reception | own | Closed (Q-71) |
| 18 | Lab / medicine included-or-excluded (CR-15) | admin or any receptionist, when saving or later (Q-65) | once **Collected**: its amount and status are fixed until its payment is deleted (Q-79) |
| 18a | Lab/Medicine payment (a collected charge) | own, but the amount comes from the charge | Closed |
| 19 | General expense | never (admin's) | — |

**Hidden from reception (Q-05):** the general expenses log · Finances Overview (revenue, profit) · payroll (salary, present days, payslips) · the employee register · the Admin Panel. **Shown:** the ledger (all entries, incl. payouts) · the petty cash log · advances (without salary figures) · the doctor fee schedule.

**Other roles (Q-06):** Doctor and Nurse get the same ledger access as reception. Lab technician gets no ledger or payment access. Doctor loses "verify" (closing is admin-only) and keeps payroll. *None of these roles has a login today*; the rules are there for when they do.

### 3.3 Where money is recorded: the three logs (Req 2, 5, 7, 10)

**[D]** Q-07 = A: desk spending lives only in Petty cash.

| Entry | Ledger log | Petty cash log | Expenses log | In the closing list? | Who creates |
|---|:-:|:-:|:-:|:-:|---|
| Patient payment | IN | — | — | yes | Reception, Admin |
| Registration fee | IN | — | — | yes | Reception, Admin |
| OPD receipt | IN | — | — | yes | Reception, Admin |
| Desk expense (paid from petty cash) | — | OUT | Q-69 (bulk line) | no | Reception; Admin too (Q-11) |
| Advance paid from petty cash | — | OUT | — | no | Reception |
| Petty cash top-up | — | IN, "given to …" | Q-69 (bulk line) | no | Admin |
| General expense | — | — | yes | no | Admin |
| Doctor fee payout | OUT | — | — | admin: born Closed (Q-25) · reception: Open (Q-71) | Admin, Reception (Q-19) |
| Referral commission payout | OUT | — | — | as above | Admin, Reception (Q-19) |
| Lab / Medicine payment (charge **Excluded**, collected now) | IN, label Lab / Medicine | — | — | yes | Reception, Admin (the person collecting) |
| Advance paid by admin | — | — | — | — | Admin; stays in Employees → Advance log |
| Salary settlement | — | — | — | — | Admin; stays in Employees |

Balances **[D]**:
- **Petty cash balance** = Σ top-ups − Σ petty cash OUT. Patient money never enters it (Q-08). It may go negative; the next top-up brings it back (Q-10).
- **Cash collected, not yet closed** = Σ Open ledger IN paid in cash − Σ Open ledger OUT paid in cash (payouts reception makes from the day's collections, if Q-71 = A). Shown on the Not closed tab.

### 3.4 Status of a closable ledger entry (Req 6)

```
  created ──► OPEN ──── admin ticks rows ▸ "Mark closed" (optional note) ────► CLOSED
               ▲                                                                │
               └────────────────── reopen: admin + reason (Q-04 = B) ───────────┘

  OPEN    owner (reception) may edit/delete · admin may edit/delete
  CLOSED  nobody edits until reopened · the payment behind a closed entry locks too
  Admin-created entries are born CLOSED (Q-25 = A). "Verified" goes away (Q-24 = A).
```

### 3.5 Patient money, in one line (Req 12, CR-15)

Charges record what the patient used; they're for internal knowledge and move no money. All money comes in through the desk (Q-60). The patient's total bill is what they paid.

```
Charges (services used) = internal record only: no balance, no due
Total bill      = Σ payments on the stay (all labels; registration fee only if collected)
Passed on       = payments labelled Lab / Medicine: collected at the desk for the lab or
                  pharmacy, so not the hospital's money                            (Q-82)
Hospital income = Total bill − Passed on
Expenses        = doctor fees + referral commission, always paid from the patient's money,
                  counted as soon as they are priced, paid or not                  (Q-81)
                  An Included lab / medicine amount is NOT an expense: it is income (Q-83)
Lab / medicine charge, asked when saving, default Excluded:
  Excluded → collect now:   a separate payment tagged Lab / Medicine, shown in the Ledger
          → or collect later: the charge reads "collect ₹x from the patient"       (Q-87)
  Included → nothing extra is collected; the patient's regular payments cover it
Net = Hospital income − Expenses                                (admin only, Q-66)
```

Details, a worked example and the open points are in CR-15.

---

## 4. Change requests

Each CR follows the same shape: client text → today → target → code touched → acceptance criteria (tick as built). "Today" describes the code at `5f07acf`.

### CR-01 — Own-row rule, view-all, closed lock (Req 1)
**Priority** P0 · **Status** 🔲 ready

> *Admin can do everything. Receptionists can view everything the admin adds, but cannot edit entries created by the admin or by other receptionists. Receptionists can edit their own entries, except entries that are status-based and have been marked closed. Closed entries are not editable by receptionists.*

**Today**
- Own-row edit/delete already exists for charges, payments, doctor visits, ledger entries and charge sheets.
- Every record locks differently: payments when verified or their day is closed; ledger rows only by day close; visits when the fee is paid; quotes when forwarded; charges never.
- Some APIs had no role check: payments (fixed on the branch, CR-12), visits, referral creation (no login at all), and creating a billing row (G-08).
- Reception sees only its own ledger rows.

**Target** (all decided)
- [D] The rule and matrix in §3.2 (Q-01 = B, Q-02, Q-03 = B, Q-04, Q-05, Q-06).
- [D] Charges lock for reception once the patient is Discharged (Q-03 = B).
- [D] Admin reopens a Closed ledger entry (with a reason, logged) before editing it (Q-04 = B).
- [P] One helper, `lib/authz/ownership.ts` → `canModify(user, row)`, used by every write route. List APIs return `can_edit` on each row.
- [P] Role checks on the visit, referral and billing-create APIs. The payment API already has them (`payment:write`, on the branch).

**Acceptance criteria**
- [ ] AC-01.1 Reception A can't edit or delete a money entry created by Admin or by Reception B: 403, and no button.
- [ ] AC-01.2 Reception A can edit/delete its own unlocked entry.
- [ ] AC-01.3 Reception A can't edit/delete its own locked entry (§3.2 column B): 409 `ENTRY_LOCKED`, and no button.
- [ ] AC-01.4 Any receptionist can edit any patient, doctor or catalogue item, except the registration fee item.
- [ ] AC-01.5 Reception can't add, edit or delete a charge on a Discharged patient.
- [ ] AC-01.6 Admin can't edit a Closed ledger entry without reopening it; reopening needs a reason and is logged.
- [ ] AC-01.7 The areas hidden from reception (§3.2) return 403 for reception.
- [ ] AC-01.8 A Lab technician can't record a payment. ✅ *on the branch*

### CR-02 — Petty cash log (Req 2, 7)
**Priority** P1 · **Status** 🔲 ready (Q-70, edit history, is optional)

> *All receptionist expenses (e.g., expenses added in the ledger and employee advances) are paid from petty cash that the admin gives to receptionists. Petty cash is a single shared amount used by all receptionists across shifts. Add a separate petty cash log showing both credits (admin giving cash) and debits (receptionist expenses), like a bank statement: credit/debit, date, and reason. This log has no status. It is only a log, visible to both admin and receptionists. For each credit, record which receptionist it was given to. This is for information only (so others know who received it) and has no other effect.*

**Today**
- The code has no concept of petty cash.
- Reception expenses are ledger debits paid from the same cash as patient collections.
- Advances aren't in any cash book.

**Target** (all decided)
- [D] One shared pool across receptionists and shifts. A statement-style log (date · IN/OUT · amount · mode · reason · given to · added by · running balance), with no status and no closing. Admin and reception both see it.
- [D] Desk spending lives **only** here, not in the Ledger (Q-07 = A).
- [D] **Top-up** (admin only): date, amount, reason, given to (a receptionist, for information only).
- [D] **Debits:** reception expenses and reception-paid advances only (Q-13). Admin may also add a debit, which is marked "added by admin" (Q-11 = B).
- [D] Reception adds only petty cash expenses, and a reason is required (Q-39).
- [D] Patient money never enters petty cash (Q-08). Balance = top-ups − debits. It may go negative with a warning; later top-ups bring it back (Q-10 = B).
- [D] Each entry records its mode, defaulting to cash (Q-09).
- [D] Reception may edit or delete its own debits at any time. The balance then changes, and the admin checks it against the cash the desk holds (Q-12 = A). [Q-70] Keep an edit history?
- [D] Starts at go-live with an "Opening balance" credit entered by admin. Older ledger expenses stay where they are (Q-14 = A).
- [P] Table `petty_cash_entries` (§8.1); page `/petty-cash`; API `/api/petty-cash`. The "Add Expense" button moves here from the ledger page (Q-23).

**Acceptance criteria**
- [ ] AC-02.1 Admin adds a top-up. It appears as a credit, "given to Priya", on the log both roles see.
- [ ] AC-02.2 Reception adds an expense (reason required). It appears as a debit on the petty cash log and **not** in the Ledger.
- [ ] AC-02.3 A reception-paid advance (CR-03) appears as a debit.
- [ ] AC-02.4 A running balance is shown, and a negative balance shows a warning without blocking.
- [ ] AC-02.5 The log has no status column and no close action.
- [ ] AC-02.6 Reception can't add or change top-ups. It can edit/delete its own debits at any time, but not other people's.
- [ ] AC-02.7 An opening balance can be entered once at go-live.

### CR-03 — Employee advance for reception (Req 3)
**Priority** P1 · **Status** 🔲 ready

> *Add an Employee Advance section to the receptionist view so receptionists can pay advances to employees. Receptionists must NOT see other employee details such as salary, present days, or remaining amount to settle. Advance details must show which user gave the advance.*

**Today:** advances are Admin/Doctor only, and the form shows salary figures. Reception had this feature, with the figures redacted, from 2026-08-03 (`521813b`) until 2026-09-17 (`b43254e`). "Given by" is free text, advances can't be edited or deleted, and one endpoint skips the cap (BUGS #55).

**Target** (all decided)
- [D] Reception's menu gets **Employee Advance**, for paying advances and seeing them.
- [D] **What reception sees (Q-18):** code, name and designation; all advances (date, employee, amount, salary month, remarks, given by); a salary-month picker (default: the current month).
- [D] **What reception never sees:** base salary, present days, OT, calculated or final salary, or the remaining amount. These are left out of the API responses.
- [D] "Given by" is the logged-in user, set automatically. The free-text field goes; old values stay for history (Q-15 = A).
- [D] The salary cap still applies. Reception sees only "Exceeds the allowed limit, ask admin", with no amount (Q-16 = A). The uncapped endpoint gets the cap (BUGS #55).
- [D] A reception-paid advance is a petty cash debit (CR-02). It is not a ledger entry (Q-07 = A).
- [D] The owner may edit or delete an advance until its salary month is settled, and the petty cash debit follows (Q-17 = A).
- [P] The employee picker returns only code, name and designation. The advance and its petty cash debit are written together, and a failed petty cash write removes the advance.

**Acceptance criteria**
- [ ] AC-03.1 No salary, present days or remaining amount appears on screen **or in any API response** for reception (tests check the response bodies).
- [ ] AC-03.2 Reception pays ₹2,000. The advance is saved, the month's advance total updates for payroll, and a ₹2,000 petty cash debit is created.
- [ ] AC-03.3 "Given by: <receptionist>" shows in reception's view and in admin's Advance Log.
- [ ] AC-03.4 An advance over the cap is refused with the generic message, and so is one against a settled month.
- [ ] AC-03.5 The owner edits or deletes an advance, the petty cash debit changes with it, and both are locked once the month is settled.

### CR-04 — Reception: doctor visit pricing, referral commission & payouts (Req 4)
**Priority** P2 · **Status** 🔲 ready (Q-71, Q-72 answered)

> *Receptionists can add doctor visit pricing, referral commission, and related data. Rule #1 (permissions) applies here.* The Q-19 answer adds: *"they can add fees to doctor and mark them paid also".*

**Today:** all of this is admin-only. That covers the fee schedule, Sync Visits, pricing, delete, the referral commission and paying out. Saving the fee schedule overwrites every rate's `created_by`. Manual fee rows, merging and visit purposes exist only in the API; no screen calls them.

**Target**
- [D] Reception can do everything in Q-19 a–h: the doctor fee schedule · Sync visits · price fee rows · manual rows, merge and delete · set the referral person and commission · **pay out doctor fees and referral commissions** · manage visit purposes.
- [D] The owner of a price is whoever last set it. Once admin sets a value, reception can't change it, and a paid fee or commission is locked (Q-20 = A, §3.2).
- [D] Keep Sync + pricing. The fee isn't captured at visit time (Q-21 = B).
- [Q-71] What money reception pays doctors and referrers from. [Q-72] Whether to build the missing screens for manual rows, merge and visit purposes now.
- [P] Store `amount_set_by` on fee rows and `referral_commission_set_by` on the bill. Save the fee schedule one rate at a time, so each rate keeps its owner. Payouts go through the single payout path (CR-13).

**Acceptance criteria**
- [ ] AC-04.1 Reception sets a referral commission and becomes its owner. Another receptionist can't change it; admin can.
- [ ] AC-04.2 Reception prices a fee row and becomes its owner. Once it's paid, nobody but admin (after reopening) changes it.
- [ ] AC-04.3 Admin-set prices are read-only to reception.
- [ ] AC-04.4 Reception pays a doctor fee. It is booked per Q-71 and appears in the Ledger as OUT, Open.
- [ ] AC-04.5 Q-72: visit purposes are managed now; manual ledger rows and merging the employee ledgers come later.

### CR-05 — Ledger log: all entries, simple fetching & UX (Req 5)
**Priority** P0 · **Status** 🔲 ready

> *The ledger currently shows only the logged-in user's entries. It should show all entries, so others don't have to guess whether a payment was received. The current ledger data fetching and UX are too complex. Simplify them.*

**Today: why it's complex**
- Three screens show overlapping ledger data (Daily Summary, Finances → Transactions, Employee Shift Schedule), plus the Day Close tab and the open-days banner.
- There are 10 ledger route files, most hand-rolling the token refresh; nothing is paginated; the whole day is refetched whenever any of 4 tables changes.
- Non-admins see only their own rows. On the branch, rows that belong to a payment already carry `payment_installment_id` and link to the patient instead of offering Edit.

**Target** (all decided)
- [D] Everyone with ledger access sees all entries (Q-05, Q-06). The ledger holds:
  - patient payments, each with its label (Advance, Regular, Discharge, Misc, Registration, and the automatic Lab and Medicine payments: CR-15)
  - OPD receipts
  - doctor, referral and lab/pharmacy payouts

  Desk spending isn't in it (Q-07 = A).
- [D] **Defaults (Q-22):**
  - **View:** the current month, newest first, 50 rows per page.
  - **Columns:** date & time · type · patient or description · IN · OUT · mode · reference · added by · status · actions.
  - **Filters:** date range, in/out, type, mode, added by, status, patient.
  - **Totals** follow the filter: IN, OUT, net, cash IN, cash OUT.
  - **Backdating:** entries may be dated any past day, and new ones land in Not closed.
- [D] **Buttons (Q-23):** Add payment and Add OPD receipt on the Ledger. Add expense and Top up move to Petty cash, Pay advance to Employee Advance, and Patient → Payments keeps its Add payment.
- [P] One page with two tabs, **All** and **Not closed**. One list endpoint, `GET /api/ledger/entries?from&to&direction&type&mode&added_by&status&patient&page`, returning rows with `can_edit`, the total row count, and totals. One realtime subscription. One shared auth guard.

**Acceptance criteria**
- [ ] AC-05.1 Reception sees entries created by admin and by other receptionists.
- [ ] AC-05.2 Edit/Delete appear only where `can_edit` is true. Payment rows link to the patient instead. ✅ *(link on the branch)*
- [ ] AC-05.3 A date-range filter replaces the single date; the default is the current month.
- [ ] AC-05.4 The filters and totals match Q-22.
- [ ] AC-05.5 50 rows per page, newest first, and one list request per page view.
- [ ] AC-05.6 A payment added on a patient's Payments tab shows up for every user without a reload.

### CR-06 — Closing entries (Req 6)
**Priority** P1 · **Status** 🔲 ready

> *Remove the per-user, per-day "day close" done by the admin. Instead, list all relevant rows with full details. The admin selects rows in bulk and marks them closed. No per-user or per-day grouping. Add a separate tab showing rows that are not yet marked closed. The current approach is too complex to manage.*

**Today:** three overlapping "done" steps: Verify (per row), Shift settlement (per user per day, which auto-verifies) and Day close (per date, which locks everyone) (G-21).

**Target** (all decided)
- [D] No per-user close and no per-day close. The ledger lists all rows with full details, and admin selects many and marks them **Closed**.
- [D] One status, Open → Closed. "Verify" goes away, and existing Verified rows become Closed (Q-24 = A).
- [D] Entries admin creates are born Closed (Q-25 = A). Entries reception creates, payouts included, are born Open.
- [D] The **Not closed** tab lists every Open row across all dates and users. It has filters (date range, added by, mode, type) but no grouping, and shows the total of the ticked rows, e.g. "12 rows · cash ₹8,400 · UPI ₹3,900" (Q-26).
- [D] A bulk close can carry an optional note and "amount received" (Q-27 = B). Reception sees the Not closed tab read-only (Q-28).
- [D] Admin reopens with a reason, and the reopen is logged (Q-04 = B).
- [D] **Go-live (Q-29):**
  - rows on days that are already closed become Closed
  - Verified rows become Closed
  - all other rows become Open
  - old day closures and shift settlements stay in the database, read-only, with no screen
- [P] Rows get `closed_at`, `closed_by` and `close_batch_id`, plus a table `ledger_close_batches` (note, amount received). `POST /api/ledger/close { ids[], note?, amount_received? }` closes only rows that are still Open. `POST /api/ledger/reopen { ids[], reason }`.

**Acceptance criteria**
- [ ] AC-06.1 The Not closed tab lists every Open row across all dates and users.
- [ ] AC-06.2 Admin ticks 12 rows, sees the selection total, adds a note and clicks "Mark closed (12)". All 12 show Closed, by admin, with the time and the note.
- [ ] AC-06.3 Nobody edits a Closed row, or the payment behind it; admin must reopen first.
- [ ] AC-06.4 No screen groups rows by user or by day for closing.
- [ ] AC-06.5 Reception can't close or reopen (403) but sees the tab.
- [ ] AC-06.6 The go-live migration marks rows as agreed in Q-29.

### CR-07 — Admin expenses are general expenses (Req 7)
**Priority** P2 · **Status** 🔲 ready (Q-69 answered)

> *Admin expenses are general expenses and are NOT related to petty cash. Petty cash applies to receptionists only.*

**Today:** expenses live in two places (ledger expenses and Finances → Expenses). General expenses record no author and no payment mode.

**Target**
- [D] An expense the admin pays is a general expense. It never touches petty cash, and admin no longer adds ledger expenses (Q-07).
- [D] General expenses record the payment mode (Q-09), keep their 8 types, and require a reason/remarks (Q-39 = A).
- [Q-69] How petty cash appears in the Expenses log as a bulk line per period.
- [P] `expenses.created_by` / `updated_by` / `payment_mode`. The Expenses log shows "added by".

**Acceptance criteria**
- [ ] AC-07.1 Admin adds an expense, and it appears only in the Expenses log.
- [ ] AC-07.2 The Expenses log shows date, type, amount, mode, remarks and added by.
- [ ] AC-07.3 Q-69 = A: petty cash reaches the Expenses log as one automatic line per month, "Petty cash spent".

### CR-08 — Retire the day-based daily ledger (Req 8)
**Priority** P1 · **Status** 🔲 ready

> *Fix the daily ledger: it should no longer be day-based, per point 6.*

**Remove [D]**
- **Screens:** the one-date Daily Summary (`/ledger/summary` becomes the log), Employee Shift Schedule, Finances → Day Close, Finances → Transactions, the open-days banner, the close/reopen dialogs, and the dead `/daily-ledger/*` stubs.
- **APIs:** `daily-summary/[date]`, `close-day`, `reopen-day`, `open-days`, `employee-shift-summary`, `shift-settlements` (and `[id]`).
- **Rule:** "a closed date blocks every write" is replaced by the per-row Closed lock.
- **Tests:** the four day-close/shift test files and `tests/unit/ledger-closure.test.ts` are rewritten for CR-06.

**Keep [D]** (Q-29): `daily_ledger_closures` and `daily_ledger_shift_settlements` stay in the database as read-only history, with no screen.

**Acceptance criteria**
- [ ] AC-08.1 No ledger screen asks for a single date.
- [ ] AC-08.2 No code writes to `daily_ledger_closures` or `daily_ledger_shift_settlements`.
- [ ] AC-08.3 An entry's date no longer locks anything.

### CR-09 — Remove the base package (Req 9) — merged into CR-15
**Status** → CR-15 (Q-68 answered by the 2026-09-22 clarification: nothing is pre-decided, so the package goes)

> *The base package is not useful and should be removed completely. The total amount is derived from the payments/installments made so far. Do not show "due: X amount" based on the base package, either in the patient section or in the finance section.*

**Why merged:** you answered Q-30 "Drop", then Q-31 = C, Q-32 = A and Q-33 = A, which only apply if the package goes. The clarification then settled it: *"no one pre-decided — admin decided bit by bit"*. With charges now internal (CR-15), the package and its "included" flags simply disappear.

Decided for the removal (all in CR-15):
- **Q-31 = C:** superseded by the clarification. There's no balance; the total bill = payments (CR-15; confirmed by Q-64 = C).
- **Q-32 = A:** Finances loses "Pending receivables".
- **Q-33 = A:** existing base charges become a "Package (legacy)" charge line. Only one live bill has one: ₹20,000 (§5.4).
- **Q-34:** left blank; covered by requirement 12. Doctor fees are always paid by the patient, either included or as a separate due.
- **Q-35:** the patient-facing PDF is revisited in Q-67, since charges are now internal.

### CR-10 — Admin finance restructure (Req 10)
**Priority** P2 · **Status** 🔲 ready (Q-69, Q-81 answered)

> *Given the changes above, the admin finance section and its sub-sections will change significantly. Remove the daily ledger view. Instead, show log-style views for ledger, petty cash, and expenses.*

**Target**
- [D] No daily ledger view.
- [D] **Navigation (Q-38 = A):** Ledger, Petty cash and Employee Advance are menu items shared with reception. Finances keeps Overview · Expenses · Settlements.
- [D] **Overview (Q-36), cash basis:**
  - **Money in** = patient payments (all labels, incl. registration and the automatic lab/medicine payments) + OPD receipts.
  - **Money out** = general expenses + desk (petty cash) expenses + salary for settled months + doctor and referral payouts actually made. No lab/pharmacy payout is tracked: an included amount is income (Q-83), and a separately collected one is passed on at the desk (Q-82).
  - Advances count once, inside salary. Top-ups aren't expenses.
  - **Profit** = money in − money out.
- [D] Pending receivables removed (Q-32 = A).
- [D] Q-69: petty cash enters Money out as one automatic line per month, "Petty cash spent".
- [D] Q-81(b): the Expenses tab also lists the doctor fees and commissions **not paid yet**, per patient, as Paid or Pending; Money out counts only the paid ones.
- [D] Charges are internal (CR-15), so Finances drops "Charges incurred". Per-patient income, expenses and net come from CR-15.

**Acceptance criteria**
- [ ] AC-10.1 Each log is one click from the menu.
- [ ] AC-10.2 The Day Close and Transactions tabs are gone.
- [ ] AC-10.3 Every Overview figure matches the Q-36 definition, with one test per figure.

### CR-11 — Registration fee at registration (Req 11)
**Priority** **P0** · **Status** 🟡 built on the branch · deploy per §8.4

> *The registration fee is set in the registration catalogue. When a patient is admitted or created, auto-fill this amount and show a checkbox to mark it as collected, with a payment mode selection (cash or UPI). Record it in the ledger as a payment/installment received. Registration fee is income; all other charges are for services used.*

**Decided:** Q-40 = A · Q-41 = A · Q-42 = B · Q-43 (unticked; not collected → banner + Collect now) · Q-44 = A · Q-45 = B · Q-46 = B · Q-47 = yes.

**After the clarification:** still consistent. The registration fee counts in the total bill only when it's collected, which is what's built, and its charge line is internal like every charge. With the payment labels (CR-15, built on `feature/v2-patient-money`), the ledger reads "12/26 Ramesh Kumar (Registration)".

**What was built**

| Part | Where |
|---|---|
| Which catalogue entry is the fee: `charge_items.is_registration_fee` (migration flags `REG`); only admin may edit or retire it (403 `REGISTRATION_FEE_ADMIN_ONLY`) | `supabase/migrations/20260922000001_registration_fee.sql`, `app/api/charge-items/[id]/route.ts` |
| The amount for the form | `GET /api/registration-fee`, `lib/billing/registration-fee.ts` |
| Add Patient: amount pre-filled and editable (0 waives it), ☐ Collected (unticked), Cash/UPI, UPI reference | `components/patients/patient-form-modal.tsx` |
| Registration writes a charge line (snapshotted name) plus, if collected, a payment of kind `registration` with a ledger IN of source `registration`. The fee block is checked before the patient is written, and a later failure keeps the registration and reports `registration_fee.status = failed` | `app/api/patients/route.ts`, `lib/billing/registration-fee.ts` |
| `patient_billing.registration_fee_status`: pending / collected / waived (empty on older bills, so no false "not collected") | migration, `lib/billing/payments.ts` |
| Payments tab: a "Registration fee" label; "Registration fee ₹X not collected yet" with **Collect now** (cash/UPI only) | `components/patients/payments-tab.tsx`, `app/api/patients/[id]/billing/route.ts` |
| Ledger: the "Registration fee (patient)" label; no ledger-side Edit/Delete | `app/ledger/summary/page.tsx` |
| Catalogue: a "Registration fee" badge; reception sees "Admin only" | `app/charges/catalogue/page.tsx` |
| Tests | `tests/api/billing/registration-fee.test.ts` (19 tests) |

**Acceptance criteria**
- [x] AC-11.1 With the fee set to ₹100, Add Patient shows ₹100 pre-filled, a Collected checkbox and Cash/UPI.
- [x] AC-11.2 ☑ Collected + Cash → payment #1, ₹100, cash, kind registration. The Ledger shows IN ₹100 of source `registration`, owned by whoever registered the patient (status Open, shown as "pending" until CR-06).
- [x] AC-11.3 UPI records its reference; UPI without a reference is refused before anyone is registered.
- [x] AC-11.4 ☐ → the charge only, with status pending and the banner showing Collect now.
- [x] AC-11.5 Editing the patient later never adds a second fee (the fee exists only on create; one registration payment per bill, enforced by a unique index).
- [x] AC-11.6 A double-click can't take the fee twice (unique index). The form disables Save while saving.
- [x] AC-11.7 If the fee payment fails, no payment or ledger row is left; the patient stays registered with the fee pending.
- [ ] AC-11.8 Checked on production after deploy (§8.4).

### CR-12 — A payment and its ledger entry stay one record
**From gaps G-01 … G-08** · **Priority** P0 · **Status** 🟡 built on the branch · deploy per §8.4

**Decided:** Q-48 = yes.

**What was built** (`lib/billing/payments.ts`, `app/api/patients/[id]/installments/*`, `app/api/ledger/transactions/*`)
- Every rule is checked before anything is written: the amount is > 0, the mode is valid, UPI has a reference, the date is real, and the bill belongs to the patient in the URL (G-04, G-05, G-06).
- The ledger credit is always written (`create_ledger_entry` is gone, G-07). If it's refused, the installment is removed again.
- Editing a payment updates its ledger row. Deleting removes both. A payment that never had a ledger row gets one on its next edit.
- The ledger screen can't edit or delete a payment's credit: 409 `LEDGER_ENTRY_IS_PAYMENT`. Lists flag those rows and link to the patient instead.
- `patient` and `registration` are no longer ledger sources a user can pick.
- `payment:write` capability: Admin, Reception, Doctor and Nurse, but not Lab technician (G-08, for payments).

**Labels (CR-15):** built on `feature/v2-patient-money` with a follow-up migration (`20260923000001`) rather than by amending `20260922000001`. `kind` now holds the label (regular, advance, discharge, misc, lab, medicine, registration), and existing rows become `regular`.

**Acceptance criteria**
- [x] AC-12.1 Changing a payment from ₹5,000 to ₹500 makes its ledger row ₹500 too; mode, reference, date and remarks follow.
- [x] AC-12.2 Deleting a payment deletes its ledger row.
- [x] AC-12.3 A rejected ledger write leaves no payment behind.
- [x] AC-12.4 A payment can't be recorded against another patient's bill.
- [ ] AC-12.5 Checked on production after deploy (§8.4).

### CR-13 — One payout path
**From gaps G-09 … G-12** · **Priority** P2 · **Status** 🔲 ready

- [D] Q-37 = B: whichever screen a doctor fee or referral commission is paid from, it writes exactly one ledger OUT. Un-paying reverses it, and the payout's ledger row can't be deleted on its own.
- [D] Q-37 (b): paying a different amount than priced updates the fee total to the amount paid.
- [D] Reception can pay out too (Q-19).
- [D] Doctor fees and the referral commission are always the patient's expenses, paid from the patient's money: a ledger OUT "for sure" (clarification, point 2).
- [D] Q-81: paying one writes a ledger OUT (a), the unpaid ones show in the Expenses tab as pending (b), and a patient's figures count them as soon as they're priced (c).
- [D] Q-71 = A: reception pays from the day's collections, and the OUT is born Open (closed at ⑦).

**Acceptance criteria**
- [ ] AC-13.1 Paying from the patient tab creates a ledger OUT.
- [ ] AC-13.2 Un-paying removes that ledger OUT.
- [ ] AC-13.3 Paying ₹2,500 against a priced ₹3,000 leaves the fee total at ₹2,500, and the bill recalculates.
- [ ] AC-13.4 Q-71 = A: a payout by reception comes from the day's collections and is born Open.

### CR-14 — India (IST) dates everywhere
**From gap G-30** · **Priority** P1 · **Status** 🟡 built on the branch

**Decided:** Q-49 = yes. **Built:** `lib/dates/ist.ts`. Every "today" and "this month" default that used the UTC date now uses Asia/Kolkata: 32 call sites across the payments, ledger, finance, payroll, charge, patient and pharmacy code, plus the two form helpers that used the browser's date. The patients report's "last month" range no longer starts a day early. Tests: `tests/unit/ist-date.test.ts`.

- [x] AC-14.1 At 01:30 IST, every form and API defaults to that day's IST date.

### CR-15 — Patient money: income, expenses, lab and medicine included or not (Req 12)
**Priority** P1 · **Status** 🟡 built on `feature/v2-patient-money`, not deployed (§8.4) · every question answered (Q-78 – Q-87, §9.1)

> Client, 2026-09-22, clarification (verbatim):
> 1. *"Total patient bill: (currentl flow no one pre-decided) admin decided bit by bit and ask the receptionist to take the amount so and so .so the patient total bill = total payment + regt fee(if included then yes or else no)."*
> 2. *"Doctor fee and referral fees: either it include or exclude(not needed to decide anything here) we have to pay from the patient amount. so you have make it debit as expense for sure(like currently happening) or add it as the form of expense as we currently doing (and showing in the exense tab for all the left offs)."*
> 3. *"The remaining charges like Lab and Medicine are the once which they need to pay separate or include if separate add there a checkbox or something related as include or not (make sure only these 2 need to ask not all). there mention if included it will add as the payments and with notes(auto) (and as the payments reflect in the ledger part). or if exclude then it will not."*
> 4. *"we are adding patient charges for internal knowledge (it has nothing to do with the hopital finances) as we get payments from the patient as income and related to that patient expense as (doctor+referal if any) + (lab and medicine if any and if included)."*
> 5. *"if patient charges added show patientId and name in brancket show labels like (adv/regular payments/ discharge/ lab/ medicine /misc) so easy to track things"*
>
> Client, 2026-09-22, round-2 answers and the meaning of include/exclude (verbatim):
> - Q-59: *"By default mark it as excluded and ask at the time of save as a alert"*
> - Q-60: *"No matter what all the fees are collected by desk(receptionist) then they will enter in the software and distribute(its their headache) but all the amount comes by desk"*
> - Q-62: *"it should act like the same way lab does in charges(by default add it to charges like said above with excluded)"* · Q-63: *"No smartpharma bill direct place amount in the field(later integrate if needed)"*
> - Q-64: *"charge has nothing to do with the balance and patient payemnts/installments it is just for patient bill and our knowledge"*
> - *"include means included in the payments so not to collect this from the patient seprtely, exclude means collect and at the same time that thing adds as a separate in the payemtn/installments of the patient and as installments show in the ledger (with proper patienet detals and lab or medicine as tag)"*

**Correction.** An earlier draft of this CR had Included and Excluded reversed. The client's meaning is the one above: **Excluded = collected separately, as its own tagged payment. Included = already covered by the regular payments.**

**The model (decided)**
1. **Charges are internal.** They're recorded for the patient's bill and staff knowledge only. No finance figure uses them, and there's no balance or "due" (point 4, Q-64).
2. **Nothing is pre-decided.** Admin decides, bit by bit, how much to collect, and the desk takes it as payments. **All money comes in through the desk** (point 1, Q-60).
3. **Total bill** = every payment received on the stay, including the registration fee when it was collected (point 1).
4. **Expenses** = **doctor fees + referral commission**, always paid from the patient's money (point 2), counted as soon as they're priced, paid or not (Q-81c).
   - A lab or medicine charge marked **Included** is **not** an expense. Q-83: *"Included lab or medicine amount is hospital income; we add this only for the logs and to know the patient while seeing the charges."* That money stays with the hospital, and no payout to the lab or pharmacy is tracked here.
   - Money **collected separately** for lab or medicine is **passed on** to the lab or pharmacy (Q-82 = A). It counts in the patient's total bill, and is subtracted again to give the hospital's income.
5. **Only lab and medicine charges ask** "included or not?" (point 3):
   - The question is asked when the charge is saved, as an alert, defaulting to **Excluded** (Q-59), with three answers (Q-87):
   - **Excluded — collect now:** the desk takes the amount there and then. The app adds a separate payment tagged **Lab** or **Medicine**, with an automatic note, and it shows in the Ledger as "12/26 Ramesh Kumar (Medicine)".
   - **Excluded — collect later:** nothing is collected yet. The charge reads *"Excluded — collect ₹9,000 from the patient"* until someone uses **Collect now** (Q-87).
   - **Included:** nothing extra is collected; the regular payments already cover it.
   - A charge saved without an answer (an older client, or the API) keeps **no status** and asks nothing; it can be decided at any time from the Charges tab (Q-87).
6. **Which charges:**
   - **Lab** = the catalogue's new **Lab** category (the "Lab Test" item moved there).
   - **Medicine** = the **Pharmacy** category ("Medication").
   - The amount is typed on the charge; no SmartPharma360 bill is used (Q-62, Q-63).
7. **Every payment carries a label:** Advance · Regular · Discharge · Misc (the desk picks) · Lab · Medicine · Registration (set by the app). It shows as "12/26 Ramesh Kumar (Advance)" (point 5).

**Worked example** (one stay)

| Entry | Amount | Paid by the patient | Hospital expense | In the Ledger |
|---|--:|--:|--:|---|
| Room ₹20,000 + procedures ₹9,900 (charges) | 29,900 | — | — | — *(internal)* |
| Registration fee, collected | 100 | 100 | — | IN · "12/26 Ramesh Kumar (Registration)" |
| Advance | 10,000 | 10,000 | — | IN · "… (Advance)" |
| Regular payment | 15,000 | 15,000 | — | IN · "… (Regular)" |
| Medicine ₹9,000, **Excluded** (default): collected now | 9,000 | 9,000 *(separate payment)* | — *(passed on to the pharmacy)* | IN · "… (Medicine)", note "Medicine — Medication (collected separately)" |
| Lab ₹3,000, **Included**: covered by the payments above | 3,000 | — | — *(income, Q-83)* | — |
| Discharge payment | 5,000 | 5,000 | — | IN · "… (Discharge)" |
| Doctor fees (Dr Rao) | 6,000 | — | 6,000 | OUT when paid |
| Referral commission | 2,000 | — | 2,000 | OUT when paid |
| **Stay totals** | | **Total bill 39,100** | **Expenses 8,000** | |

```
Total bill       39,100
− passed on       9,000   (the Medicine payment, collected for the pharmacy)
= hospital income 30,100
− expenses         8,000  (doctor fees 6,000 + commission 2,000)
= Net             22,100  (admin only)
```

**What was built** (branch `feature/v2-patient-money`, on top of `feature/v2-registration-fee-payments`)

| Part | Where |
|---|---|
| Migration: payment labels (existing payments become Regular); Lab catalogue category ("Lab Test" moved there); `patient_charges.lab_medicine_status` (included / to_collect / collected) with `collected_installment_id`; the ₹20,000 base package turned into a "Package (legacy)" charge line; totals recomputed as charges only | `supabase/migrations/20260923000001_patient_money.sql` |
| Labels: Regular · Advance · Discharge · Misc picked by the desk (default Regular, changeable later); Lab · Medicine · Registration set by the app and fixed; the ledger reads "12/26 Ramesh Kumar (Advance)" | `lib/billing/payment-labels.ts`, `lib/billing/payments.ts`, installments API, Payments tab, the ledger's "Add Patient Installment" |
| Saving a lab/medicine charge asks: **Excluded — collect now** (default, with the mode and UPI reference) · **Excluded — collect later** · **Included in the patient's payments** | `components/patients/charge-entry-modal.tsx`, `app/api/patients/[id]/charges/route.ts`, `lib/billing/lab-medicine.ts` |
| **Excluded:** one payment tagged Lab/Medicine for the charge, with a ledger IN and an automatic note. If the payment is refused, the charge is removed too | same |
| Charges tab: "Excluded — collect ₹x from the patient" / "Included in payments" / "Collected · payment #N", with **Collect now**, **Included** and **Collect separately** actions — offered on charges with no status too, so older rows can be decided (Q-87) | `components/patients/charges-tab.tsx`, `…/charges/[chargeId]/lab-medicine` |
| A collected charge keeps its amount and can't be deleted until its payment is deleted, which puts it back to "To collect". A lab/medicine payment's amount comes from its charge | charges and installments routes |
| Forwarded quotes bring lab/medicine lines in as "To collect" | `app/api/charge-sheets/[id]/forward/route.ts` |
| Charges internal: no Base Charge, Total Charges or Balance on the Billing tab (now Services used · Doctor fees · Referral commission · Total bill), with paise; the "Referral & Commission" dialog without package fields; Finances without Pending receivables; the patient PDF shows services used and payments (with labels) only (Q-35) | `components/patients/billing-settlement-tab.tsx`, `set-charges-modal.tsx`, `app/api/finances/summary/route.ts`, `app/finances/page.tsx`, `lib/pdf/patient-pdf.ts`, `lib/recalculate-billing.ts` |
| Tests | `tests/api/billing/lab-medicine.test.ts` (23), `tests/api/billing/patient-overview.test.ts` (11), updated billing, installments, finances, recalculate and pdf tests |

**Answered on 2026-09-23** (round 3, §9.1) — nothing is open:
- **Q-82** = A: separately collected lab/medicine money is **passed on**, not the hospital's income.
- **Q-83:** an **Included** amount is **hospital income, not an expense**, kept for the logs. No lab/pharmacy payout list is tracked (this supersedes the "as proposed" on Q-61).
- **Q-84:** the pharmacy bill can still be attached, as a **record only** for a patient who wants the full bill; it touches no finance figure. The 2 bills already attached are left as they are.
- **Q-85 / Q-86:** as proposed (X-Ray, CT and MRI stay the hospital's own; forwarded lines arrive "To collect").
- **Q-87:** a third answer, **Excluded — collect later**, with the line "collect ₹x from the patient"; charges with no status ask nothing and can be decided later.
- **Q-78, Q-79, Q-80:** as built.

**Acceptance criteria**
- [x] AC-15.1 Only lab and medicine charges ask, when saved, and the default is Excluded.
- [x] AC-15.2 Excluded → one payment tagged Lab/Medicine, with an automatic note, in Payments and the Ledger. Included → nothing collected.
- [x] AC-15.3 No finance figure reads charges, and no balance or due appears (Billing tab, Finances, patient PDF).
- [x] AC-15.4 Every payment carries a label, and the Ledger reads "<patient ID> <name> (<label>)".
- [x] AC-15.5 No base charge or package flag remains; the legacy ₹20,000 becomes a charge line.
- [x] AC-15.6 Doctor fees and the referral commission appear as the patient's expenses, with Net, in CR-16. An included lab/medicine amount is income, not an expense (Q-83).
- [x] AC-15.8 A lab/medicine charge can be left "collect later" and collected from the Charges tab afterwards (Q-87).
- [ ] AC-15.7 Checked on production after deploy (§8.4).

### CR-16 — Patient Overview (dashboard) (Req 12)
**Priority** P1 · **Status** 🟡 built on `feature/v2-patient-money`, not deployed (§8.4)

> *"in patient details make a dashboard like view which gonna show all the stats and numbers regarding the patient"*

**Today:** the numbers are spread over the Billing & Settlement tab (8 cards including base charge and a Balance, with money cut off by `parseInt`, G-19), plus the Payments and Charges totals. No single place shows income against expenses, the payout status, or which lab and medicine charges were included.

**Contents** (Q-66: as proposed)
1. **Stay header:**
   - patient ID, name, age/sex and status
   - joined date and days in hospital, or the discharge date
   - referral person
   - a stay picker (CR-17)
2. **Money:**
   - the **total bill**, broken down by label (Registration, Advance, Regular, Discharge, Lab, Medicine, Misc)
   - **collected for lab / pharmacy** — passed on, so not the hospital's (Q-82)
   - **expenses:** doctor fees by doctor and the referral commission, each marked paid or pending, counted as soon as they're priced (Q-81c)
   - **Net** = (total bill − passed on) − expenses, **admin only** (Q-66)
   - the registration fee status (collected / not collected / waived)
3. **Lab & medicine:** each charge with what was decided — Included in payments · To collect · Collected — and the four totals.
4. **Services used (internal):** charges by category, with their total, marked "for reference, not billed".
5. **Activity:** counts and last dates for visits, charges, lab orders, pharmacy bills and payments, plus the case sheet status.

- [D] Amounts show paise everywhere (Q-50).
- [D] A new first tab, **Overview**. Billing & Settlement keeps the pricing and payout actions and has dropped its Base Charge, Total Charges and Balance cards (CR-15). Data comes from `GET /api/patients/[id]/overview?billing_id=`.

**What was built**

| Part | Where |
|---|---|
| `GET /api/patients/[id]/overview?billing_id=` — the stay (dates, days, referral, registration fee status), the money block, lab & medicine by status, services used by category, the doctor fee rows and the activity counts. Net is `null` for anyone but an admin | `app/api/patients/[id]/overview/route.ts` |
| The **Overview** tab, now the first tab and the one a patient opens on; it refetches live on payments, charges and settlements | `components/patients/overview-tab.tsx`, `app/patients/[id]/page.tsx` |
| Tests: the worked example end to end (total bill 39,100 · passed on 9,000 · income 30,100 · expenses 8,000 · **Net 22,100**), an included amount staying out of the expenses, paid vs pending fees, Net hidden from reception, lab/medicine grouping, services by category, and the activity counts | `tests/api/billing/patient-overview.test.ts` (11) |

**Acceptance criteria**
- [x] AC-16.1 Opening a patient lands on Overview, showing the current stay's bill, expenses and net from CR-15.
- [x] AC-16.2 The total bill equals the Payments tab total to the paisa, and the expenses equal the doctor fee rows + the referral commission (an included lab/medicine amount is income, Q-83).
- [x] AC-16.3 Reception sees everything except Net (Q-66).
- [ ] AC-16.4 Switching stays (CR-17) switches every figure — CR-17 is dropped for now, and `?billing_id=` is already accepted.
- [ ] AC-16.5 Checked on production after deploy (§8.4).

### CR-17 — A new bill for each stay (Q-54)
**Status** ❌ dropped for now. Q-74: *"Consider it as new patient admission for now"*: a returning patient is registered again, and the registration fee is offered as for anyone new.

**Decided:** Q-54 = a new bill for each stay.

**Today:** a patient can already hold several bills, and every screen uses the newest (`billings[0]`); no live patient has more than one. Nothing creates a second bill on readmission. Setting a Discharged patient back to Active reuses the same bill.

**Target**
- [D] Each stay has its own bill, and earlier stays stay viewable.
- [Q-74] How a readmission starts, and whether the registration fee is offered again (Q-41 said "at registration now, readmission once each stay has its own bill").
- [P] A readmission creates a new `patient_billing` (joined date = readmission date), and the patient goes back to Active. Screens show the open stay by default, with a stay picker. Each stay has its own payments, expenses, lab/medicine ticks and registration fee status.

**Acceptance criteria**
- [ ] AC-17.1 Readmitting a discharged patient opens a new, empty bill. The old bill's charges, payments and totals are unchanged and still viewable.
- [ ] AC-17.2 Charges and payments recorded after readmission go to the new bill.
- [ ] AC-17.3 ⛔ Q-74: the registration fee on readmission.

---
## 5. Gap analysis — payments & charges

First checked against the code at `5f07acf` (2026-09-21), then against the live database (read-only, 2026-09-22). The **Fixed by** column shows 🟡 where the fix is built on the branch and waiting to deploy.

### 5.1 Gaps in the payment and charge flow

**A. Payments and the ledger**

| ID | Sev | What happens | Evidence | Fixed by |
|---|:-:|---|---|---|
| G-01 | 🔴 | Change a payment from ₹5,000 to ₹500 and the bill's "Paid" drops, but the ledger still shows ₹5,000 IN. Delete a payment and its ledger IN stays. | `installments/[installmentId]/route.ts` · BUGS #21 | 🟡 CR-12 |
| G-02 | 🔴 | The ledger screen can edit or delete a payment's IN row by itself. Deleting it clears the payment's link, so the payment still counts as paid and has no ledger row. | `ledger/transactions/[id]/route.ts` · `20260918000001_installment_ledger_link.sql` | 🟡 CR-12 |
| G-03 | 🟠 | A *verified* ledger row stays editable by its creator until its day is closed, while the payment behind it is locked. | `ledger/transactions/[id]/route.ts` | CR-06 (one Closed lock) |
| G-04 | 🟠 | The payment is saved and counted before its ledger entry is validated, so a rejected ledger write leaves a payment behind and a retry credits the patient twice. Payouts follow the same pattern (fees are marked paid before the ledger write). | `installments/route.ts` · `finances/doctor-settlements/route.ts:226→251` · `referral-commissions/route.ts:220→237` | 🟡 CR-12 (payments) · CR-13 (payouts) |
| G-05 | 🟡 | Zero or negative payment amounts are accepted, and overpayment isn't checked at all. | BUGS #19 | 🟡 CR-12 (zero/negative) · overpayment is moot: there's no balance (CR-15) |
| G-06 | 🟡 | The payment's bill is never checked against the patient in the URL. | `installments/route.ts` | 🟡 CR-12 |
| G-07 | 🟡 | "Create ledger entry" is on no screen, but the API accepted false. | payment forms | 🟡 CR-12 |
| G-08 | 🟠 | Any signed-in role could take payments. Anyone signed in can create a billing row, and the referral API needs no login at all. | `installments/route.ts` · `patients/[id]/billing/route.ts:71` · BUGS #49 | 🟡 CR-12 (payments) · CR-01 (the rest) |

**B. Payouts (doctor fees, referral commission)**

| ID | Sev | What happens | Evidence | Fixed by |
|---|:-:|---|---|---|
| G-09 | 🔴 | A payout can be made from two places, and paying from the patient tab writes no ledger OUT. | `doctor-settlements/[settlementId]` PUT vs `finances/doctor-settlements` | CR-13 |
| G-10 | 🟠 | Un-paying or re-pricing a paid fee keeps its ledger OUT, so paying again books a second OUT. | `doctor-settlements/[settlementId]/route.ts:78-86` | CR-13 |
| G-11 | 🟠 | Paying a different amount on the patient tab leaves the fee total, which the bill uses, unchanged. | `doctor-settlements/[settlementId]/route.ts:159-178` | CR-13 (Q-37 b: the total follows) |
| G-12 | 🟡 | Admin can delete a payout's ledger row while the fee still shows as paid. | ledger DELETE | CR-13 |

**C. Charges and the bill**

| ID | Sev | What happens | Evidence | Fixed by |
|---|:-:|---|---|---|
| G-13 | 🟠 | "Included in package" drops doctor fees and commission from the hospital's expenses in Finances. | `finances/summary/route.ts:108, 117` | CR-15 (the package goes) · CR-10 (cash basis) |
| G-14 | 🟠 | Doctor fees count only after Sync and pricing (now as the patient's expense, CR-15). | settlements sync | Kept by choice (Q-21 = B) |
| G-15 | 🟠 | Patient charges never lock. | `charges/[chargeId]/route.ts` | CR-01 (lock on discharge, Q-03 = B) |
| G-16 | 🟠 | Reception could change the registration price. | `lib/billing/authz.ts:49` | 🟡 CR-11 (admin-only item) |
| G-17 | 🟡 | Lab orders carry prices that reach no bill. | `lab_orders` | Q-51: data only · see G-33 |
| G-18 | 🟡 | Several bills per patient, and screens use the newest. | `billings[0]` | CR-17 |
| G-19 | 🟡 | The Billing tab cuts off paise with `parseInt`. | `billing-settlement-tab.tsx:558-619` | CR-16 (paise, Q-50) |
| G-20 | 🟡 | The patient billing PDF prints the referral commission and package flags. | `lib/pdf/patient-pdf.ts:112-117` | CR-16 / Q-67 (patient-facing PDF) |
| G-32 | 🟡 | **New.** Pharmacy charges carry no catalogue item (both live ones). They can only be recognised through `pharmacy_bills.patient_charge_id`, which CR-15 needs to separate pharmacy from hospital charges. | live data | CR-15 / Q-63 |
| G-33 | 🟠 | **New.** Lab money is in two places: prices on lab orders (8 orders, ₹3,040 net, never billed) and Diagnostics charges (Lab Test, X-Ray, CT, MRI). CR-15 needs exactly one lab amount. | live data | CR-15 / Q-62 |

**D. Locks and review**

| ID | Sev | What happens | Fixed by |
|---|:-:|---|---|
| G-21 | 🟠 | Three overlapping "done" steps: Verify, Shift settle and Day close. | CR-06, CR-08 |
| G-22 | 🟡 | People can verify their own entries (BUGS #33). | CR-06 (admin-only close; Verify goes) |
| G-23 | 🟡 | Reopening a day doesn't recompute later days. | CR-08 (moot) |
| G-24 | 🟡 | Doctor sees Finances and Admin Panel but is redirected away. | CR-01 (Q-06) |

**E. Finance numbers**

| ID | Sev | What happens | Evidence | Fixed by |
|---|:-:|---|---|---|
| G-25 | 🔴 | Profit subtracts cash *and* accrued costs from cash income, and OPD isn't counted as income. | `finances/summary/route.ts:176-177` | CR-10 (Q-36 cash basis) |
| G-26 | 🟠 | **Confirmed in live data: 8 of 11 bills have no `month_year`**, so Finances never counted them. Bills made at registration were inserted without it. | `patients/route.ts` | 🟡 code fix + backfill migration `20260922000002` |
| G-27 | 🟠 | Salary, advances and general expenses bypass the ledger, and a petty-cash advance could be counted twice. | `finances/summary/route.ts:155-159` | CR-10 (Q-36: advances once, inside salary) |
| G-28 | 🟡 | General expenses record no author. | `expenses` table | CR-07 |
| G-29 | 🟡 | Finances → Transactions doesn't refresh when new ledger rows arrive. | `app/finances/page.tsx:117-143` | CR-08 (the tab goes) |

**F. Dates and plumbing**

| ID | Sev | What happens | Fixed by |
|---|:-:|---|---|
| G-30 | 🟠 | "Today" meant the UTC date, so anything done between 00:00 and 05:29 IST landed on the previous day. | 🟡 CR-14 |
| G-31 | 🟡 | Hand-rolled token refresh in every ledger/finance route, no pagination, and overlapping screens. | CR-05, CR-08 |

### 5.2 Conflicts between the requirements and the code: resolved

| ID | Conflict | Resolved by |
|---|---|---|
| X-01 | Rule 1 vs reception editing shared records | Q-01 = B (shared records stay editable) |
| X-02 | Charges and petty cash have no status | Q-03 = B (charges lock on discharge) · Q-12 = A (petty cash never locks) |
| X-03 | "Admin does everything" vs day close locking admin | Q-04 = B (admin reopens with a reason) |
| X-04 | "Which user gave the advance" vs free-text Given by | Q-15 = A (the logged-in user) |
| X-05 | Reception advances removed in `b43254e` | Brought back (CR-03) |
| X-06 | The cap message leaked the salary | Q-16 = A (generic message) |
| X-07 | Petty cash vs patient cash, one drawer today | Q-08 = yes (kept apart) |
| X-08 | "Registration catalogue" doesn't exist | Q-40 = A (the flagged Registration item) · 🟡 built |
| X-09 | "Admitted or created" | Q-41 = A (at registration) · readmission: Q-74 |
| X-10 | UPI reference rule | Q-44 = A · 🟡 built |
| X-11 | Req 9 "total = payments" vs the bill total from charges | The clarification: total bill = payments; charges internal (CR-15; Q-64 = C) |
| X-12 | Fee schedule save overwrites `created_by` | Q-20 = A, engineering fix in CR-04 |
| X-13 | Advances can't be edited | Q-17 = A |
| X-14 | Admin adds ledger expenses today | Q-07: admin expenses become general expenses only |
| X-15 | The BUGS #36 decision about day close | Moot with CR-08 |
| X-16 | **New.** Q-51 says the lab stores data only, but req 12 treats lab amounts as included or separate | Q-62 |
| X-17 | **New.** Q-30 "Drop" vs the Q-31/32/33 answers, which assume the package is removed | Package removed (clarification point 1; Q-68 closed) |
| X-18 | **New.** Q-19 lets reception pay doctors and referrers, but Q-08/Q-13 keep patient cash out of petty cash and limit petty cash to expenses and advances. Which money pays them? | Q-71 |
| X-19 | **New (clarification).** Q-31 = C (show a balance) vs "charges are for internal knowledge; total bill = payments" | Superseded: no balance (CR-15; Q-64 = C) |
| X-20 | **New (clarification).** Today doctor fees are added to what the patient owes; now they're only an expense paid from the patient's money | CR-15 |
| X-21 | **New (clarification).** "If included it will add as the payments": if that money is already inside an earlier payment, adding a payment counts it twice | Resolved: the meaning was the other way round. *Excluded* = new money collected now as its own payment; *Included* = inside the regular payments, so nothing is added |
| X-22 | **New (clarification).** Point 5 speaks of labels for "patient charges", but the labels (advance, regular payments, discharge) are payment types | Built as payment labels; confirm in Q-80 |

### 5.3 Status of the baseline PRD's finance issues (F-01 … F-19)

| F | Topic | Now |
|---|---|---|
| F-01, F-02, F-13 | Two payout paths; payout rows can be deleted | CR-13 (Q-37 = B) |
| F-03 | Money out that bypasses the ledger | Desk spending → petty cash (CR-02); admin expenses → general (CR-07); salary and admin advances stay in Employees (§3.3); Overview counts them (Q-36) |
| F-04 | Profit mixes cash and accrual | CR-10 (Q-36 cash basis) |
| F-05 | Package flags hide payouts | CR-15 (the package goes) |
| F-06 | Payment and ledger drift apart | 🟡 CR-12 |
| F-07 | Lab money isn't billed | Q-51 (lab stores data only) · Q-62 |
| F-08 | Walk-in money lives in three places | OPD stays a ledger IN |
| F-09 | Doctor fee captured late | Kept (Q-21 = B) |
| F-10 | No refunds, discounts or receipts | Q-73 |
| F-11 | Discharge doesn't check money | Not needed (Q-52 = No) |
| F-12 | UTC dates | 🟡 CR-14 |
| F-14 | Verify semantics | CR-06 (Q-24 = A) |
| F-15 | Paise dropped | CR-16 (Q-50 = paise) |
| F-16 | Missing role checks | 🟡 payments · CR-01 for the rest |
| F-17 | Several bills per patient | CR-17 (Q-54 = a new bill per stay) |
| F-18 | Reopen doesn't recompute | Moot (CR-08) |
| F-19 | Receivables by join month | Removed (Q-32 = A) |

### 5.4 Live database checks (read-only, 2026-09-22)

Run against project `bmbbifxkjqmdqriootdw` ("HMS - Production") with `SELECT` statements only. Nothing was written.

| Check | Result | Used by |
|---|---|---|
| `patient_billing.month_year` / `joined_date` default | none | G-26 |
| Bills with no month | **8 of 11** | G-26 → backfill migration |
| Bills with a base package | **1**, ₹20,000 | Q-33 → one "Package (legacy)" line |
| Bills using the package flags | 0 | CR-15 (safe to replace) |
| Registration catalogue items | `REG` Registration, ₹100, active | CR-11 (flagged by the migration) |
| Existing registration charges | 5 (₹1,500) | why `registration_fee_status` stays empty on old bills |
| Ledger rows by status | 18 pending · 14 verified | CR-06 migration (Q-29) |
| Ledger rows by source | patient 15 · OPD 10 · expense 6 · doctor_settlement 1 | CR-02 (old expenses stay), CR-05 |
| Ledger rows on a closed day | 1 | Q-29 → Closed |
| Payments without a ledger row | 1 of 14 | heals on its next edit (CR-12) |
| Patients with more than one bill | 0 | CR-17 starts clean |
| Pharmacy bills / lab orders | 2 (no catalogue item) / 8 (₹3,040 net) | G-32, G-33 |
| Volume | 15 patients · 19 charges · 7 fee rows · 8 advances · 1 general expense | every migration here is small |

### 5.5 Corrections to the baseline `PRD.md`

- **§4, §6.2 (I-1), §6.4:** neither payment form has a "create ledger entry" checkbox. Both always created the entry; on the branch it's always written.
- **§6.5:** manual rows, merging and `/api/doctor-settlements/settle` exist only in the API. The patient tab pays through `PUT /api/doctor-settlements/[id]`.
- **§6.11:** bills made at registration had no month at all (G-26, confirmed).
- **§6.12:** a verified ledger row stays editable while its payment is locked (G-03).
- **§2.4:** reception had advances from 2026-08-03 to 2026-09-17.
- **`BUGS.md` #13** is stale (`/api/patients/active` filters on `status = 'Active'`).

---

## 6. Happy path — registration → charges → payment → close

This is the target after v2, using the money model settled on 2026-09-22/23 (CR-15). 🟡 marks a step built on the branch. Nothing here waits on a question.

```
 RECEPTION (desk)                          WHAT GETS WRITTEN                                           ADMIN
 ════════════════                          ═════════════════                                           ═════
 ① Register patient 🟡
    fee pre-filled, ☑ Collected ─────────► patient · bill · charge "Registration"   (internal)
                                            payment (Registration) + ledger IN   OPEN
                                            "12/26 Ramesh Kumar (Registration)"                  🟡 (Q-80 confirm)
    ☐ left unticked ─────────────────────► charge only · Payments tab: "not collected" · [Collect now]
      │
 ② Record visits and charges ────────────► visits · charges = services used      (internal, no money meaning)
    Sync · price doctor fees ────────────► fee rows   = the patient's EXPENSE (paid from the patient's money)
    set referral commission ─────────────► commission = the patient's EXPENSE
      │
 ③ Medicine / lab charge 🟡 ─────────────► charge; on Save the app asks (alert), default EXCLUDED
      Excluded: collect now ─────────────► separate payment tagged Medicine / Lab + ledger IN   OPEN
                                            "12/26 Ramesh Kumar (Medicine)", note automatic         🟡
                                            the money is PASSED ON to the lab / pharmacy      (Q-82)
      Excluded: collect later ──────────►  nothing collected yet: "collect ₹x from the patient" (Q-87)
      Included in payments ──────────────► nothing collected: the regular payments cover it,
                                            and that money is the hospital's INCOME            (Q-83)
      │
 ④ Take payments as admin says ──────────► payment (Advance / Regular / Discharge / Misc) + ledger IN   OPEN
    ("take ₹X now"; nothing pre-decided)    "12/26 Ramesh Kumar (Advance)"                         🟡
      │     Overview tab: total bill · passed on · expenses · Net · services used (internal)  (CR-16) 🟡
      │
 ⑤ Desk spending ────────────────────────► petty cash OUT only                        ◄── ⑥ Top up petty cash
      │
 ⑦ ═══════════ CLOSE POINT ═══════════     Ledger ▸ "Not closed"                        ◄── admin ticks rows,
                                            OPEN ──► CLOSED (by, when, batch note)            sees the cash / UPI total
                                            🔒 payments lock, and so do their charges' ticks  ▸ "Mark closed"
      │
 ⑧ Pay doctor fee / referral ────────────► ledger OUT · payout marked paid 🔒         ◄── or admin pays:
    (from the day's collections, Q-71)      reception's payout: OPEN → closed at ⑦          born CLOSED
      │
 ⑨ Discharge (case sheet final) ─────────► status Discharged · charges lock for reception (Q-03 = B)
```

**Entry register: who creates what, and when it locks**

| Step | Entry | Created by | Table(s) | Money meaning | Closed by admin at | Reception can edit its own until |
|:-:|---|---|---|---|:-:|---|
| ① | Patient + bill | Reception | `patients`, `patient_billing` | — | — | never locks (shared record) |
| ① | Registration charge | Reception | `patient_charges` | none (internal) | — | the patient is Discharged |
| ① | Registration payment + ledger IN 🟡 | Reception | installments + ledger | income | ⑦ | ⑦ |
| ② | Doctor visit | Reception | `patient_consultations` | — | — | its fee is paid |
| ② | Doctor fee price / referral commission | Reception or Admin | fee rows / `patient_billing` | expense | — | paid (⑧) |
| ② | Other charges | Reception | `patient_charges` | none (internal) | — | the patient is Discharged |
| ③ | Lab / medicine charge (included / excluded) 🟡 | Reception | `patient_charges` | none (internal); included = income (Q-83) | — | collected: fixed until its payment is deleted |
| ③ | Lab/Medicine payment (excluded, collected now) + ledger IN 🟡 | Reception | installments + ledger | total bill, then passed on (Q-82) | ⑦ | ⑦ (amount comes from the charge) |
| ④ | Payment + ledger IN 🟡 | Reception | installments + ledger | income | ⑦ | ⑦ |
| ⑤ | Desk expense / advance | Reception | petty cash (+ `advances`) | hospital spending | never | any time / month settled |
| ⑥ | Top-up | Admin | petty cash | internal transfer | — | never (admin's) |
| ⑧ | Payout by reception | Reception | ledger OUT + fee row | expense paid | ⑦ | ⑦ |
| ⑧ | Payout by admin | Admin | ledger OUT + fee row | expense paid | born Closed | never (admin's) |

---

## 7. Screens & navigation

**[D]** Q-38 = A.

| Menu | Admin | Reception | Notes |
|---|:-:|:-:|---|
| Patients → patient record | ✅ | ✅ | 🟡 New first tab, **Overview** (CR-16), the one a patient opens on; the registration fee block on Add Patient 🟡 |
| Doctors · Charges · Lab | ✅ | ✅ | Pricing and payouts open to reception (CR-04); the registration fee item is admin-only 🟡 |
| **Ledger**, with tabs All · Not closed | ✅ plus bulk close / reopen | ✅ reads all, edits own | Replaces Daily Ledger → Daily Summary (CR-05, CR-06) |
| **Petty cash** | ✅ plus top-up | ✅ plus expense | New (CR-02) |
| **Employee Advance** | via Employees | ✅ | New for reception (CR-03) |
| Employees → Details · Salary · Advance Log | ✅ | — | Advance Log shows "Given by (user)" |
| **Finances**: Overview · Expenses · Settlements | ✅ | — | Transactions and Day Close tabs removed |
| Admin Panel | ✅ | — | Unchanged |

**Removed:** the Daily Summary day view, Employee Shift Schedule, Finances → Transactions, Finances → Day Close, the open-days banner, and the `/daily-ledger/*` stubs.

---

## 8. Data, API & deployment

Everything not marked 🟡 is **[P]**.

### 8.1 Tables

| Change | For | State |
|---|---|:-:|
| `charge_items.is_registration_fee` (one row only; `REG` flagged) | CR-11 | 🟡 |
| `patient_billing_installments.kind` (`payment` / `registration`; one registration per bill) | CR-11 | 🟡 |
| `patient_billing.registration_fee_status` (pending / collected / waived; empty on older bills) | CR-11 | 🟡 |
| Ledger source `registration` added to `dlt_source_check` | CR-11 | 🟡 |
| `patient_billing.joined_date` / `month_year` filled on the 8 bills that lack them | G-26 | 🟡 |
| `daily_ledger_transactions.status`: `pending/verified` → `open/closed`, plus `closed_at`, `closed_by`, `close_batch_id`; new `ledger_close_batches` (note, amount received) | CR-06 | |
| New `petty_cash_entries`: date, direction, amount, mode, reason, given_to, kind (topup / expense / advance), advance link, created_by, updated_by (+ history table if Q-70) | CR-02 | |
| `advances`: `petty_cash_entry_id`; "given by" = `created_by` user | CR-03 | |
| `expenses`: `created_by`, `updated_by`, `payment_mode` | CR-07 | |
| `doctor_visit_settlements.amount_set_by`, `patient_billing.referral_commission_set_by`, and a link from each payout to its ledger row | CR-04, CR-13 | |
| 🟡 `patient_charges.lab_medicine_status` (included / to_collect / collected) + `collected_installment_id`; installment `kind` becomes the payment label (regular / advance / discharge / misc / lab / medicine / registration; old rows → regular); a **Lab** catalogue category; the base package turned into a charge line and its flags cleared; `total_charges` = charges only | CR-15 | 🟡 |
| `daily_ledger_closures`, `daily_ledger_shift_settlements`: frozen, read-only | CR-08 | |

### 8.2 APIs

| New or changed | Removed |
|---|---|
| 🟡 `GET /api/registration-fee` | `GET /api/ledger/daily-summary/[date]` |
| 🟡 `POST /api/patients` takes a `registration_fee` block | `POST /api/ledger/close-day`, `POST /reopen-day`, `GET /open-days` |
| 🟡 `/api/patients/[id]/installments` (+`[id]`): validated first, always with its ledger entry, kept in sync, `kind`, `payment:write` | `GET /api/ledger/employee-shift-summary` |
| 🟡 `/api/ledger/transactions/[id]` refuses payment entries (409 `LEDGER_ENTRY_IS_PAYMENT`) | `/api/ledger/shift-settlements` (and `[id]`) |
| `GET /api/ledger/entries` · `POST /api/ledger/close` · `POST /api/ledger/reopen` | The Finances Transactions fetch |
| `GET/POST /api/petty-cash` · `PUT/DELETE /api/petty-cash/[id]` | |
| Reception-safe employee list and advance routes | |
| 🟡 `GET /api/patients/[id]/overview?billing_id=` — the stay, the money (total bill by label, passed on, hospital income, expenses, net for an admin), lab & medicine by status, services used, activity | |
| 🟡 Charges API takes `lab_medicine: { choice, payment_method, transaction_reference }` · 🟡 `POST …/charges/[chargeId]/lab-medicine` (collect / include / to_collect) · 🟡 installments take `kind` (the label) | |

### 8.3 Data migration still to write

1. Ledger statuses become open/closed per Q-29 (CR-06).
2. The petty cash opening balance (Q-14, CR-02).
3. *(Later)* Drop the retired `base_charge` and package-flag columns once nothing reads them.

Already written: the legacy package line and the payment labels (`20260923000001`, 🟡).

### 8.4 Deploying what's built (CR-11, CR-12, CR-14, CR-15, CR-16)

Two branches, the second stacked on the first:
- `feature/v2-registration-fee-payments`: CR-11, CR-12, CR-14.
- `feature/v2-patient-money`: CR-15 and CR-16 (the Overview needs no migration of its own).

Order matters: the new code writes columns that exist only after the migrations.

> **✅ Step 2 is done. The three migrations were applied to production `bmbbifxkjqmdqriootdw` on 2026-09-23**, with the client's go-ahead ("the app is still in development phase"). Verified straight after: 11 bills all have a month and a join date (8 had neither) · the 14 existing payments are labelled Regular, ₹1,36,000 unchanged · no `base_charge` or package flag is left, and the ₹20,000 became a "Package (legacy)" charge line · every bill's `patient_charges_total` and `total_charges` equal its charges exactly (20 lines, ₹55,913) · REG is flagged as the registration fee, LAB moved to the Lab category · no charge carries a lab/medicine status yet, which is what Q-87 asks for. No new database advisory.
>
> **The app code is not deployed yet** — both branches are local. Until it is, production runs the old code on the new schema (safe: every new column is nullable or defaulted), but the old screens will show the ₹20,000 package as a charge line rather than a base charge, and Finances will start counting the 8 back-filled bills.

1. Review and merge `feature/v2-registration-fee-payments`, then `feature/v2-patient-money`, or merge only the second, which contains both.
2. ~~Apply, in order, to production~~ **(done 2026-09-23)**:
   1. `20260922000001_registration_fee.sql`: 3 columns, 2 partial unique indexes, 2 CHECK constraints, and the ledger source list.
   2. `20260922000002_billing_month_backfill.sql`: fills the month on 8 bills. **Expect the Finances Overview for those months to change.**
   3. `20260923000001_patient_money.sql`: the payment labels (existing payments become Regular), the Lab category ("Lab Test" moves there), the lab/medicine status on charges, the ₹20,000 base package turned into a charge line, and bill totals recomputed as charges only.

   All tables involved are small.
3. Deploy the app.
4. Smoke test on production:
   1. Register a test patient with the fee ☑ Collected, Cash. Check that payment #1 reads "Registration" and the Daily Ledger reads "… (Registration)", with no Edit/Delete.
   2. Record an Advance payment, and check the ledger reads "… (Advance)".
   3. Add a Medicine charge with **Collect separately now**, Cash. Check for a Medicine payment in Payments and the Ledger, and that the charge shows "Collected · payment #N".
   4. Add a Lab charge marked **Included**. Check that nothing is collected and the charge shows "Included in payments".
   5. Add a second Lab charge marked **Excluded — collect later**, check it reads "collect ₹x from the patient", then **Collect now**.
   6. Check the Billing tab shows no Balance, Base Charge or Total Charges.
   7. On the **Overview** tab: the total bill matches the Payments tab, the Medicine money shows as collected for the pharmacy, and Net appears for an admin but not for a receptionist.
   8. Delete the test patients.
5. Tell the desk:
   - Payments are changed from the patient's Payments tab, not the Daily Ledger.
   - The registration fee price is admin-only.
   - A failed payment saves nothing, so it's safe to retry.
   - Every payment now has a "Payment for" label.
   - A lab or medicine charge asks, when saved, whether it's collected now, collected later, or already included.
   - A patient now opens on an **Overview** tab with the whole stay on one screen.

---
## 9. Open questions

**Nothing is open** as of 2026-09-23: rounds 1, 2 and 3 are all answered. New questions go in [`docs/OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md).

This section keeps the **answer log**: round 3 (§9.1), round 2 (§9.2), the questions closed by your clarification (§9.3), and round 1 (§9.4).

### 9.1 Round 3 — answers received 2026-09-23

| Q | Question (short) | Answer | Recorded in |
|---|---|---|---|
| Q-67 | The patient's billing PDF | "Yes": services used and the labelled payments, with no balance, doctor fees or commission | CR-15 (built) |
| Q-78 | Payment modes for collecting lab/medicine | As proposed: all modes (UPI needs a reference), dated today | CR-15 (built) |
| Q-79 | Changing a lab/medicine charge later | As proposed: switchable while To collect or Included; a Collected one is locked until its payment is deleted | CR-15 (built) |
| Q-80 | Payment labels | As proposed: Advance · Regular · Discharge · Misc at the desk, Lab · Medicine · Registration set by the app; labels are on payments | CR-15 (built) |
| Q-81 | Unpaid doctor fees and commission | As proposed: (a) paying writes a ledger OUT, (b) the Expenses tab lists the unpaid ones per patient and "money out" counts only paid ones, (c) a patient's figures count them as soon as they're priced | CR-10, CR-13, CR-16 |
| Q-82 ★ | Whose money is a separately collected lab/medicine amount | As proposed = **A**: passed on to the lab or pharmacy, so not the hospital's income | CR-15, CR-16 (built) |
| Q-83 ★ | Paying the lab or pharmacy | *"Included lab or medicine amount is hospital income; we add this only for the logs and to know the patient while seeing the charges."* → an **Included** amount is **income, not an expense**, and no payout list is kept. This supersedes the "as proposed" on Q-61 | CR-15, CR-16 (built) |
| Q-84 | SmartPharma360 attach | *"If the patient needs a full bill, attach it in the charges with the medicine details, but it has nothing to do with the finance part; pharma/medicine is a different entity"* → the button stays as a **record only**; the 2 bills already attached are left as they are | CR-15 |
| Q-85 | X-Ray, CT, MRI | As proposed: the hospital's own, staying in Diagnostics, asking nothing | CR-15 (built) |
| Q-86 | Forwarded quotes with lab/medicine lines | As proposed: they arrive "To collect" | CR-15 (built) |
| Q-87 | Older lab/medicine charges, and the wording at save | *"Keep it excluded by default and on saving put a line 'marked excluded from the payment, collect ₹x from the patient', or mark it no status and later you can change"* → a third answer, **Excluded — collect later**, and charges with no status ask nothing and can be decided at any time | CR-15 (built) |

Three points were checked back with you the same day, because the answers could be read two ways:

| Asked | Your answer | Effect |
|---|---|---|
| Is an Included lab/medicine amount income or an expense? (Q-61 vs Q-83) | **Income, not an expense** | The worked example's Net is ₹22,100, not ₹19,100. No lab/pharmacy payout is tracked |
| Should "collect later" be a third answer at save? (Q-87) | **Yes, add it** | Three radio choices, and the charge reads "collect ₹x from the patient" |
| What happens to the pharmacy bill attach button? (Q-84) | **Record only, as built** | It stays, attaches medicine details to the charges, and touches no finance figure |

### 9.2 Round 2 — answers received 2026-09-22

| Q | Question (short) | Answer | Recorded in |
|---|---|---|---|
| Q-57 | Confirm the model | As proposed; the include/exclude meaning was then corrected by you (CR-15) | CR-15 |
| Q-58 | Set per stay or per charge | As proposed: per **charge**, and only lab and medicine | CR-15 |
| Q-59 | Default before deciding | "Mark it as **excluded** by default and ask at the time of save as an alert" | CR-15 (built) |
| Q-60 | Who collects | "All the amount comes by desk"; the desk distributes it | CR-15 |
| Q-61 | Paying the lab/pharmacy for included amounts | As proposed (**A**: pending payouts, ledger OUT when paid) → excluded ones: Q-83 | CR-15 |
| Q-62 | Which charges are lab | Like medicine: a charge with a typed amount, default excluded → the **Lab** category (built); X-Ray/CT/MRI: Q-85 | CR-15 (built) |
| Q-63 | Which charges are medicine | "No SmartPharma bill; place the amount directly" → the **Pharmacy** category (built); the attach button: Q-84 | CR-15 (built) |
| Q-64 | Deals vs charges | **C**: charges have nothing to do with the balance; they're for the patient bill and knowledge | CR-15 (built) |
| Q-65 | Who decides | As proposed: admin and any receptionist | CR-15 (built) |
| Q-66 | Overview contents | As proposed | CR-16 |
| Q-67 | Patient PDF | "Later" → answered in round 3 (§9.1) | CR-15 |
| Q-68 | "Drop" | As proposed: remove the base package | CR-15 (built) |
| Q-69 | Petty cash in the Expenses log | **A**: one automatic line per month, "Petty cash spent" | CR-07, CR-10 |
| Q-70 | Petty cash edit history | As proposed (yes) | CR-02 |
| Q-71 | Reception payouts' money | As proposed (**A**: from the day's collections, a Ledger OUT born Open) | CR-04, CR-13 |
| Q-72 | Missing screens | As proposed: visit purposes now; manual rows and merge later | CR-04 |
| Q-73 | Refunds / receipts | As proposed: not now | — |
| Q-74 | Readmission | "Consider it as new patient admission for now" → register them again; CR-17 dropped for now | CR-17 |
| Q-75 | Overview scope | As proposed: one stay at a time | CR-16 |
| Q-76 | Priorities | As proposed: CR-15 and CR-16 at P1; CR-17 at P2 (now dropped) | §2 |
| Q-77 | Confirm the model (asked after the clarification) | Settled by the answers above and your include/exclude explanation | CR-15 |

Q-77 – Q-81 weren't answered individually in round 2. Your round-2 answers and your include/exclude explanation settle Q-77 (the model); Q-78 – Q-81 were answered in round 3 (§9.1).

### 9.3 Closed by your 2026-09-22 clarification

| Q | It asked | Closed by |
|---|---|---|
| Q-57 | Confirm the "included / separate per stay, three switches" reading | Superseded: the model is restated in CR-15 and confirmed by the round-2 answers (§9.1) |
| Q-58 | Set per stay or per item | Per **charge**, and only for **lab and medicine** (point 3) |
| Q-59 | What "not decided" does | Replaced by the save-time question, default Excluded (Q-59 answer) |
| Q-60 | Who collects "separate" amounts | Doctor fees are always paid by the hospital from the patient's money (point 2). Lab and medicine not included: the patient pays directly, and nothing is recorded (point 3) |
| Q-64 | All-inclusive deals vs itemised charges | Obsolete: charges are internal and there's no balance (point 4) |
| Q-65 | Who sets the per-stay switches | Admin and any receptionist (Q-65 answer) |
| Q-68 | What "Drop" meant | Remove the base package; nothing is pre-decided (point 1) |

### 9.4 Round 1 — answers received 2026-09-22

| Q | Question (short) | Answer | Recorded in |
|---|---|---|---|
| Q-01 | Which records the own-row rule covers | **B**: money entries only; shared records editable by any receptionist | §3.2, CR-01 |
| Q-02 | What "closed" means per record | As proposed | §3.2 |
| Q-03 | Should charges lock | As proposed (**B**: when the patient is Discharged) | §3.2, CR-01 |
| Q-04 | Delete = edit; admin and closed entries | As proposed (yes; admin reopens with a reason first) | CR-01, CR-06 |
| Q-05 | What stays hidden from reception | As proposed | §3.2 |
| Q-06 | Other roles | As proposed (no logins for doctor, nurse or lab for now) | §3.2 |
| Q-07 | Desk spending in the ledger? | **A**: petty cash only. Plus "petty cash as a bulk line in Expenses" → Q-69 | §3.3, CR-02, CR-07 |
| Q-08 | Patient cash kept apart from petty cash | Yes | CR-02 |
| Q-09 | Payment modes | As proposed | CR-02, CR-07 |
| Q-10 | Petty cash balance | As proposed (**B**: negative is OK; later top-ups adjust it) | CR-02 |
| Q-11 | Admin petty cash debits | As proposed (**B**) | CR-02 |
| Q-12 | How long petty cash is editable | **A**: always; admin checks the cash in hand → Q-70 | CR-02 |
| Q-13 | Other petty cash debits | As proposed (expenses and advances only) | CR-02 |
| Q-14 | Petty cash starting point | As proposed (**A**: opening balance at go-live) | CR-02 |
| Q-15 | Given by | As proposed (**A**: the logged-in user) | CR-03 |
| Q-16 | Advance cap for reception | As proposed (**A**: generic message) | CR-03 |
| Q-17 | Editing advances | As proposed (**A**) | CR-03 |
| Q-18 | What reception sees on advances | As proposed | CR-03 |
| Q-19 | Reception pricing actions | All of a–h, "can add fees to doctor and mark them paid also" → Q-71, Q-72 | CR-04 |
| Q-20 | Who owns a price | As proposed (**A**: whoever last set it) | CR-04 |
| Q-21 | Fee at visit time | As proposed (**B**: keep Sync) | CR-04 |
| Q-22 | Ledger defaults | As proposed | CR-05 |
| Q-23 | Where the add buttons live | As proposed | CR-05 |
| Q-24 | Closed replaces Verified | As proposed (**A**) | CR-06 |
| Q-25 | Admin-created entries born Closed | As proposed (**A**) | CR-06 |
| Q-26 | Closing filters and selection total | As proposed | CR-06 |
| Q-27 | Note on a bulk close | As proposed (**B**) | CR-06 |
| Q-28 | Reception sees Not closed | As proposed | CR-06 |
| Q-29 | Existing ledger data at go-live | As proposed | CR-06, CR-08 |
| Q-30 | Keep or drop CR-09 | "Drop" = remove the base package (confirmed by the clarification) | CR-09 → CR-15 |
| Q-31 | What the patient section shows | **C**, then superseded by the clarification: no balance; total bill = payments | CR-15 (Q-64 = C) |
| Q-32 | Pending receivables | **A**: remove | CR-10, CR-15 |
| Q-33 | Existing base charges | **A**: a "Package (legacy)" line | CR-15 |
| Q-34 | Doctor fees on the bill | *(blank)*. Covered by the clarification: doctor fees are an expense paid from the patient's money | CR-15 |
| Q-35 | Patient PDF | As proposed, then revisited because charges are internal | Q-67 |
| Q-36 | Overview definitions | As proposed (cash basis) | CR-10 |
| Q-37 | One payout path | As proposed (**B**; the amount paid becomes the fee total) | CR-13 |
| Q-38 | Navigation | As proposed (**A**) | §7 |
| Q-39 | Expense categories | As proposed (**A**): reception adds petty cash expenses only, admin adds general ones, and both must say what it's for | CR-02, CR-07 |
| Q-40 | Where the registration fee is set | As proposed (**A**: the flagged catalogue item, admin only) | CR-11 🟡 |
| Q-41 | When the fee is offered | As proposed (**A**: at registration; readmission later) | CR-11 🟡, Q-74 |
| Q-42 | Fee amount editable | As proposed (**B**: 0 waives it) | CR-11 🟡 |
| Q-43 | Collected default; not collected | As proposed (unticked; "not collected" + Collect now) | CR-11 🟡 |
| Q-44 | UPI reference | As proposed (**A**: required) | CR-11 🟡 |
| Q-45 | Fee also a charge line | **B**: yes, both a charge and a payment | CR-11 🟡 |
| Q-46 | Its own type | As proposed (**B**) | CR-11 🟡 |
| Q-47 | Doctor/Nurse get the fee block | Yes | CR-11 🟡 |
| Q-48 | Payment and ledger as one record | Yes | CR-12 🟡 |
| Q-49 | IST dates | Yes | CR-14 🟡 |
| Q-50 | Paise | Yes | CR-16 |
| Q-51 | Lab money | "Currently not required, as the lab is for storing data only" → see Q-62 | CR-15 |
| Q-52 | Money check at discharge | No | — |
| Q-53 | Refunds, discounts, receipts | *(blank)* → **Q-73** | — |
| Q-54 | Readmission | A new bill → CR-17, Q-74 | CR-17 |
| Q-55 | Lab as a separate app | No | — |
| Q-56 | Priorities and rollout | As proposed | §2 |

The baseline `PRD.md` §10 questions were carried into round 1: Q1 → Q-37 · Q2 → Q-07 · Q3 → Q-36 · Q4 → Q-30 · Q5 → Q-48 · Q6 → Q-51 · Q7 → Q-21 · Q8 → Q-52 · Q9 → Q-53 · Q10 → Q-24 + Q-04 · Q11 → Q-55 · Q12 → Q-05.

---

## 10. Change log

| Date | Change | By |
|---|---|---|
| 2026-09-21 | PRD v2 drafted from client requirements 1–11 and the code at `5f07acf`: 14 CRs, 31 gaps + 15 conflicts, target happy path, 56 open questions | Claude |
| 2026-09-22 | Round-1 answers recorded (§9.2) and every CR updated to them. Requirement 12 added: CR-15 (what the payments cover, which also takes over CR-09) and CR-16 (patient Overview); Q-54 added CR-17 (a new bill per stay). Live database checked read-only (§5.4): G-26 confirmed, plus new gaps G-32, G-33 and conflicts X-16 – X-18. CR-11, CR-12 and CR-14 built on `feature/v2-registration-fee-payments` (`ecc8717`), not deployed. 20 round-2 questions (Q-57 – Q-76) | Claude |
| 2026-09-22 | Requirement 12 **clarified** by the client. CR-15 rewritten: charges are internal; total bill = payments; expenses = doctor fees + referral + included lab/medicine; lab and medicine get an Included tick that adds a payment automatically; payments get labels. CR-16, §3, §6 and §8 updated to match. 7 round-2 questions closed (§9.2), 5 new ones (Q-77 – Q-81); 18 open | Claude |
| 2026-09-22 | Round 2 answered (§9.1). **Include/exclude corrected** to your meaning: Excluded (the default, asked when saving) = collect now as a separate tagged payment; Included = covered by the regular payments. CR-15's core built on `feature/v2-patient-money`: payment labels, lab/medicine collection, charges internal, package removed. CR-17 dropped for now (readmission = new registration). Open questions moved to `docs/OPEN-QUESTIONS.md` (11) | Claude |
| 2026-09-23 | Round 3 answered (§9.1): nothing is open. Separately collected lab/medicine money is **passed on** (Q-82); an **Included** amount is **income, not an expense** (Q-83), so the worked example's Net is ₹22,100; a third answer **Excluded — collect later** added at save (Q-87); the pharmacy bill attach stays as a record only (Q-84). **CR-16 built** on `feature/v2-patient-money`: `GET /api/patients/[id]/overview` and the Overview tab, now the first tab. 59 test files, 1,762 tests pass; typecheck and `next build` clean | Claude |
| 2026-09-23 | **The three migrations applied to production** (`20260922000001`, `20260922000002`, `20260923000001`), with the client's go-ahead, and verified row by row (§8.4). The app code is still on the two feature branches, not deployed | Claude |
