# KKR HMS — Open questions

Everything still waiting on an answer, in one place. The PRD is [`PRD-v2.md`](PRD-v2.md); answered questions are logged in its §9.

**How to answer:** reply by ID, e.g. `Q-90: A`, `Q-91: as proposed`, or free text. After your answers, the PRD is updated and the questions move to its answer log.

_Last updated 2026-09-25 · **1 open** (Q-99) · every CR built_

**How the app works today, end to end:** [`APP-FLOW-PRD.md`](APP-FLOW-PRD.md). This file is only what is waiting on you.

---

## Waiting on you — round 7

### Q-99 — What should the Dashboard be?

Today it is a placeholder: four tiles that always read 0 and two empty panels (BUGS #73). Only the admin sees it — everyone else is sent to Patients after signing in.

| | Answer |
|---|---|
| **A** *(recommended for the release)* | **Remove it.** The admin lands on Patients like everyone else. Nothing on screen says 0 when it isn't. |
| **B** | **Build a small admin dashboard** from figures the app already has: today's collections by mode · rows waiting to be closed · petty cash balance · fees and commissions still to pay · active patients · lab orders not yet reported. Say which tiles you want. |
| **C** | Leave it as it is. *(Not recommended: a screen of zeros reads as "nothing happened".)* |

---

### Answered — round 6

Round 6 was answered on 2026-09-25 (logged in [`PRD-v2.md` §9.0a](PRD-v2.md#90a-round-6--from-the-test-audit-answered-2026-09-25)):

- **Q-97 — the doctor fee schedule is dropped.** *"The same doctor charges differently for visits and surgery, as per the procedure."* A doctor's fee is typed when it is priced, every time.
- **Q-98 — doctor access to Finances is deferred.** No doctor has a login today; you'll scrap the existing credentials before release and design doctor access when it's needed.

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
