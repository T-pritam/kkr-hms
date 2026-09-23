# KKR HMS — Open questions

Everything still waiting on an answer, in one place. The PRD is [`PRD-v2.md`](PRD-v2.md); answered questions are logged in its §9.

**How to answer:** reply by ID, e.g. `Q-90: A`, `Q-91: as proposed`, or free text. After your answers, the PRD is updated and the questions move to its answer log.

_Last updated 2026-09-24 · **0 open** · every CR built_

---

## Nothing is waiting on you

Rounds 1, 2 and 3 (Q-01 … Q-87) are all answered, and the answers are logged in [`PRD-v2.md` §9](PRD-v2.md#9-open-questions).

The last round settled the patient's money for good:

- Money collected separately for lab or medicine is **passed on** to the lab or pharmacy — not the hospital's income (Q-82).
- A lab or medicine charge marked **Included** is **hospital income, not an expense**; it is recorded for the logs and to see what the patient used (Q-83).
- A lab or medicine charge can now be **collected now**, **collected later** ("collect ₹x from the patient"), or **included** (Q-87).
- The pharmacy bill attach stays as a **record only**, for a patient who wants the full bill; it touches no finance figure (Q-84).

So, for one stay: **Net = (total bill − passed on) − doctor fees − referral commission**, admin only.

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
| 🟡 On the branch | **Reqs 7, 10** (CR-07 admin expenses are general expenses, CR-10 the Finances Overview on a cash basis) — `feature/v2-ledger-desk-finance`, migration applied |

Only **CR-17** is still parked, by your own answer to Q-74: a returning patient is registered again for now.

**Round 4 (2026-09-24)** answered six more, from using the app: Q-88 (who may change a fee or
commission — replaces Q-20), Q-89 (an admin's correction amends the ledger in place), Q-90 (the
doctor visit report lives on each doctor's record), Q-91 (a dead session goes to the login page),
Q-92 (the petty cash top-up form) and Q-93 (show who is signed in).

**Worth a look when you next use it**, since these change what the screens say:

- The Finances **Overview is cash-basis now**. A doctor fee or commission counts as money out when it is *paid*, not when it is priced — so profit compares like with like for the first time. What is priced and unpaid is listed under **Still to pay** on the Expenses tab.
- The **ledger no longer takes expenses**. The desk spends from **Petty cash**; the admin records a **general expense**, which now needs a reason and keeps its payment mode and author.
- An **admin's payout is born Closed**. Correcting a settled amount no longer needs a reopen — the admin edits it and the ledger row follows (Q-89) — but *reversing* one still does, because deleting a debit is a different act from restating it.
