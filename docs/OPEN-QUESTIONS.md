# KKR HMS — Open questions

Everything still waiting on an answer, in one place. The PRD is [`PRD-v2.md`](PRD-v2.md); answered questions are logged in its §9.

**How to answer:** reply by ID, e.g. `Q-90: A`, `Q-91: as proposed`, or free text. After your answers, the PRD is updated and the questions move to its answer log.

_Last updated 2026-09-25 · **2 open** (Q-97, Q-98) · every CR built_

**How the app works today, end to end:** [`APP-FLOW-PRD.md`](APP-FLOW-PRD.md). This file is only what is waiting on you.

---

## Waiting on you — round 6 (from the 2026-09-25 test audit)

The audit compared every rule in the code and the tests with the decisions in PRD-v2. These two are places where the written rule and the built behaviour disagree, and the decisions so far don't settle which is meant. Nothing is broken either way; I haven't changed either.

### Q-97 — Who may change a doctor's fee schedule rate?

The fee schedule (Doctors ▸ ₹) holds one rate per visit purpose.

- **Today:** any receptionist may change any rate, including one an admin set. The app keeps who first set it and records who changed it last.
- **PRD-v2 §3.2 row 14 says:** reception may change only its **own** rates.
- **Why it's unclear:** Q-88 replaced the "whoever set it owns it" lock with an audit trail *for fees and commissions on a patient* — "we collect the data related to person edited/entered". It didn't mention the rate card.

| | Answer |
|---|---|
| **A** *(recommended)* | Anyone at the desk may change any rate, as today — the same reasoning as Q-88, and a rate card is never "settled". |
| **B** | Reception may change only rates it set; an admin's rate is read-only to reception. |

### Q-98 — Should a doctor see Finances?

- **Today:** the doctor's menu shows **Dashboard**, **Finances** and **Admin Panel**, but each page sends the doctor away (the Dashboard to Patients; Finances and the Admin Panel are admin-only). The Finances *data* is readable by a doctor.
- **Why it's unclear:** Q-05 hid Finances from reception; Q-06 said the doctor "keeps payroll" but said nothing about Finances.

| | Answer |
|---|---|
| **A** *(recommended)* | No. Remove Finances, the Admin Panel and the Dashboard from the doctor's menu, and close the Finances data to doctors too. |
| **B** | Yes, read-only: a doctor opens Finances but cannot add expenses or pay out. The Admin Panel stays admin-only. |

---

## What changed on 2026-09-24 (round 5), in case you read the older notes

The rules below **replace** what earlier rounds said.

- **Lab & medicine** — *Included in the patient's payments* is now the hospital's **expense** (the lab bills us), shown as a clickable **Lab & Medicine** line in Finances ▸ Expenses and a block on the patient's Overview. *Paid directly to the lab* records **nothing at all**. There is no separate lab or medicine payment any more (Q-82, Q-83, Q-86, Q-87 reversed).
- **Doctor fees and referral commissions write no ledger entry.** The admin hands the money over directly; the fee row records who paid it, who carried the cash and how. Finances counts them as money out on the day they are paid.
- **Given by** is a user picker on both, and each of the amount, the status and the carrier carries the name of whoever last changed it.
- Once a fee or commission is **paid**, reception can change nothing on it — every field, not just the amount (Q-88, enforced in full since the 2026-09-25 audit).

For one stay: **Net = total bill − (doctor fees + referral commission + lab & medicine included)**, admin only.

---

## Parked by you, to raise again when you want them

These aren't questions — they're things you told me to leave for later. Say the word and they come back as a CR.

| # | What | You said |
|---|---|---|
| Q-73 / Q-53 | **Refunds, discounts and printed receipts** | "Not now" (Q-73) |
| Q-74 | **Readmission** — a separate bill per stay, with a stay picker (CR-17) | "Consider it as new patient admission for now": a returning patient is registered again |
| Q-63 / Q-84 | **SmartPharma360** — pulling the medicine bill in instead of typing the amount | "No SmartPharma bill, place the amount directly (later integrate if needed)" |
| Q-72 | **Manual ledger rows, and merging the employee ledgers** | "Later"; visit purposes come first |

---

## Everything is built

All twelve requirements are done, in three phases on 2026-09-23:

| | What |
|---|---|
| ✅ Live on `main` | **Reqs 9, 11, 12** (CR-11, CR-12, CR-14, CR-15, CR-16) · **reqs 1, 5, 6, 8** (CR-01 permissions on the server, CR-05 one ledger log, CR-06 closing per row, CR-08 the day-based ledger retired) · **reqs 2, 3, 4** (CR-02 petty cash, CR-03 advances at the desk, CR-04 reception pricing and payouts, CR-13 one payout path) |
| ✅ Live on `main` | **Reqs 7, 10** (CR-07 admin expenses are general expenses, CR-10 the Finances Overview on a cash basis), and rounds 4 and 5 |

Only **CR-17** is still parked, by your own answer to Q-74: a returning patient is registered again for now.

**Round 4 (2026-09-24)** answered six more, from using the app: Q-88 (who may change a fee or
commission — replaces Q-20), Q-89 (an admin's correction amends the ledger in place — moot since 2026-09-24, when payouts left the ledger), Q-90 (the
doctor visit report lives on each doctor's record), Q-91 (a dead session goes to the login page),
Q-92 (the petty cash top-up form) and Q-93 (show who is signed in).

**Decided but not built yet** — raise it and it's next:

- **A screen for visit purposes** (add, rename, retire, default fee). Q-72 said "visit purposes now", and the server already allows admin and reception to do it, but no page does, so the list is stuck at what was set up at the start.
