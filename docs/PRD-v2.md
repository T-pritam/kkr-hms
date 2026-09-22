# KKR HMS — PRD v2
### Desk permissions · Petty cash · Ledger log & closing · Registration fee · What the payments cover

| | |
|---|---|
| **Doc type** | Change-set PRD: target behaviour + build tracker. The as-built description of today's app stays in [`PRD.md`](PRD.md) (the baseline). |
| **Baseline code** | `main` @ `5f07acf` (2026-09-17) |
| **Requirements source** | Client requirements 1–11 (2026-09-21) and requirement 12, "what the payments cover" + patient dashboard (2026-09-22). Each is quoted at the top of its CR. |
| **Status** | **Round 1 answered** (2026-09-22): 54 of 56 questions answered; Q-34 is covered by requirement 12, and Q-53 is asked again as Q-73. **Round 2: 20 questions open** (Q-57 – Q-76, §9.1). |
| **Built** | CR-11, CR-12 and CR-14 are built on branch `feature/v2-registration-fee-payments` (commit `ecc8717`). They are **not deployed**, and their two migrations are **not applied** (§8.4). |
| **Last updated** | 2026-09-22 |

## How to use this doc

1. **§2 Tracker** is the progress board: one row per change request (CR). Flip the status as work moves.
2. Every rule in §4 carries a tag:
   - **[D]** decided: from the client's requirement text or an answer in §9.2.
   - **[Q-nn]** pending: waits on a round-2 answer in §9.1. Nothing tagged Q gets built until it's answered.
   - **[P]** proposed: an engineering suggestion that doesn't change business behaviour. Change freely.
3. Answer the round-2 questions by ID: `Q-58: A`, `Q-60: as proposed`, or free text.
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
9. [**Open questions (round 2) and answers (round 1)**](#9-open-questions)
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
| 9 | Remove the base package. **Merged into CR-15** (confirm in Q-68). | CR-09 → CR-15 |
| 10 | Finance restructure into log views: ledger, petty cash, expenses. | CR-10 |
| 11 | **High priority.** Registration fee pre-filled at registration, with "collected" and cash/UPI, recorded as a payment. | CR-11 🟡 |
| 12 | **New (2026-09-22).** Doctor fees, pharmacy and lab are separate parties. Their amounts are either *included* in what the patient pays or *separate dues*, decided later rather than at admission. The referral commission is always included. Plus a patient dashboard with all the numbers. | CR-15, CR-16 |
| Q-54 | A new bill for each stay. | CR-17 |
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
 Base package + "included in package" flags             Per stay: Doctor fees · Pharmacy · Lab are each
                                                          Included or Separate; referral always included
 Numbers spread over several patient tabs               Patient Overview tab: hospital amount, paid,
                                                          balance, separate dues, what's not decided
 Doctor pricing, referral commission, payouts: admin    Reception too (own entries only)
 Advances: admin/doctor only                            Reception pays advances (no salary figures shown)
```

---

## 2. Tracker

| CR | Title | Req | Priority | Depends on | Waiting on | Status |
|---|---|:-:|:-:|---|---|:-:|
| [CR-01](#cr-01--own-row-rule-view-all-closed-lock-req-1) | Own-row rule, view-all, closed lock, enforced on the server | 1 | P0 | — | — | 🔲 |
| [CR-02](#cr-02--petty-cash-log-req-2-7) | Petty cash log | 2, 7 | P1 | CR-01 | Q-70 (edit history: optional) | 🔲 |
| [CR-03](#cr-03--employee-advance-for-reception-req-3) | Employee advance for reception | 3 | P1 | CR-01, CR-02 | — | 🔲 |
| [CR-04](#cr-04--reception-doctor-visit-pricing-referral-commission--payouts-req-4) | Reception: doctor pricing, referral commission & payouts | 4 | P2 | CR-01, CR-13 | Q-71, Q-72 | ⛔ |
| [CR-05](#cr-05--ledger-log-all-entries-simple-fetching--ux-req-5) | Ledger log: all entries, simpler fetching & UX | 5 | P0 | CR-01 | — | 🔲 |
| [CR-06](#cr-06--closing-entries-req-6) | Closing: bulk close + "Not closed" tab | 6 | P1 | CR-05 | — | 🔲 |
| [CR-07](#cr-07--admin-expenses-are-general-expenses-req-7) | Admin expenses = general expenses | 7 | P2 | — | Q-69 | ⛔ |
| [CR-08](#cr-08--retire-the-day-based-daily-ledger-req-8) | Retire the day-based ledger (day close, shift settlement) | 8 | P1 | CR-05, CR-06 | — | 🔲 |
| [CR-09](#cr-09--remove-the-base-package-req-9--merged-into-cr-15) | Remove the base package | 9 | — | — | Q-68 | → CR-15 |
| [CR-10](#cr-10--admin-finance-restructure-req-10) | Admin finance restructure (log views) | 10 | P2 | CR-02, CR-05 – CR-07 | Q-69 | ⛔ |
| [CR-11](#cr-11--registration-fee-at-registration-req-11) | Registration fee at registration | 11 | **P0** | — | deploy (§8.4) | 🟡 |
| [CR-12](#cr-12--a-payment-and-its-ledger-entry-stay-one-record) | A payment and its ledger entry stay one record | gap | P0 | — | deploy (§8.4) | 🟡 |
| [CR-13](#cr-13--one-payout-path) | One payout path for doctor fees & referral commission | gap | P2 | CR-05 | Q-71 | ⛔ |
| [CR-14](#cr-14--india-ist-dates-everywhere) | India (IST) dates everywhere | gap | P1 | — | deploy (§8.4) | 🟡 |
| [CR-15](#cr-15--what-the-patients-payments-cover-req-12) | What the patient's payments cover (replaces the package) | 12, 9 | P1 ¹ | — | Q-57 – Q-65, Q-68 | ⛔ |
| [CR-16](#cr-16--patient-overview-dashboard-req-12) | Patient Overview (dashboard) | 12 | P1 ¹ | CR-15 | Q-66, Q-67, Q-75 | ⛔ |
| [CR-17](#cr-17--a-new-bill-for-each-stay-q-54) | A new bill for each stay | Q-54 | P2 ¹ | — | Q-74 | ⛔ |

Priorities are from Q-56 ("as proposed"), with CR-11 at P0 from the client. ¹ The CR-15 – CR-17 priorities are my proposal; confirm them in Q-76.

**Definition of done (every CR):** the rule is enforced in the API, not only hidden in the UI · screens show an action only when it's allowed · tests added or updated under `tests/` · baseline `PRD.md` updated · row ticked here and logged in §10.

**Build order**

```
 Phase 1 (P0)                        Phase 2 (P1)                     Phase 3 (P2)
 ────────────                        ────────────                     ────────────
 🟡 CR-11 Registration fee            CR-06 Closing                    CR-04 Pricing & payouts by reception
 🟡 CR-12 Payment ⇄ ledger            CR-08 Retire day close           CR-07 Admin expenses
 🟡 CR-14 IST dates                   CR-02 Petty cash                 CR-10 Finance restructure
    CR-01 Rules on the server         CR-03 Advances by reception      CR-13 One payout path
    CR-05 Ledger log                  CR-15 What the payments cover    CR-17 New bill per stay
                                      CR-16 Patient Overview
```

**Built so far** (branch `feature/v2-registration-fee-payments`):
- all 57 test files pass: 1,737 tests, plus 31 tests that record still-open bugs
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
| **Hospital charges** | Charges for the hospital's own services: room, procedures, nursing, registration… Everything except pharmacy and lab. |
| **Outside amounts** | Doctor fees, pharmacy and lab: money for separate parties (req 12). |
| **Included / Separate / Not decided** | For each outside amount on a stay: covered by the payments the hospital takes; a due the patient pays on top, "apart from the hospital amount"; or not set yet (CR-15). |
| **Hospital amount** | What the patient owes the hospital: hospital charges + the outside amounts marked Included. |
| **Separate dues** | Outside amounts marked Separate, shown to the patient on their own lines. |
| **Hospital's share** | Of the money received, what stays with the hospital after passing on the included outside amounts and the referral commission. |
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
| 18 | "What the payments cover" switches (CR-15) | Q-65 | Q-65 |
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

### 3.5 What the payments cover, in one line (Req 12, CR-15)

For each stay, three switches: Doctor fees · Pharmacy · Lab = **Included** / **Separate** / **Not decided**. The referral commission is always included.

```
Hospital amount  = hospital charges + outside amounts marked Included
Balance          = Hospital amount − payments          (Q-31 = C)
Separate dues    = outside amounts marked Separate      (patient pays "apart from the hospital amount")
Hospital's share = payments − included outside amounts − referral commission
```

Details, worked examples and the open points are in CR-15.

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
**Priority** P2 · **Status** ⛔ Q-71, Q-72

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
- [ ] AC-04.5 ⛔ Q-72: the manual-row, merge and visit-purpose screens.

### CR-05 — Ledger log: all entries, simple fetching & UX (Req 5)
**Priority** P0 · **Status** 🔲 ready

> *The ledger currently shows only the logged-in user's entries. It should show all entries, so others don't have to guess whether a payment was received. The current ledger data fetching and UX are too complex. Simplify them.*

**Today: why it's complex**
- Three screens show overlapping ledger data (Daily Summary, Finances → Transactions, Employee Shift Schedule), plus the Day Close tab and the open-days banner.
- There are 10 ledger route files, most hand-rolling the token refresh; nothing is paginated; the whole day is refetched whenever any of 4 tables changes.
- Non-admins see only their own rows. On the branch, rows that belong to a payment already carry `payment_installment_id` and link to the patient instead of offering Edit.

**Target** (all decided)
- [D] Everyone with ledger access sees all entries (Q-05, Q-06). The ledger holds patient payments, registration fees, OPD receipts, and doctor and referral payouts. There's no desk spending in it (Q-07 = A).
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
**Priority** P2 · **Status** ⛔ Q-69

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
- [ ] AC-07.3 ⛔ Q-69: the petty cash bulk line.

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
**Status** → CR-15 (confirm the reading of "Drop" in Q-68)

> *The base package is not useful and should be removed completely. The total amount is derived from the payments/installments made so far. Do not show "due: X amount" based on the base package, either in the patient section or in the finance section.*

**Why merged:** you answered Q-30 "Drop", then Q-31 = C, Q-32 = A and Q-33 = A, which only apply if the package goes. Requirement 12 then replaces the package's two "included in package" flags with the per-stay switches in CR-15. So removing the package and adding the switches are one change to the bill formula. I read "Drop" as "drop the package"; **Q-68** confirms it.

Decided for the removal (all in CR-15):
- **Q-31 = C:** show services used, paid and balance. CR-15 refines this into hospital amount, paid, balance and separate dues.
- **Q-32 = A:** Finances loses "Pending receivables".
- **Q-33 = A:** existing base charges become a "Package (legacy)" charge line. Only one live bill has one: ₹20,000 (§5.4).
- **Q-34:** left blank; covered by requirement 12. Doctor fees are always paid by the patient, either included or as a separate due.
- **Q-35:** the patient-facing PDF shows services used and payments only (plus separate dues: Q-67).

### CR-10 — Admin finance restructure (Req 10)
**Priority** P2 · **Status** ⛔ Q-69

> *Given the changes above, the admin finance section and its sub-sections will change significantly. Remove the daily ledger view. Instead, show log-style views for ledger, petty cash, and expenses.*

**Target**
- [D] No daily ledger view.
- [D] **Navigation (Q-38 = A):** Ledger, Petty cash and Employee Advance are menu items shared with reception. Finances keeps Overview · Expenses · Settlements.
- [D] **Overview (Q-36), cash basis:**
  - **Money in** = patient payments + registration fees + OPD receipts.
  - **Money out** = general expenses + desk (petty cash) expenses + salary for settled months + doctor and referral payouts actually made.
  - Advances count once, inside salary. Top-ups aren't expenses.
  - **Profit** = money in − money out.
- [D] Pending receivables removed (Q-32 = A).
- [Q-69] The petty cash bulk line, and how Money out counts it.

**Acceptance criteria**
- [ ] AC-10.1 Each log is one click from the menu.
- [ ] AC-10.2 The Day Close and Transactions tabs are gone.
- [ ] AC-10.3 Every Overview figure matches the Q-36 definition, with one test per figure.

### CR-11 — Registration fee at registration (Req 11)
**Priority** **P0** · **Status** 🟡 built on the branch · deploy per §8.4

> *The registration fee is set in the registration catalogue. When a patient is admitted or created, auto-fill this amount and show a checkbox to mark it as collected, with a payment mode selection (cash or UPI). Record it in the ledger as a payment/installment received. Registration fee is income; all other charges are for services used.*

**Decided:** Q-40 = A · Q-41 = A · Q-42 = B · Q-43 (unticked; not collected → banner + Collect now) · Q-44 = A · Q-45 = B · Q-46 = B · Q-47 = yes.

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

**Acceptance criteria**
- [x] AC-12.1 Changing a payment from ₹5,000 to ₹500 makes its ledger row ₹500 too; mode, reference, date and remarks follow.
- [x] AC-12.2 Deleting a payment deletes its ledger row.
- [x] AC-12.3 A rejected ledger write leaves no payment behind.
- [x] AC-12.4 A payment can't be recorded against another patient's bill.
- [ ] AC-12.5 Checked on production after deploy (§8.4).

### CR-13 — One payout path
**From gaps G-09 … G-12** · **Priority** P2 · **Status** ⛔ Q-71

- [D] Q-37 = B: whichever screen a doctor fee or referral commission is paid from, it writes exactly one ledger OUT. Un-paying reverses it, and the payout's ledger row can't be deleted on its own.
- [D] Q-37 (b): paying a different amount than priced updates the fee total to the amount paid.
- [D] Reception can pay out too (Q-19).
- [Q-71] What money reception pays from.

**Acceptance criteria**
- [ ] AC-13.1 Paying from the patient tab creates a ledger OUT.
- [ ] AC-13.2 Un-paying removes that ledger OUT.
- [ ] AC-13.3 Paying ₹2,500 against a priced ₹3,000 leaves the fee total at ₹2,500, and the bill recalculates.
- [ ] AC-13.4 ⛔ Q-71: a payout by reception is booked as agreed and born Open.

### CR-14 — India (IST) dates everywhere
**From gap G-30** · **Priority** P1 · **Status** 🟡 built on the branch

**Decided:** Q-49 = yes. **Built:** `lib/dates/ist.ts`. Every "today" and "this month" default that used the UTC date now uses Asia/Kolkata: 32 call sites across the payments, ledger, finance, payroll, charge, patient and pharmacy code, plus the two form helpers that used the browser's date. The patients report's "last month" range no longer starts a day early. Tests: `tests/unit/ist-date.test.ts`.

- [x] AC-14.1 At 01:30 IST, every form and API defaults to that day's IST date.

### CR-15 — What the patient's payments cover (Req 12)
**Priority** P1 (proposed, Q-76) · **Status** ⛔ Q-57 – Q-65, Q-68

> Client, 2026-09-22 (verbatim): *"some times patient and hospital agree on payment to whole things (like Except charges they need to give to doctor consultation, medicine(pharmacy), lab) as these are differnet entity. so at that time the actually money or payment recieved from the patitnet deduct all this charges then the final amount is the payment made to the hospital. Referral part is always included in the payemnt they make (As we dont ask them extram money right) but the as i mentioned the doctor fee, lab and medicine are sometimes included in the payment/installments made by the patient when included we need to act accordingly when not included we need to ask them these are the dues you have to pay apart from the hospital amount. dont make this mandatory at the time of admission as we add charge or logs later we will decide what goes which type"*

**Today** (code and live data, 2026-09-22)
- **Package flags:** the bill adds doctor fees to what the patient owes unless a package "includes" them, and bills the referral commission only when a package doesn't include it (`lib/recalculate-billing.ts:72-79`). The flags only work with a base charge, which is going (Q-68). None of the 11 live bills uses them.
- **Pharmacy:** SmartPharma360 bills become patient charges with **no catalogue item** (both live ones). They can only be recognised through `pharmacy_bills.patient_charge_id` (G-32). The catalogue also has a manual "Medication" item in the Pharmacy category.
- **Lab:** the lab module stores prices on orders (8 orders, ₹3,040 net) that reach no bill (Q-51: the lab stores data only). Lab-type work can also be billed as Diagnostics charges: Lab Test, X-Ray, CT, MRI (G-33).
- There's no notion of "included / separate", no separate dues, and no hospital's-share figure.

**My reading of the requirement: confirm in Q-57**
1. A stay can carry three **outside amounts**, for parties the hospital passes money to: **Doctor fees**, **Pharmacy** and **Lab**. There is also the **referral commission**, paid to the referrer.
2. For each outside amount, the stay says **Included** (the payments the hospital takes cover it) or **Separate** (the patient pays it on top). It isn't asked at registration. It's set any time later, as charges come in, and until then it's **Not decided**.
3. The referral commission is **always included**. It's never billed on top, and it's paid out of what the patient pays.
4. The patient is told two things: what they still owe the hospital, and the separate dues they pay "apart from the hospital amount".

```
H  = hospital charges   (all charge lines except pharmacy and lab — room, procedures, registration fee …)
D  = doctor fees        (fee rows on the stay)
P  = pharmacy           (pharmacy bills + Pharmacy-category charges — Q-63)
L  = lab                (source per Q-62)
R  = referral commission
Paid = Σ payments on the stay

Hospital amount  = H + [D if Included] + [P if Included] + [L if Included]
Balance          = Hospital amount − Paid                                      (Q-31 = C)
Separate dues    = each of D, P, L marked Separate — listed for the patient
Not decided      = each of D, P, L not yet set — shown as a warning (Q-59)
Hospital's share = Paid − [included D, P, L] − R          (= H − R once the balance is 0)
```

**Worked example.** One stay:
- **Hospital charges** H = ₹30,000 (room ₹20,000 + procedures ₹9,900 + registration ₹100).
- **Outside amounts:** doctor fees D = ₹6,000 · pharmacy P = ₹9,000 · lab L = ₹3,000.
- **Referral commission** R = ₹2,000.

| | A. All three included | B. Doctor included; pharmacy & lab separate | C. Pharmacy not decided yet |
|---|--:|--:|--:|
| Switches | D ✓ · P ✓ · L ✓ | D ✓ · P ✗ · L ✗ | D ✓ · P ? · L ✗ |
| Hospital amount | 48,000 | 36,000 | 36,000 |
| Paid so far | 40,000 | 36,000 | 30,000 |
| **Balance** | **8,000** | **0** | **6,000** |
| **Separate dues** (pay apart) | — | Pharmacy 9,000 · Lab 3,000 | Lab 3,000 |
| **Not decided** | — | — | Pharmacy 9,000 ⚠ |
| Hospital's share of what's been paid | 40,000 − 18,000 − 2,000 = **20,000** | 36,000 − 6,000 − 2,000 = **28,000** | 30,000 − 6,000 − 2,000 = **22,000** |

Once a stay is fully paid, the hospital's share is always H − R = ₹28,000, however the deal was made. That's the check that the formula is consistent.

**Target**
- [D] Three per-stay switches, Doctor fees · Pharmacy · Lab, each Included / Separate. Not asked at registration and not mandatory, so they can be set later.
- [D] The referral commission never adds to what the patient owes.
- [D] "When not included, we ask them to pay these as dues apart from the hospital amount": separate dues are listed on their own.
- [D] **Removing the base package** (from CR-09, if Q-68 = A):
  - no base charge and no package flags
  - the one live ₹20,000 package becomes a "Package (legacy)" charge line (Q-33 = A)
  - Finances loses Pending receivables (Q-32 = A)
- **Open points:**
  - [Q-57] Confirm the reading and the formula.
  - [Q-58] Set per stay or per item.
  - [Q-59] What "not decided" does to the totals.
  - [Q-60] When an amount is separate, who collects it.
  - [Q-61] When pharmacy/lab are included, whether to track paying them.
  - [Q-62] Where lab amounts come from.
  - [Q-63] What counts as pharmacy.
  - [Q-64] All-inclusive deals where the payments don't match the itemised charges.
  - [Q-65] Who sets the switches, and when they lock.
- [P] Columns on `patient_billing`: `doctor_fees_cover`, `pharmacy_cover` and `lab_cover` (`included` / `separate` / null = not decided), plus who changed them and when. `recalculatePatientBilling` stores the hospital, pharmacy, lab and doctor totals and the hospital amount. One server function computes every figure above, used by CR-16 and the PDF.

**Acceptance criteria**
- [ ] AC-15.1 A new stay starts with all three switches Not decided, and nothing asks about them at registration.
- [ ] AC-15.2 Admin or reception (per Q-65) sets or changes each switch at any time until it locks.
- [ ] AC-15.3 The hospital amount, balance, separate dues, not-decided amounts and hospital's share match the formula (unit tests use worked examples A–C).
- [ ] AC-15.4 The referral commission never changes what the patient owes.
- [ ] AC-15.5 No base charge or package flag remains, and the legacy ₹20,000 bill's total doesn't move.

### CR-16 — Patient Overview (dashboard) (Req 12)
**Priority** P1 (proposed, Q-76) · **Status** ⛔ Q-66, Q-67, Q-75 · needs CR-15

> *"in patient details make a dashboard like view which gonna show all the stats and numbers regarding the patient"*

**Today:** the numbers are spread over the Billing & Settlement tab (8 cards including base charge, with money cut off by `parseInt`, G-19), the Payments and Charges totals, and nothing else. No single place shows the counts, the payout status, or what's still undecided.

**Proposed contents** (confirm in Q-66)
1. **Stay header:**
   - patient ID, name, age/sex and status
   - joined/admitted date and days in hospital, or the discharge date
   - referral person
   - a stay picker (CR-17)
2. **Money cards:**
   - Hospital amount · Paid · Balance
   - Separate dues, itemised
   - Not decided ⚠
   - registration fee status (collected / not collected / waived)
3. **What the payments cover:** the three switches, each with its amount alongside, and the referral commission marked "always included".
4. **Breakdown:**
   - hospital charges by category
   - doctor fees by doctor (priced / paid)
   - pharmacy bills
   - lab
   - referral commission (paid / not)
5. **Payouts:** doctor fees paid/pending, and referral commission paid/pending. Pharmacy and lab too, if Q-61 = A.
6. **Hospital's share:** admin only, if Q-66 agrees.
7. **Activity:**
   - counts and last dates for visits, charges, lab orders, pharmacy bills and payments
   - case sheet status

- [D] Amounts show paise everywhere (Q-50).
- [P] A new first tab, **Overview**. Billing & Settlement keeps the pricing and payout actions and drops its duplicate summary cards. Data comes from `GET /api/patients/[id]/overview?billing_id=`.

**Acceptance criteria**
- [ ] AC-16.1 Opening a patient lands on Overview, with the figures from CR-15 for the current stay.
- [ ] AC-16.2 Every card agrees with the Charges, Payments and Billing tabs to the paisa.
- [ ] AC-16.3 Reception sees exactly what Q-66 allows.
- [ ] AC-16.4 Switching stays (CR-17) switches every figure.

### CR-17 — A new bill for each stay (Q-54)
**Priority** P2 (proposed, Q-76) · **Status** ⛔ Q-74

**Decided:** Q-54 = a new bill for each stay.

**Today:** a patient can already hold several bills, and every screen uses the newest (`billings[0]`); no live patient has more than one. Nothing creates a second bill on readmission. Setting a Discharged patient back to Active reuses the same bill.

**Target**
- [D] Each stay has its own bill, and earlier stays stay viewable.
- [Q-74] How a readmission starts, and whether the registration fee is offered again (Q-41 said "at registration now, readmission once each stay has its own bill").
- [P] A readmission creates a new `patient_billing` (joined date = readmission date), and the patient goes back to Active. Screens show the open stay by default, with a stay picker. The "What the payments cover" switches and the registration fee status belong to each stay.

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
| G-05 | 🟡 | Zero or negative payment amounts are accepted, and overpayment isn't checked at all. | BUGS #19 | 🟡 CR-12 (zero/negative) · overpayment: the CR-15 balance rules |
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
| G-14 | 🟠 | Doctor fees reach the bill only after Sync and pricing. | settlements sync | Kept by choice (Q-21 = B) |
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
| X-11 | Req 9 "total = payments" vs the bill total from charges | Q-31 = C, reworked by CR-15 · confirm in Q-57 |
| X-12 | Fee schedule save overwrites `created_by` | Q-20 = A, engineering fix in CR-04 |
| X-13 | Advances can't be edited | Q-17 = A |
| X-14 | Admin adds ledger expenses today | Q-07: admin expenses become general expenses only |
| X-15 | The BUGS #36 decision about day close | Moot with CR-08 |
| X-16 | **New.** Q-51 says the lab stores data only, but req 12 treats lab amounts as included or separate | Q-62 |
| X-17 | **New.** Q-30 "Drop" vs the Q-31/32/33 answers, which assume the package is removed | Q-68 |
| X-18 | **New.** Q-19 lets reception pay doctors and referrers, but Q-08/Q-13 keep patient cash out of petty cash and limit petty cash to expenses and advances. Which money pays them? | Q-71 |

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

This is the target after v2. 🟡 marks a step built on the branch; ⛔ marks a detail that waits on a round-2 question.

```
 RECEPTION (desk)                        WHAT GETS WRITTEN                                        ADMIN
 ════════════════                        ═════════════════                                        ═════
 ① Register patient 🟡
    fee pre-filled from the catalogue ─► patient · bill (joined date, month)
    (amount editable, 0 = waived)         charge "Registration" ₹100        patient_charges        (hospital charge)
    ☑ Collected · Cash / UPI  ─────────► payment #1, kind registration     patient_billing_installments
                                          ledger IN ₹100, source registration  OPEN
    ☐ left unticked ───────────────────► charge only · Payments tab: "not collected" · [Collect now]
      │
 ② Record doctor visits ───────────────► visits                           patient_consultations
    Sync · price visits ───────────────► fee rows (owner = who priced)     doctor_visit_settlements
    set referral commission ───────────► commission (owner = who set it)   patient_billing
      │
 ③ Add charges (services used) ────────► hospital / pharmacy / lab lines   patient_charges  ⛔Q-62/63
    attach pharmacy bill ──────────────► pharmacy line + bill copy         pharmacy_bills
      │
 ④ Decide what the payments cover ─────► stay: Doctor fees · Pharmacy · Lab = Included / Separate
    (any time later, not at admission)     referral commission always included            ⛔Q-58/59/65
      │
 ⑤ Take payments ──────────────────────► payment #n + ledger IN, OPEN (always together 🟡)
      │   Overview tab: Hospital amount · Paid · Balance · Separate dues · Not decided   (CR-16)
      │
 ⑥ Desk spending ──────────────────────► petty cash OUT only (no ledger entry)     ◄── ⑦ Top up petty cash
    (expense · employee advance)                                                        "given to: Priya"
      │
 ⑧ ══════════ CLOSE POINT ════════════   Ledger ▸ "Not closed"                        ◄── admin ticks rows,
                                          OPEN ──► CLOSED (by, when, batch note)             sees the cash / UPI total
                                          🔒 reception can't change them any more             ▸ "Mark closed"
                                          🔒 nor the payments behind them
      │
 ⑨ Pay doctor fee / referral ──────────► ledger OUT + fee row paid 🔒       ◄── or admin pays: ledger OUT
    (reception: money source ⛔Q-71)        reception's payout: OPEN → closed at ⑧        born CLOSED
      │
 ⑩ Discharge (case sheet finalised) ───► status Discharged · charges lock for reception (Q-03 = B)
    patient pays the separate dues "apart from the hospital amount" (who collects: ⛔Q-60)
```

**Entry register: who creates what, and when it locks**

| Step | Entry | Created by | Table(s) | Born | Closed by admin at | Reception can edit its own until |
|:-:|---|---|---|---|:-:|---|
| ① | Patient + bill | Reception | `patients`, `patient_billing` | — | — | never locks (shared record) |
| ① | Registration charge | Reception | `patient_charges` | — | — | the patient is Discharged |
| ① | Registration payment + ledger IN 🟡 | Reception | installments + ledger | Open | ⑧ | ⑧ |
| ② | Doctor visit | Reception | `patient_consultations` | — | — | its fee is paid |
| ② | Fee price / commission | Reception or Admin | fee rows / `patient_billing` | — | — | paid (⑨) |
| ③ | Charge | Reception | `patient_charges` | — | — | the patient is Discharged |
| ④ | Payment-cover switches | Reception or Admin | `patient_billing` | Not decided | — | Q-65 |
| ⑤ | Payment + ledger IN 🟡 | Reception | installments + ledger | Open | ⑧ | ⑧ |
| ⑥ | Desk expense | Reception | petty cash | no status | never | any time (Q-12 = A) |
| ⑥ | Advance | Reception | `advances` + petty cash | no status | never | the salary month is settled |
| ⑦ | Top-up | Admin | petty cash | no status | — | never (admin's) |
| ⑨ | Payout by reception | Reception | ledger OUT + fee row | Open | ⑧ | ⑧ |
| ⑨ | Payout by admin | Admin | ledger OUT + fee row | Closed | — | never (admin's) |

---

## 7. Screens & navigation

**[D]** Q-38 = A.

| Menu | Admin | Reception | Notes |
|---|:-:|:-:|---|
| Patients → patient record | ✅ | ✅ | New first tab, **Overview** (CR-16); the registration fee block on Add Patient 🟡 |
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
| `patient_billing.doctor_fees_cover`, `pharmacy_cover`, `lab_cover` (+ changed by/at); hospital / pharmacy / lab totals; `base_charge` and the package flags retired | CR-15 | |
| Readmission = a new `patient_billing` per stay | CR-17 | |
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
| `GET /api/patients/[id]/overview?billing_id=` · `PATCH .../billing` for the cover switches | |
| `POST /api/patients/[id]/readmit` | |

### 8.3 Data migration still to write (after the answers)

1. Ledger statuses become open/closed per Q-29.
2. The petty cash opening balance (Q-14).
3. The ₹20,000 base charge becomes a "Package (legacy)" line, and the package columns are retired (Q-33, if Q-68 = A).

### 8.4 Deploying what's built (CR-11, CR-12, CR-14)

Order matters: the new code writes columns that exist only after migration `20260922000001`.

1. Review and merge `feature/v2-registration-fee-payments` (commit `ecc8717`).
2. Apply `supabase/migrations/20260922000001_registration_fee.sql` to production. It adds 3 columns, 2 partial unique indexes and 2 CHECK constraints, and swaps the ledger source list. All tables involved are small.
3. Apply `supabase/migrations/20260922000002_billing_month_backfill.sql`. It fills the month on 8 bills. **Expect the Finances Overview for those months to change**, because those bills start being counted.
4. Deploy the app.
5. Smoke test on production:
   1. Register a test patient with the fee ☑ Collected, Cash. Check the Payments tab (payment #1, "Registration fee") and the Daily Ledger ("Registration fee (…)", with no Edit/Delete).
   2. Register one with the fee unticked. Check that the "not collected" banner appears and that Collect now works.
   3. Delete the test patients.
6. Tell the desk three things. Payments can no longer be edited from the Daily Ledger (use the patient's Payments tab). The registration fee price is admin-only now. A failed payment now saves nothing, so it's safe to retry.

---
## 9. Open questions

**How to answer:** reply by ID, e.g. `Q-58: A`, `Q-60: as proposed`, or free text. A **Proposed** line is my recommendation, there to make answering quick. **Nothing in §4 assumes it:** every rule that depends on a question stays tagged [Q] until you answer.

**★ Answer these first.** They block CR-15 (what the payments cover), CR-04 (payouts by reception) and CR-17: **Q-57, Q-58, Q-59, Q-60, Q-62, Q-64, Q-68, Q-71, Q-74.**

### 9.1 Round 2 — open (2026-09-22)

#### What the payments cover (CR-15) and the patient Overview (CR-16)

**Q-57 ★** · Req 12 · CR-15 · blocks CR-15, CR-16
Is my reading right: CR-15 "My reading", the formula, and worked examples A–C? In particular:
- Hospital charges are everything except pharmacy and lab. Doctor fees, pharmacy and lab are the outside amounts.
- Balance = hospital amount − paid. Separate dues are listed on their own and are **not** part of the balance.
- The referral commission is never billed; it comes out of the hospital's share.

*Proposed:* yes, as written. Tell me any line that's wrong.

**Q-58 ★** · Req 12 ("we will decide what goes which type") · blocks CR-15
Where is Included / Separate set?
- **A** Once per stay: one switch each for Doctor fees, Pharmacy and Lab.
- **B** Per item: each doctor fee row, pharmacy bill and lab charge has its own switch.
- **C** Per stay, with a per-item override for the odd exception.

*Proposed:* **A**, because a deal is usually made per patient ("all-inclusive except medicines"). Choose **C** if mixed cases really happen.

**Q-59 ★** · Req 12 ("don't make this mandatory") · blocks CR-15
While a switch is still Not decided:
- **A** The amount shows as "Not decided ⚠". It's outside both the balance and the separate dues until someone decides.
- **B** Treat it as Separate (a due) until decided.
- **C** Treat it as Included until decided.

*Proposed:* **A**.

**Q-60 ★** · Req 12 ("dues you have to pay apart from the hospital amount") · blocks CR-15, CR-13
When an amount is Separate, who collects it? Please fill in per party:

| Party | **A** The hospital desk collects it (a payment tagged "for doctor / pharmacy / lab") and passes it on | **B** The patient pays the doctor / pharmacy / lab directly; the desk only marks it "paid directly" |
|---|:-:|:-:|
| Doctor fees | proposed | |
| Pharmacy | | proposed |
| Lab | | proposed |

This decides whether the money shows in the hospital's ledger. With **A**, the desk takes the money and pays it on (for a doctor, through fee settlements as today). With **B**, the hospital neither receives nor pays it, so a doctor fee marked "paid directly" must not book a hospital payout.

*Proposed:* as marked above. That's my guess from how the app works today (the hospital already pays doctors; SmartPharma360 is its own counter), so please correct it.

**Q-61** · Req 12 · CR-15
When Pharmacy or Lab is Included, the hospital owes that money to the pharmacy or lab. Should the app track paying them (pending → paid, with a ledger OUT, like doctor fees)?
- **A** Yes, track pharmacy and lab payouts like doctor fees.
- **B** No, just deduct them in the hospital's-share figure.

*Proposed:* **B** for now; A later if they want the cash book to show it.

**Q-62 ★** · Req 12 vs Q-51 · X-16 · G-33 · blocks CR-15
You said (Q-51) that the lab module stores data only. So where does the **Lab** amount come from?
- **A** Charges in the Diagnostics category (Lab Test, X-Ray, CT, MRI).
- **B** Only the "Lab Test" catalogue item.
- **C** The prices on lab orders.
- **D** A new catalogue category, "Lab (outside)". Whatever items you put in it count as lab, and Diagnostics stays the hospital's.

Also: are X-Ray, CT and MRI done by the hospital or by the outside lab?

*Proposed:* **D**. It's explicit: you choose, item by item, what belongs to the outside lab.

**Q-63** · Req 12 · G-32 · blocks CR-15
What counts as **Pharmacy**?

*Proposed:* SmartPharma360 bills attached to the patient, **and** any charge from the Pharmacy catalogue category (e.g. "Medication").

**Q-64 ★** · Req 12 · Q-31 = C · blocks CR-15
All-inclusive deals: say the agreed amount is ₹45,000 "for everything", but the itemised charges add up to ₹48,000, so Balance shows ₹3,000. How is that settled?
- **A** Admin adds a "Discount / adjustment" line (a negative amount, with a reason) so the balance comes to 0.
- **B** Record the agreed deal amount on the stay: Balance = deal − paid, and the itemised charges are for information only. *(This is close to the base package that's being removed.)*
- **C** Nothing; the balance stays as shown.

*Proposed:* **A**, admin only. It also answers part of Q-73.

**Q-65** · Req 12, Req 1 · blocks CR-15
Who sets the Included / Separate switches, and when do they lock?

*Proposed:*
- Admin and any receptionist can set them. They're a setting on the stay, not someone's own entry.
- Every change is recorded: who, when, and from → to.
- They lock for reception once the patient is Discharged, like charges (Q-03 = B).

**Q-66** · Req 12 · CR-16
The Overview tab: is the content listed in CR-16 right, and what does reception see?

*Proposed:* reception sees everything except "Hospital's share", which is admin-only, in line with Q-05 hiding profit.

**Q-67** · Req 12 · Q-35 · G-20 · CR-16
What does the billing PDF given to the patient show?

*Proposed:*
- **Shows:** the hospital amount with itemised services, payments, the balance, and the separate dues "to be paid apart from the hospital amount".
- **Leaves out:** the referral commission and the hospital's share.

#### Follow-ups on round-1 answers

**Q-68 ★** · Req 9 · Q-30 · X-17 · blocks CR-15
You answered Q-30 "Drop". I read that as "drop (remove) the base package", because Q-31 = C, Q-32 = A and Q-33 = A only apply if it goes, and requirement 12 replaces the package flags.
- **A** Yes. Remove the base package, as part of CR-15.
- **B** No. Keep the base package as it is and drop CR-09. (Q-31/32/33 then don't apply, and the new switches sit alongside the package.)

*Proposed:* **A**.

**Q-69** · Req 7, 10 · Q-07 · blocks CR-07, CR-10
You wrote: *"In the Expense add a petty cash credit or something similar, add as bulk for the whole timeframe or month."* What should the Expenses log show for petty cash?
- **A** One automatic line per month, "Petty cash spent — Sep 2026: ₹X": the desk expenses paid from petty cash that month, linking to the petty cash log. Advances stay inside salary.
- **B** One automatic line per month for the top-ups the admin gave.
- **C** Each top-up the admin records also appears as its own "Petty cash" line.

Either way, the Overview's "money out" counts that line and never the individual entries as well.

*Proposed:* **A**. It counts money actually spent. B and C count what was handed over, which also includes advances that salary already counts. If "credit" meant top-ups, choose **B**.

**Q-70** · Req 2 · Q-12 = A
Reception can edit or delete its petty cash entries at any time. Keep an edit history (who, when, the old amount), with an "edited" mark on the entry?

*Proposed:* yes.

**Q-71 ★** · Req 4 · Q-19 · X-18 · blocks CR-04, CR-13
Reception can now pay doctor fees and referral commissions. From what money?
- **A** From the day's patient collections: a Ledger OUT, born Open, which admin closes. It reduces the cash the desk hands over.
- **B** From petty cash, as a new kind of petty cash debit. (This changes Q-13, which limited petty cash to expenses and advances.)
- **C** Reception only marks it paid, and the admin hands over the money.

*Proposed:* **A**.

**Q-72** · Req 4 · Q-19 d, h · blocks CR-04
Manual fee rows, merging fee rows and managing visit purposes have no screen today (API only). Build screens for them now?

*Proposed:* the visit purposes screen now (small); manual rows and merge later, if asked.

**Q-73** · Q-53 (left blank) · F-10
Which of refunds, discounts, receipts and invoice numbers are needed now?

*Proposed:* the discount/adjustment line from Q-64 A now; refunds and printed receipts later.

**Q-74 ★** · Q-54 · Q-41 · blocks CR-17
A new bill for each stay: how does a readmission start, and is the registration fee charged again?
- **A** A "Readmit" button on a discharged patient opens a new bill and makes the patient Active.
- **B** It happens automatically when someone sets a Discharged patient to Active.

Registration fee on readmission: yes (pre-filled, can be 0), or no?

*Proposed:* **A**, and yes to the fee: pre-filled and editable. (Your Q-41 answer said readmission would come once each stay has its own bill.)

#### Overview scope and priorities

**Q-75** · Req 12 · CR-16
Does the Overview show one stay at a time (with a stay picker), or the patient's lifetime totals?

*Proposed:* one stay at a time, the current one by default, with a list of earlier stays.

**Q-76** · Q-56
Priorities for the new CRs?

*Proposed:* CR-15 and CR-16 at P1, together, after the P0 work. CR-17 at P2.

### 9.2 Round 1 — answers received 2026-09-22

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
| Q-30 | Keep or drop CR-09 | "Drop". Meaning to confirm → **Q-68** | CR-09 |
| Q-31 | What the patient section shows | **C**: services used, paid, balance (refined by CR-15) | CR-15 |
| Q-32 | Pending receivables | **A**: remove | CR-10, CR-15 |
| Q-33 | Existing base charges | **A**: a "Package (legacy)" line | CR-15 |
| Q-34 | Doctor fees on the bill | *(blank)*. Covered by requirement 12: included, or a separate due | CR-15 / Q-57 |
| Q-35 | Patient PDF | As proposed | CR-16 / Q-67 |
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
