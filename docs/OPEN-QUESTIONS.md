# KKR HMS — Open questions

Everything still waiting on an answer, in one place. The PRD is [`PRD-v2.md`](PRD-v2.md); answered questions are logged in its §9.

**How to answer:** reply by ID, e.g. `Q-82: A`, `Q-80: as proposed`, or free text. After your answers, the PRD is updated and the questions move to its answer log.

**★ Answer these first.** They decide the patient's Net and the lab/pharmacy payouts (CR-15, CR-16): **Q-82, Q-83.**

The rest confirm how something was **built** while waiting. Each says what the app does now, and "as proposed" keeps it.

_Last updated 2026-09-22 · 11 open_

---

### Patient money (CR-15, CR-16)

**Q-82 ★ — Money collected separately for lab or medicine: whose money is it?**
When a lab or medicine charge is *Excluded*, the desk collects it now as its own payment tagged Lab or Medicine. That payment counts in the patient's total bill. Is it:
- **A** passed on to the lab or pharmacy, so it's **not** the hospital's income and doesn't count in the hospital's Net; or
- **B** the hospital's own income (for example, if the lab or pharmacy is the hospital's)?

Worked example (PRD-v2, CR-15): the total bill is ₹39,100, with a ₹9,000 medicine charge collected separately. **A** gives Net ₹19,100; **B** gives Net ₹28,100.

*Proposed:* **A**. You described the lab and pharmacy as different entities, and your point 4 counts lab/medicine as an expense only when included.

**Q-83 ★ — Paying the lab or pharmacy.**
You answered Q-61 "as proposed": included lab/medicine amounts become pending payouts to the lab or pharmacy, and paying them writes a ledger OUT, like doctor fees. What about amounts collected separately (Excluded) that get handed over (Q-82 = A)?
- **A** Track them the same way: one payout list, pending → paid.
- **B** Track only the included ones; separately collected money counts as handed over straight away.
- **C** Track no lab/pharmacy payouts at all; they're just figures ("distributing is their headache", Q-60).

*Proposed:* **A**.

**Q-81 — Unpaid doctor fees and referral commission in the Expenses tab.**
You wrote *"showing in the expense tab for all the left offs"*.
- **(a)** Paying one writes a ledger OUT. *Proposed:* yes.
- **(b)** The Expenses tab also lists the ones not paid yet, per patient, as Paid or Pending, and "money out" counts only paid ones. *Proposed:* yes.
- **(c)** For a patient's Net, they count as soon as they're priced, paid or not. *Proposed:* yes.

**Q-67 — The billing PDF given to the patient** *(you said: later)*.
*Built now:* services used and payments (with their labels), with no balance, doctor fees or referral commission.

### Built with a default — confirm or change

**Q-78 — Payment modes for collecting a lab or medicine charge.**
*Built:* any mode (Cash / UPI / Card / Bank transfer / Cheque; UPI needs a reference), dated today. Restrict it to Cash/UPI like the registration fee?

*Proposed:* keep all modes.

**Q-79 — Changing a lab or medicine charge after it's saved.**
*Built:*
- While "To collect" or "Included", it can be switched either way (**Collect now**, **Included**, **Collect separately**) by admin and reception.
- Once **Collected**, its amount can't change and it can't be deleted until its payment is deleted on the Payments tab. That puts it back to "To collect".

The alternative is that editing or deleting the charge updates or deletes its payment automatically.

*Proposed:* keep as built.

**Q-80 — Payment labels.**
*Built:*
- **Labels:** Advance · Regular · Discharge · Misc, picked by the desk (default Regular, and changeable later on the payment). Lab · Medicine · Registration are set by the app and fixed.
- **Display:** the Ledger and Payments show "12/26 Ramesh Kumar (Advance)".
- **Existing data:** the payments already recorded become Regular.
- **Discharge** is only a label; it doesn't discharge the patient.
- **Scope:** labels are on **payments**. (Your note said "patient charges"; tell me if you meant labels on charges.)

*Proposed:* keep as built.

**Q-84 — SmartPharma360.**
You said "no SmartPharma bill; place the amount directly". The Charges tab still has **Attach pharmacy bill** (SmartPharma360).
- **(a)** Hide that button (on patients and on charge sheets) until you want the integration back?
- **(b)** The 2 bills already attached have no included/excluded status and ask nothing. Leave them like that?

*Proposed:* (a) hide it; (b) leave them.

**Q-85 — X-Ray, CT and MRI.**
*Built:* only "Lab Test" moved to the new Lab category. X-Ray, CT and MRI stay in Diagnostics as the hospital's own, so they don't ask included/excluded. Are any of them done by the outside lab?

*Proposed:* keep as built.

**Q-86 — Forwarding a quote (charge sheet) with lab or medicine lines.**
*Built:* those lines arrive as "To collect", with **Collect now** and **Included** buttons on the Charges tab. Nobody is asked during a forward.

*Proposed:* keep as built.

**Q-87 — Lab and medicine charges made before this change.**
*Built:* they show no status and ask nothing (their money was handled the old way).

*Proposed:* keep as built.
