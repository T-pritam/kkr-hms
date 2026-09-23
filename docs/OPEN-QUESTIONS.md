# KKR HMS — Open questions

Everything still waiting on an answer, in one place. The PRD is [`PRD-v2.md`](PRD-v2.md); answered questions are logged in its §9.

**How to answer:** reply by ID, e.g. `Q-90: A`, `Q-91: as proposed`, or free text. After your answers, the PRD is updated and the questions move to its answer log.

_Last updated 2026-09-23 · **0 open**_

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

## What is being built next

No CR is blocked. In the PRD's build order (§2), what's left is:

1. **CR-01** — the own-row rule, view-all and the closed lock enforced on the server (P0).
2. **CR-05** — the ledger log: every entry in one list, simpler fetching (P0).
3. **CR-06 / CR-08** — closing entries, then retiring the day-based daily ledger (P1).
4. **CR-02 / CR-03** — petty cash, and advances for reception (P1).
5. **CR-04 / CR-07 / CR-10 / CR-13** — reception pricing and payouts, admin expenses, the finance restructure, one payout path (P2).

**Waiting on you instead:** deploying what's already built — CR-11, CR-12, CR-14, CR-15 and CR-16, on two branches with three migrations. The order and the smoke test are in [`PRD-v2.md` §8.4](PRD-v2.md#84-deploying-whats-built-cr-11-cr-12-cr-14-cr-15-cr-16).
