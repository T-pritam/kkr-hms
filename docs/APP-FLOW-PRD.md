# KKR HMS — App Flow PRD
### How the hospital app works today, flow by flow

| | |
|---|---|
| **Doc type** | Current-state flow specification. It describes what the app **does now**, end to end, for every role. |
| **As of** | 2026-09-25 · `main` @ `1aaae04` plus the audit fixes on `feature/v2-flow-prd-test-audit` (§12) |
| **Live at** | `https://admin.kkrhospitals.in` (Vercel, auto-deploys from `main`) · database: Supabase project `bmbbifxkjqmdqriootdw` |
| **Relationship to other docs** | [`PRD-v2.md`](PRD-v2.md) is the **change log and decision record**: why each rule exists, the client's words, every question and answer (Q-01 … Q-96). **This** document is the **map**: how the pieces fit together today. Where they differ, this one describes the app as built; the decision IDs in brackets point back to PRD-v2 for the reasoning. The older module docs (`PATIENT_DOCTOR_MODULE.md`, `LAB_MODULE.md`, `CASE_SHEET_MODULE.md`, `EMPLOYEE_MODULE.md`, `BILLING_CHARGES_MODULE.md`, `ROLES_AND_FEATURES.md`) predate the v2 money changes; their clinical sections still hold, their money sections do not. |
| **Scale** | 20 screens · 105 API routes · 52 database tables · 1,814 automated tests |

---

## Contents

1. [The app on one page](#1-the-app-on-one-page)
2. [Who uses it: the five roles](#2-who-uses-it-the-five-roles)
3. [The core journey: one patient, admission to discharge](#3-the-core-journey-one-patient-admission-to-discharge)
4. [Flows, module by module](#4-flows-module-by-module)
5. [The money model in full](#5-the-money-model-in-full)
6. [Permissions: the one rule, and the full matrix](#6-permissions-the-one-rule-and-the-full-matrix)
7. [Every status and every lock](#7-every-status-and-every-lock)
8. [Numbers, dates and formats](#8-numbers-dates-and-formats)
9. [Data map](#9-data-map)
10. [What changed recently (read this if you knew the older app)](#10-what-changed-recently)
11. [Known gaps and risks](#11-known-gaps-and-risks)
12. [Test and verification status](#12-test-and-verification-status)

**Conventions.** Roles are abbreviated **A** Admin · **D** Doctor · **N** Nurse · **R** Receptionist · **L** Lab technician. `[Q-88]` and `[CR-15]` point to the decision or change request in PRD-v2. Amounts are in rupees with paise. "The desk" means reception.

---

## 1. The app on one page

### 1.1 What it is for

A hospital back office for one hospital. Staff register patients, record what care they received, take the patient's money, pay the doctors and referrers out of it, run the lab and write the discharge summary. Payroll and the hospital's own spending are handled too, and the admin sees what the hospital made each month.

### 1.2 The modules and how they connect

```
                         ┌──────────────────────────────── PATIENT ────────────────────────────────┐
                         │                                                                          │
   Registration ───────► │  Overview (dashboard of the stay)                                        │
   (+ registration fee)  │  Doctor visits ─────► Doctor fees ──► paid out ──┐                        │
                         │  Charges (services used — internal record)       │                        │
                         │    └─ lab / medicine: "included?" ──► expense ───┤                        │
                         │  Payments (labelled) ──────────────► Ledger IN   │                        │
                         │  Referral commission ──► paid out ───────────────┤                        │
                         │  Lab orders · Pharmacy bills (records only)       │                        │
                         │  Case sheet ──► Finalise ──► patient Discharged   │                        │
                         └───────────────────────────────────────────────────┼────────────────────────┘
                                                                             │
   Charge sheets (quotes, walk-ins) ──forward──► Charges                     │
                                                                             ▼
   ┌────────────── THE DESK ──────────────┐     ┌──────────────── FINANCES (admin) ─────────────────┐
   │ Ledger: every rupee received          │     │ Money in  = patient payments + OPD receipts        │
   │   (payments, registration, OPD)       │────►│ Money out = general expenses + petty cash spent    │
   │   admin bulk-closes rows              │     │           + salary + doctor fees paid              │
   │ Petty cash: the desk's float          │────►│           + commissions paid + lab & medicine      │
   │   (desk expenses, desk advances)      │     │           + legacy ledger expenses                 │
   │ Employee advance (desk)               │     │ Profit    = in − out     Still to pay (unpaid fees) │
   └───────────────────────────────────────┘     └────────────────────────────────────────────────────┘
                                                             ▲
   Employees: register · monthly salary · advances ──────────┘
   Doctors: registry · visit report                        Lab: catalogue · orders · results · reports
   Admin panel: user accounts
```

### 1.3 The money model in one box

This is the rule the whole finance side follows. Everything in §5 is detail.

```
CHARGES       = what the patient used (room, procedures, nursing, lab, medicine…).
                An internal record only. No balance, no "due", no finance figure reads them.

TOTAL BILL    = every payment the patient made at the desk (advance, regular, discharge,
                misc, registration). This is the hospital's income from the stay.

EXPENSES      = doctor fees + referral commission + lab/medicine marked "Included".
  of the stay   Counted as soon as they are priced or marked — paid or not.

NET           = total bill − expenses                                  (admin only)

LAB/MEDICINE  "Included in the patient's payments" → the hospital owes the lab → an expense.
              "Paid directly to the lab"           → nothing is recorded at all.

THE LEDGER    = money RECEIVED at the desk only. Payouts to doctors and referrers are
                handed over by the admin directly and are NOT in the ledger.
```

### 1.4 Screens

| Screen | Path | Who |
|---|---|---|
| Login · forgot / reset password · change password | `/login` · `/reset-password` · `/change-password` | everyone |
| Dashboard *(placeholder, see §11)* | `/dashboard` | A |
| Patients list · patient record (8 tabs) | `/patients` · `/patients/[id]` | A D N R |
| Doctors list · a doctor's visit report | `/doctors` · `/doctors/[id]/visits` | A D N R (report: A D R) |
| Charge sheets (quotes) · Charge catalogue (price list) | `/charges/sheets` · `/charges/catalogue` | A D N R |
| Lab orders · Test catalogue | `/lab/orders` · `/lab/tests` | A D N R L |
| Ledger (tabs **All** / **Not closed**) | `/ledger/summary` | A D N R |
| Petty cash | `/petty-cash` | A D N R |
| Employee advance (reception) / Advance log (admin) | `/employees/advances` | A D R |
| Employee details (the register) | `/employees/details` | A |
| Employee salary (payroll) | `/employees/salary` | A D |
| Finances (tabs **Overview** / **Expenses** / **Settlements**) | `/finances` | A |
| Admin panel (user accounts) | `/admin` | A |

---

## 2. Who uses it: the five roles

| Role | Who | What the app is for, for them |
|---|---|---|
| **Admin** | Owner / manager | Everything. The only role that closes ledger rows, tops up petty cash, records general expenses, forwards quotes into charges, sees Finances and profit, and manages user accounts. |
| **Receptionist** | Front desk | Registers patients and takes the registration fee; records visits, charges and payments; prices doctor fees, sets referral commissions and **pays both out**; runs petty cash for desk spending; pays employee advances (without seeing any salary figure). Edits only its own money entries, and not once they are closed or settled. |
| **Doctor** | Consultant | Clinical records (visits, charges, case sheets, lab interpretation and authorisation) plus **payroll** (salary and advances) [Q-06]. Cannot price their own fee. |
| **Nurse** | Ward staff | Patients, visits, charges, payments, case sheets, lab orders and results. Same ledger and petty cash access as reception. |
| **Lab technician** | Lab | The lab only: catalogue, orders, results, interpretation. No money access at all. |

**Sessions.** Signing in issues a 10-minute access token and a 7-day refresh token, both in `httpOnly` cookies. While the refresh token is valid, an expired access token is renewed silently on the next click, with no reload needed [CR-19]. A dead session sends the browser to `/login?from=<where you were>` and back again after signing in. An account marked Inactive cannot sign in. A password reset forces a change at the next sign-in. The sidebar shows the signed-in user's name and role.

**Where each role lands.** After sign-in, Admin lands on the Dashboard; every other role is taken to Patients.

**Menu per role** (the sidebar, `components/layout/sidebar.tsx`):

| Menu | A | D | N | R | L |
|---|:-:|:-:|:-:|:-:|:-:|
| Dashboard | ✅ | ⚠️¹ | | | |
| Patients · Doctors | ✅ | ✅ | ✅ | ✅ | |
| Charges → Sheets · Catalogue | ✅ | ✅ | ✅ | ✅ | |
| Lab → Orders · Test catalogue | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ledger · Petty cash | ✅ | ✅ | ✅ | ✅ | |
| Employee Advance | | | | ✅ | |
| Employees → Details | ✅ | | | | |
| Employees → Salary · Advance Log | ✅ | ✅ | | | |
| Finances · Admin Panel | ✅ | ⚠️¹ | | | |

¹ Shown to Doctor but the page sends them away (to Patients from the Dashboard, and away from `/finances` and `/admin`, which are admin-only). See §11.

---

## 3. The core journey: one patient, admission to discharge

This is the path most of the app exists to serve. Each step names who does it, what gets written, and what it means for money.

```
 WHO            STEP                                   WHAT GETS WRITTEN                              MONEY MEANING
 ═══            ════                                   ═════════════════                              ═════════════
 R (or A,D,N)   ① Register the patient                  patient · bill (joined date, month)
                   fee pre-filled, ☑ Collected, cash/UPI  + "Registration" charge line                 internal
                                                          + payment (label Registration)                INCOME
                                                          + ledger IN "12/26 Ramesh Kumar (Registration)"  → Open
                   ☐ not ticked                           charge only; Payments tab shows
                                                          "Registration fee ₹100 not collected" [Collect now]
                      │
 R,A,D,N        ② Record doctor visits                   visit (doctor, purpose, date/time IST)        —
                      │
 R,A,D,N        ③ Add charges as care happens            charge rows (per day / per hour / one-off)    internal
                   lab or medicine? the app asks:
                     "Included in the patient's payments" → charge saved, marked Included            EXPENSE
                     "Paid directly to the lab/pharmacy"  → NOTHING saved                             —
                      │
 R,A,D,N        ④ Take payments as the admin directs    payment (Advance / Regular / Discharge / Misc) INCOME
                   ("take ₹10,000 today")                 + ledger IN "12/26 Ramesh Kumar (Advance)"    → Open
                      │
 R,A            ⑤ Sync visits → price doctor fees         fee rows (doctor × visit purpose)             EXPENSE
                   set the referral person + commission   commission on the bill                        EXPENSE
                      │
 everyone       ⑥ Patient ▸ Overview                      (read) total bill · expenses · Net (A only)
                      │
 A              ⑦ Ledger ▸ Not closed ▸ tick ▸ Close       rows Open → Closed (batch, note, amount)     rows lock
                      │
 R,A            ⑧ Pay the doctor / the referrer           fee/commission marked paid, with who paid,    EXPENSE PAID
                   (cash handed over by the admin)        who carried the cash, how                     (no ledger row)
                      │
 A,D,N          ⑨ Case sheet ▸ Finalise                  summary final · patient → Discharged           charges lock
                                                                                                          for reception
 A              ⑩ Month end ▸ Finances ▸ Overview        (read) money in · money out · profit
```

**What locks, and when** (the details are in §7):

| Entry | Reception may change its own until… | Admin |
|---|---|---|
| Patient, doctor, catalogue item | never locks (shared records) | always |
| Doctor visit | its doctor fee is **paid** | may still edit it; deletes it only after un-paying the fee |
| Charge | the patient is **Discharged** | always |
| Payment (and its ledger row) | its ledger row is **Closed** | reopens the row first |
| Doctor fee / referral commission (any, not just its own) | it is **settled** — then reception can do nothing | always; corrections are stamped |
| Petty cash expense | never locks | always |
| Employee advance | its salary month is **settled** | until settled |
| Charge sheet (quote) | it is **forwarded** | until forwarded |

---

## 4. Flows, module by module

### 4.1 Signing in, and staying signed in

```
/login ──► email + password ──► Inactive account? ── yes ──► refused
                                     │ no
                                     ▼
                          needs a password change? ── yes ──► /change-password
                                     │ no
                                     ▼
                          back to ?from=… (or the landing page for the role)
```

- **Forgot password** (`/reset-password`): always answers "if the address exists, a link was sent", so it cannot be used to discover accounts. The link carries a one-time token (stored only as a hash, valid one hour).
- **Admin reset** (Admin panel): sets the configured default password and forces a change at next sign-in. No email is sent; the new password is passed on in person.
- **Idle sessions** [CR-19]: after 10 minutes the access token expires; the next click renews it from the 7-day refresh token *in the same request*. An API call from a truly dead session answers `401 SESSION_EXPIRED`, and the browser goes to the login page, remembering the screen it was on.

### 4.2 Registering a patient, and the registration fee

**Who:** A D N R. **Screen:** Patients ▸ Add patient.

1. **Four required fields:** name, patient ID, gender, phone. Everything else (age or date of birth, blood group, address, emergency contact, ID proof, medical history, referred by) is optional and folded away, so a walk-in is registered in seconds.
2. **Patient ID** is pre-filled with the next number (`5/26` = the 5th patient of 2026) and stays editable for legacy numbers. Looking at the next number does not use it up; the number is taken only when the patient is saved, so two receptionists registering at once get `5/26` and `6/26`. A typed duplicate is refused.
3. **Gender has no default** (it used to default to Male). **Age** is stored as stated (`~45`) or as a date of birth; a stated age is never turned into an invented birth date.
4. **Registration fee** [CR-11]: the amount is pre-filled from the catalogue item flagged as the registration fee (₹100 today), editable (0 waives it). Below it: **☐ Collected** (unticked by default) and **Cash / UPI** (UPI needs its reference).
   - **☑ Collected** → a "Registration" charge line **and** a payment labelled *Registration*, with its ledger IN. Status: *collected*.
   - **☐ not ticked** → the charge line only. Status: *pending*. The Payments tab shows "Registration fee ₹100 not collected yet" with **Collect now** (cash or UPI).
   - **0** → nothing is charged or collected. Status: *waived*.
   - If the fee payment fails, the patient **stays registered** and the fee stays pending; nothing half-written is left behind.
5. Saving also opens the patient's **bill** (one per stay), dated to the joining date.
6. Only the admin may change the registration fee's catalogue price [Q-40].

**Status of a patient:** *Active* (under care) → *Discharged* (set only by finalising a discharge summary) · *Cancelled* (registered in error). Editing a discharged patient's phone number does not re-admit them.

**Readmission:** a returning patient is registered again as a new patient for now [Q-74]; a second bill per patient is not supported.

### 4.3 The patient record, and the Overview tab

**Screen:** `/patients/[id]` — eight tabs: **Overview** · Patient info · Doctor visits · Charges · Payments · Lab · Case sheet & discharge · Billing & settlement. A patient opens on **Overview** [CR-16].

**Overview** puts the whole stay on one screen and refreshes live as payments, charges and fees change:

| Block | Shows |
|---|---|
| This stay | patient ID, name, age/sex, status · joined date and days in hospital (or discharge date) · referral person · registration fee status |
| Money | **Total bill** (every payment, split by label) · **Expenses of this patient** (doctor fees by doctor, paid/pending · referral commission · lab & medicine the hospital pays) · **Net = total bill − expenses** *(admin only)* |
| Lab & medicine | every lab/pharmacy charge, marked **Hospital pays** or **Not decided**, with the two totals — and a button on each to change it (admin **and** reception, at any time) |
| Services used | charges by category with their total, marked *for reference — not billed against* |
| Activity | counts of visits, charges, payments, lab orders and pharmacy bills; last payment date; case sheet status |

Reception sees everything except **Net** [Q-66]. The lab & medicine block is reception's only way to see and change what the hospital owes the lab, since Finances is admin-only.

### 4.4 Doctor visits

**Who:** A D N R record; the creator or an admin edits/deletes.
**Flow:** Patient ▸ Doctor visits ▸ Add visit: doctor (active doctors only), **visit purpose** (consultation, ward round…, required), date and time (IST), notes. A new visit cannot be dated before the patient joined (an *edit* can still move it earlier — an open defect, BUGS #14).

- Visits are numbered per doctor for the patient (visit 1, 2, 3 with Dr Rao).
- **A visit locks for the desk once its doctor fee is paid** [§3.2 row 6]: reception cannot edit or delete it after the money has gone. The admin may still correct it, but can delete it only after un-paying the fee.
- Visits do **not** carry a fee. Fees are raised in bulk by *Sync visits* on the Billing tab (§4.8) [Q-21 = B].

### 4.5 Charges — what the patient used

**Who:** A D N R add; the creator or an admin edits/deletes. **Screen:** Patient ▸ Charges.

**Charges are an internal record.** They say what the patient used; they do not create a balance or a due, and no finance figure reads them [CR-15, Q-64]. The one exception is lab and medicine marked *Included* (below).

**Adding a charge:**
1. Pick an item from the **catalogue** (the price list) or type one in. Categories: Room & Bed · Medical & Nursing · Diagnostics · Procedures · Registration & Admin · Pharmacy · Lab · Other.
2. The catalogue item decides the **billing mode**:
   - **One-off** — a date, an amount and a quantity.
   - **Per day** (room rent, oxygen) — a date range; the app writes **one line per day** (up to 180 days), grouped so the block shows and deletes as one.
   - **Per hour** — pick the day and the hours (1–24); each day is its own line with its hours as the quantity.
3. **Lab or pharmacy item?** On Save the app asks, as an alert:

```
   Lab ₹3,000 — who paid for it?
   (•) Included in the patient's payments
         Nothing extra is collected. The hospital owes the lab ₹3,000,
         so it is added to Expenses in Finances.                          → charge saved, "Included"
   ( ) Paid directly to the lab
         The hospital never handled this money, so nothing is saved.       → NOTHING saved
                                                     [Save (included)] / [Record nothing]
```

   - A charge saved without an answer (an older client, or a line forwarded from a quote) is saved as **Not decided**: shown as such, and nobody's expense until someone answers.
   - The decision can be changed at any time, by admin or reception, from the Charges tab or the Overview's lab & medicine block. There is no payment behind it, so nothing locks it.
4. **Locks:** reception cannot add, edit or delete a charge once the patient is **Discharged** [Q-03 = B]. Admin can.

**Pharmacy bills (SmartPharma360):** a pharmacy bill can be looked up by its number and attached to a charge, as a **record only** for a patient who wants the full itemised bill. It touches no finance figure [Q-84].

### 4.6 Charge sheets — quotes and walk-ins

**Who:** A D N R raise and edit their own drafts; **only admin forwards**. **Screen:** Charges ▸ Charge sheets.

```
 draft ──(edit freely; owner or admin)──► forward (admin) ──► forwarded 🔒
   │                                          │
   └──► cancelled (not forwardable)           └─► every line copied onto the patient's charges
                                                  (a bill is opened if the patient has none)
```

- A sheet is an **estimate**: numbered, with lines that each keep their own date, billing mode and quantity. Raising one creates no bill, no charge and no ledger row.
- It can be for a **registered patient** or a **walk-in** (name only). A walk-in sheet cannot be forwarded — there is nobody to bill.
- **Forwarding** copies every line onto the patient's charges exactly once (a second forward is refused), tags each copy with the sheet it came from, and carries any quoted pharmacy bill across. Lab and medicine lines arrive **Not decided**: a quote is not an agreement to carry the cost [Q-86].
- A **forwarded** sheet can no longer be edited or deleted: it is where the patient's charges came from. A cancelled sheet stays editable.

### 4.7 Patient payments

**Who:** A D N R record; the creator or an admin edits/deletes. **Screens:** Patient ▸ Payments, or Ledger ▸ Add payment.

1. Amount (> 0), date (any past date is fine), mode (cash · UPI · card · bank transfer · cheque; UPI needs a reference), remarks.
2. **Label** — the desk picks: **Advance · Regular** (default) **· Discharge · Misc**. **Registration** is set by the app. The label can be changed later.
3. Saving writes **the payment and its ledger IN together** — "12/26 Ramesh Kumar (Advance)". If the ledger write fails, the payment is removed too, so a retry never double-counts [CR-12].
4. **Editing** a payment moves its ledger row with it (amount, mode, reference, date, label). **Deleting** removes both. A payment's ledger row cannot be edited or deleted from the Ledger screen; that screen links to the patient instead.
5. **Locks:** once the ledger row is **Closed** by the admin, the payment is locked for everyone; the admin reopens the row first (§4.10).
6. There is no balance to exceed: a payment is never capped by the charges.
7. Deleting the registration payment puts the registration fee back to *not collected*.

The patient's **total bill** is the sum of these payments.

### 4.8 Doctor fees — raise, price, pay out

**Who:** A R price and pay (Q-19); D N cannot (a doctor cannot price their own fee). A D R can read the payout lists.

**The shape of a fee.** A fee is **not** per visit. One fee row covers every visit of **one doctor, for one visit purpose, on one bill**. Each visit points at the row that billed it.

```
 visits ──Sync visits──► fee rows (doctor × purpose), visit counts filled in,
                          unpriced until someone prices them
            │
            ▼
   price: rate per visit  or  total ───────────► total_amount = rate × visits     (EXPENSE of the stay)
            │
            ▼
   pay out: amount handed over (default = the total), mode, reference, notes,
            HANDED OVER BY (a user, default = you; or a typed name)
            │
            ▼
   settled 🔒  ── admin only from here ──► correct (amount / carrier / details, each stamped)
                                        └► un-pay (back to unpaid; "who un-paid" is recorded)
```

1. **Sync visits** (Billing & settlement tab) creates or refreshes one row per doctor × purpose from the visits on the bill. Running it twice changes nothing. A settled row is left alone; visits recorded after it was paid go on a new row. Deleting a visit shrinks its unpaid row.
2. **Price** it: per visit or as a total, typed by the desk each time. There is no rate card: the same doctor charges differently for a consultation and a surgery, and per procedure, so the doctor fee schedule was dropped [Q-97, 2026-09-25]. The visit form collects no fee either — what a visit costs is decided here, not when it is recorded.
3. **Pay** it — from the patient's Billing tab, or in bulk from **Finances ▸ Settlements** (each selected fee is paid at its own total; one explicit amount is only allowed for a single fee). Paying less than the price makes the amount paid the new total [Q-37 b].
4. **Nothing is written to the ledger.** The admin hands the cash to the doctor directly, so the ledger never sees it [client revision 2026-09-24]. The fee row is the whole record, and Finances counts it as money out on the day it was paid.
5. **Who may change it** [Q-88]:
   - **Unpaid:** anyone at the desk (any receptionist, or the admin), whoever entered it.
   - **Paid:** the admin alone. Reception can change **nothing** — not the amount, the mode, the notes, the carrier, and not un-pay it.
6. **Who changed what.** Each fee carries a name against the three things that matter, each stamped with who last changed *that* field and when:
   ```
     Amount    ₹3,000   set by Asha, 22 Sep
     Status    Paid     marked by Asha, 24 Sep
     Given by  Ravi     recorded by Asha
   ```
7. **Un-paying** returns the fee to unpaid and clears who carried the cash; the status stamp records who reversed it. It can be refused if a newer unpaid row already exists for the same doctor and purpose.

**Also in the API, without a screen yet:** manual fee rows, merging rows, and adding or retiring visit purposes (§11).

### 4.9 Referral commission

**Who:** A R. **Screen:** Patient ▸ Billing & settlement ▸ Referral & commission.

1. Set the **referral person** (from the referrals list; the desk can add a new one) and the **commission amount**.
2. **Pay it** exactly like a doctor fee: mode, reference, notes, **handed over by** (a user, default you, or a typed name). No ledger entry.
3. Same rules as fees [Q-88]: unpaid = anyone at the desk; paid = admin only, every field. Same three stamps (amount / status / given by).
4. Bulk payment is on **Finances ▸ Settlements**.

### 4.10 The ledger — every rupee received at the desk

**Who:** A D N R read everything and add entries; **only A closes and reopens**. L has no access. **Screen:** Ledger, tabs **All** and **Not closed**.

**What is in it** — money received, and nothing else:

| Row | Where it comes from |
|---|---|
| Patient payment, labelled | Patient ▸ Payments, or Ledger ▸ **Add payment** |
| Registration fee | registration, or Payments ▸ Collect now |
| OPD receipt | Ledger ▸ **Add OPD receipt** (the only thing typed directly into the ledger) |
| *Legacy desk expenses* | 6 rows from before petty cash existed, kept as history; no new ones can be added |

**Not in it:** doctor fees and commissions (paid by the admin directly), desk spending (petty cash), admin spending (general expenses), salary and advances (Employees). The database itself refuses a doctor-fee or commission debit.

**Viewing.** Everyone sees everyone's rows [CR-05]. Default view: this month, newest first, 50 per page. Filters: date range, in/out, type, mode, added by, status, patient. The totals (in, out, net, cash in, cash out) follow the filter.

**Closing** [CR-06] — this replaced the old per-day close, verify and shift settlement:

```
 created ──► OPEN ─── admin: Not closed tab ▸ tick rows ▸ "Mark closed" ───► CLOSED 🔒
   (admin-created rows are born CLOSED)   selection bar: "12 rows · cash ₹8,400 · UPI ₹3,900"
                                          optional note + amount actually counted
               ▲                                                                │
               └──────────── admin: Reopen (a reason is required, kept on the row) ┘
```

- **Open**: the creator (reception) or an admin may edit or delete it.
- **Closed**: nobody edits it, and the payment behind it locks too, until an admin reopens it with a reason.
- Reception sees the Not closed tab read-only. There is no per-day or per-user grouping; any set of rows from any dates can be closed together.
- Backdated entries are allowed and land Open.

### 4.11 Petty cash — the desk's float

**Who:** A D N R read and add expenses; **only A tops up**. **Screen:** Petty cash.

```
  admin ──top-up "Weekly float ₹5,000, given to Priya"──► POOL ──► desk expenses ("tea, courier")
                                                               └─► advances paid by the desk (§4.12)
```

- **One shared pool** for every receptionist and shift, shown like a bank statement: date · in/out · amount · mode · reason · given to · added by · **running balance**.
- **Top-up** (admin only): amount, reason (defaults to "Weekly float"), and **given to** — a list of active receptionists only, for information [Q-92].
- **Expense**: a reason is always required. Reception adds expenses only.
- **Opening balance**: entered once, ever, by the admin.
- **No status, no closing.** The desk may fix its own rows at any time; an admin may fix any. Every change and deletion is kept in an edit history [Q-70].
- The balance may go negative (it warns, it does not block); the next top-up brings it back.
- Patient money never enters petty cash. Petty cash never enters the ledger.

### 4.12 Employee advances

**Who:** A D R pay; **reception sees no salary figures at all** [CR-03]. **Screens:** reception's **Employee Advance**, the admin's **Advance Log** (same page, `/employees/advances`).

1. Pick the employee (reception sees only code, name and designation), the amount, date, salary month and remarks. **Given by** is the signed-in user, recorded automatically.
2. **The cap:** before the month's salary is calculated, advances are capped at the base salary; after, at the calculated salary still unpaid. Reception is told only "exceeds the allowed limit, ask admin", with no figure [Q-16]. No advance can be paid against a settled month.
3. **Paid by reception** → also a **petty cash expense**, linked to the advance. **Paid by admin or doctor** → not petty cash.
4. The creator may edit or delete an advance until its salary month is settled; the petty cash entry follows it.
5. The advance log shows the month with totals per employee, filters and search, and exports to CSV and PDF.

### 4.13 Employees and payroll

**Who:** A D (payroll) [Q-06]; the register page is **A** only. Reception has no access.

- **Register:** employee code `EMP/26/007` (auto, editable), name, designation, base salary, contact and bank details, status. Deactivate rather than delete, so salary history stays. CSV import for bulk entry.
- **Monthly salary** (the salary grid): enter **days present (0–27)** and **OT days (0–3)** per employee.

```
  daily rate   = base salary ÷ 30
  regular pay  = base salary − (27 − days present) × daily rate
  OT pay       = daily rate × OT days          (only when all 27 days were attended)
  calculated   = regular pay + OT pay
  final salary = calculated − advances already paid this month      (may be negative)
```

- **Settle** one employee or the whole month (refused while any active employee has no record). A settled month locks the record and its advances. Settling writes **no ledger entry**: payroll stays in Employees, and Finances reads it from the salary records [§3.3].
- **Payslip PDF** per employee per month, with advances itemised.

### 4.14 Finances (admin)

**Who:** A only (the page). **Screen:** Finances — tabs **Overview · Expenses · Settlements**, and a month picker.

**Overview — on a cash basis** [Q-36]: *money that moved this month*.

```
 MONEY IN   = patient payments made this month (every label)
            + OPD receipts
 MONEY OUT  = general expenses (the admin's)
            + petty cash spent (one line: "Petty cash spent")          [Q-69]
            + salary (settled month: in full · unsettled: advances so far)
            + doctor fees PAID this month      ┐ read from the fee rows and bills,
            + referral commissions PAID        ┘ not the ledger
            + lab & medicine marked Included, dated this month   ← the one exception to cash basis
            + legacy ledger expenses
 PROFIT     = money in − money out        (margin = profit ÷ money in)
```

- **Why lab & medicine is the exception:** it counts from the day the charge is dated, which may be before the lab is paid. The patient's money has already come in, so the obligation belongs beside it.
- **Not in money out:** charges (internal), top-ups (moving cash between pockets), anything priced but unpaid.
- **Still to pay** [Q-81 b]: every unpaid doctor fee and commission, across all months, per patient — shown on the Expenses tab, and deliberately left out of money out.
- Each line of the breakdown opens its source: salary → the salary page, general expenses → the Expenses tab, petty cash → the petty cash log, ledger → the ledger filtered to those rows, fees and commissions → the Settlements tab, and **Lab & Medicine → a list of every patient behind it** (patient ID, name, what, date, amount, each linking to the patient) [AC-15.9].

**Expenses tab** — the admin's **general expenses**: date, type (Electric bill · Oxygen supply · Lift maintenance · Water & sanitation · Cleaning supplies · Medical equipment maintenance · Internet/telecom · Miscellaneous — which needs a detail), amount, mode, remarks (required), added by. These never touch petty cash or the ledger [CR-07].

**Settlements tab** — the unpaid doctor fees and commissions, to pay in bulk (§4.8, §4.9).

**PDFs** — income, expense breakdown and the full monthly report; every expense line, Lab & Medicine included, appears in each.

### 4.15 Lab / pathology

**Who:** see the matrix in §6. **Screens:** Lab orders (the worklist), Test catalogue, and the patient's Lab tab.

```
 Register order ──► Collect sample ──► Receive in lab ──► Enter results ──► Interpretation ──► Report
   registered         collected           received          in progress                      reported
                                                                         └──► Authorise (optional; A D)
```

- **An order** is one requisition at one visit, under one accession number (`LAB/2026/00184`), holding every test taken from that sample. For a **registered patient** (their name, age, sex and ID are frozen onto the order) or a **walk-in** (typed in). Also: referring doctor, priority, per-test price override, discount, notes.
- **Each stage is timestamped**, and all four times print on the report.
- **Results** are judged against the parameter's reference interval for the patient's age and sex: out of range flags H/L; critical values print red. Values and intervals are frozen onto the result.
- **Authorisation** is optional; editing a result afterwards drops it, so a sign-off never outlives the numbers.
- **Test catalogue:** tests, their parameters, reference intervals (by age/sex) and interpretation templates.
- Lab prices are **data only**: they reach no bill and no finance figure [Q-51].

### 4.16 Case sheet and discharge

**Who:** A D N write and finalise; everyone reads; A deletes. **Screen:** Patient ▸ Case sheet & discharge.

```
 New case sheet ──► fill in over the stay (Save draft, any number of times) ──► Save & finalise
     draft                    draft                                                 final
                                                                                      │
                                                                     patient marked Discharged
                                                                     (charges lock for reception)
```

- **One case sheet per admission**, numbered `DS/2026/00012`. The admission date is inherited from the joining date.
- **Holds:** admission and discharge, consulting doctors (pick or create inline), complaints and history, **diagnosis**, investigations, **summary** (course in hospital), condition on discharge and vitals, discharge medication (from a medicine list), advice, follow-up, and scanned pages of the paper case sheet.
- **Required to finalise:** discharge date, consulting doctors, diagnosis, summary.
- **Only finalising discharges the patient.** A final sheet can be reopened (A D N).
- **Download:** one PDF — the summary, then the chosen lab reports, then the chosen scans. Drafts print a DRAFT watermark.
- **History:** every create, edit, finalise, reopen and delete is logged — who, when, old value → new value.
- Discharge raises no final bill and checks no money [Q-52].

### 4.17 Doctors, and a doctor's visit report

**Who:** A D N R add and edit; A hard-deletes. **Screen:** Doctors.

- **Doctor record:** name, **department (required)**, qualification, registration number, contact [Q-96]. **Deactivate** rather than delete: it removes them from every picker and keeps their history. A hard delete is refused while anything still points at the doctor.
- **Visit report** (`/doctors/[id]/visits`, A D R) [CR-18]: every visit with the patient, purpose, date and fee, and — from the fee row — whether it was paid, when, by whom, how and the reference. An unbilled visit says *not billed* rather than ₹0. Four totals (visits · fees paid · still to pay · not billed), a by-purpose panel, filters (date range, paid/unpaid, purpose) and **Excel + PDF** downloads.

### 4.18 Admin panel — user accounts

**Who:** A. **Screen:** Admin panel.

- List, search and page through users; create, edit, activate/deactivate, delete; reset a password to the default (forces a change at next sign-in).
- An **Admin account cannot be created, edited or deleted** here, and nobody can delete their own account.
- The role list offers Receptionist, Nurse and Doctor (Lab technician is missing, §11).

---

## 5. The money model in full

### 5.1 Where every rupee is recorded

Three logs, and they never overlap [Q-07 = A]:

| Money | Ledger | Petty cash | General expenses | Where else | Counted in Finances as |
|---|:-:|:-:|:-:|---|---|
| Patient payment (Advance · Regular · Discharge · Misc) | **IN** | — | — | the patient's Payments | money in |
| Registration fee, collected | **IN** | — | — | Payments (label Registration) | money in |
| OPD receipt | **IN** | — | — | — | money in |
| Petty cash top-up (admin → desk) | — | **IN** | — | — | *not counted* (cash moving between pockets) |
| Desk expense | — | **OUT** | — | — | money out, as one "Petty cash spent" line |
| Advance paid **by reception** | — | **OUT** | — | the advance log | money out, inside **salary** (once) |
| Advance paid by admin / doctor | — | — | — | the advance log | money out, inside **salary** |
| Salary settlement | — | — | — | Employees | money out (**salary**) |
| General expense (admin) | — | — | **yes** | — | money out |
| Doctor fee paid | — | — | — | the fee row | money out, on the day paid |
| Referral commission paid | — | — | — | the bill | money out, on the day paid |
| Lab / medicine **Included** | — | — | — | the charge | money out, on the charge's date |
| Lab / medicine **paid directly** | — | — | — | *nowhere* | *not counted* |
| Charges (everything else) | — | — | — | the patient's Charges | *not counted* (internal) |

### 5.2 A worked example: one stay

| What happened | Amount | Patient paid | Hospital's expense | In the ledger |
|---|--:|--:|--:|---|
| Room ₹20,000 + procedures ₹9,900 (charges) | 29,900 | — | — | — *(internal)* |
| Registration fee, collected | 100 | 100 | — | IN "12/26 Ramesh Kumar (Registration)" |
| Advance | 10,000 | 10,000 | — | IN "… (Advance)" |
| Regular payment | 15,000 | 15,000 | — | IN "… (Regular)" |
| Medicine ₹9,000, **paid directly to the pharmacy** | — | — | — | — *(not recorded at all)* |
| Lab ₹3,000, **Included** in the payments above | 3,000 | — | 3,000 | — |
| Discharge payment | 5,000 | 5,000 | — | IN "… (Discharge)" |
| Doctor fees (Dr Rao) | 6,000 | — | 6,000 | — *(the admin pays directly)* |
| Referral commission | 2,000 | — | 2,000 | — *(the admin pays directly)* |
| **Totals** | | **Total bill 30,100** | **Expenses 11,000** | |

```
Total bill        30,100
− expenses        11,000   (doctor fees 6,000 + commission 2,000 + lab 3,000)
= Net             19,100   (admin only)
```

This exact example is an automated test (`tests/api/billing/patient-overview.test.ts`).

### 5.3 Two views of the same money, and why they differ

| | The patient's **Overview** | **Finances** Overview |
|---|---|---|
| Question it answers | What did this stay bring in, and what does it cost us? | What money moved this month? |
| Doctor fees / commission | counted as soon as **priced**, paid or not [Q-81 c] | counted only when **paid**, in the month paid |
| Lab & medicine Included | counted | counted, in the month of the charge |
| Payments | every payment on the stay | every payment made in the month |
| Who sees Net / profit | admin only | admin only |

A fee priced in March and paid in April is part of the stay's expenses from March, and part of April's money out.

---

## 6. Permissions: the one rule, and the full matrix

### 6.1 The rule [Req 1, CR-01]

```
Admin                                    → may do anything. A Closed ledger row must be reopened first.
Shared records (patient, doctor,
  catalogue item)                        → any receptionist may edit, whoever created it  [Q-01 = B]
Doctor fee / referral commission         → UNPAID: anyone at the desk · PAID: admin only  [Q-88]
Everything else a person creates
  (payment, charge, visit, quote,
   OPD receipt, petty cash expense,
   advance)                              → only its creator, and only until it locks
                                             not yours → 403 NOT_YOUR_ENTRY
                                             locked    → 409 ENTRY_LOCKED
```

The rule is enforced by the server, not just hidden in the screens: every write route checks it, and lists return `can_edit` on each row so buttons appear only where the action is allowed.

**Hidden from reception** [Q-05]: Finances (overview, profit, general expenses), payroll (salary, attendance, payslips), the employee register, the Admin panel, and every salary figure in the advance screens.

### 6.2 The full matrix

✅ allowed · **own** only its own entries · — not allowed

| Action | A | D | N | R | L |
|---|:-:|:-:|:-:|:-:|:-:|
| **Patients** — read | ✅ | ✅ | ✅ | ✅ | ✅ |
| register · edit · change status | ✅ | ✅ | ✅ | ✅ | — |
| delete | ✅ | — | — | — | — |
| **Doctors** — read | ✅ | ✅ | ✅ | ✅ | ✅ |
| add · edit · deactivate | ✅ | ✅ | ✅ | ✅ | — |
| hard-delete | ✅ | — | — | — | — |
| **Doctor visits** — record | ✅ | ✅ | ✅ | ✅ | — |
| edit · delete (until its fee is paid) | ✅ | own | own | own | — |
| **Charges** — read | ✅ | ✅ | ✅ | ✅ | ✅ |
| add · edit · delete (until discharge) | ✅ | own | own | own | — |
| lab / medicine: included or not, at any time | ✅ | ✅ | ✅ | ✅ | — |
| **Charge catalogue** — edit | ✅ | — | — | ✅ | — |
| the registration-fee item | ✅ | — | — | — | — |
| **Charge sheets** — raise · edit own draft | ✅ | own | own | own | — |
| forward into charges | ✅ | — | — | — | — |
| **Payments** — record | ✅ | ✅ | ✅ | ✅ | — |
| edit · delete (until its ledger row is closed) | ✅* | own | own | own | — |
| **Doctor fees** — sync visits · price · pay out (unpaid) | ✅ | — | — | ✅ | — |
| change a paid fee · un-pay | ✅ | — | — | — | — |
| **Referral commission** — set · pay (unpaid) | ✅ | — | — | ✅ | — |
| change a paid commission · un-pay | ✅ | — | — | — | — |
| add a referral person | ✅ | ✅ | ✅ | ✅ | — |
| **Payout lists** · doctor visit report | ✅ | ✅ | — | ✅ | — |
| **Ledger** — read all · add OPD receipt | ✅ | ✅ | ✅ | ✅ | — |
| edit · delete an OPD receipt (until closed) | ✅* | own | own | own | — |
| close · reopen rows | ✅ | — | — | — | — |
| **Petty cash** — read · add expense | ✅ | ✅ | ✅ | ✅ | — |
| edit · delete an expense (any time) | ✅ | own | own | own | — |
| top up · opening balance | ✅ | — | — | — | — |
| **Employee advance** — pay · see the log | ✅ | ✅ | — | ✅ | — |
| edit · delete (until the month is settled) | ✅ | own | — | own | — |
| see salary figures and advance limits | ✅ | ✅ | — | — | — |
| **Employees** — register (page) | ✅ | — | — | — | — |
| salary · settle · payslips | ✅ | ✅ | — | — | — |
| **Finances** (page) · general expenses | ✅ | — | — | — | — |
| **Lab** — read catalogue and orders | ✅ | ✅ | ✅ | ✅ | ✅ |
| register · collect · receive an order | ✅ | — | ✅ | ✅ | ✅ |
| enter results | ✅ | — | ✅ | — | ✅ |
| write the interpretation | ✅ | ✅ | ✅ | — | ✅ |
| authorise a report | ✅ | ✅ | — | — | — |
| edit the test catalogue | ✅ | — | — | — | ✅ |
| **Case sheets** — read · download | ✅ | ✅ | ✅ | ✅ | ✅ |
| write · finalise · reopen · medicine list | ✅ | ✅ | ✅ | — | — |
| delete | ✅ | — | — | — | — |
| **Admin panel** (user accounts) | ✅ | — | — | — | — |

\* An admin edits a Closed row only after reopening it.

---

## 7. Every status and every lock

```
PATIENT            Active ──(case sheet finalised)──► Discharged          Cancelled (registered in error)
                     charges lock for reception once Discharged

BILL (one/stay)    registration fee:  pending ──► collected   ·   waived (amount 0)
                                          ▲──── payment deleted ────┘

PAYMENT + LEDGER   Open ──(admin: Mark closed)──► Closed 🔒 ──(admin: reopen + reason)──► Open
                   admin-created rows are born Closed

LAB / MEDICINE     Not decided ◄──────► Included (= the hospital's expense)
  CHARGE             (either way, any time, admin or reception)
                   "Paid directly" → never saved at all

DOCTOR FEE /       Unpaid (anyone at the desk may change it) ──(pay)──► Paid 🔒 (admin only)
COMMISSION                              ▲──────────── un-pay (admin) ──────────┘

DOCTOR VISIT       editable by its creator ──(its fee is paid)──► locked

CHARGE SHEET       draft ──(admin: forward)──► forwarded 🔒      draft ──► cancelled

PETTY CASH ENTRY   no status, never locks (every change kept in history)

ADVANCE            editable by its creator ──(salary month settled)──► locked

SALARY RECORD      pending ──(settle)──► settled 🔒

LAB ORDER          registered ► collected ► received ► in progress ► reported
LAB RESULT         pending ► results entered ► authorised (editing a result drops the authorisation)

CASE SHEET         draft ──(finalise)──► final ──(reopen)──► draft
```

---

## 8. Numbers, dates and formats

| Thing | Format | Notes |
|---|---|---|
| Patient ID | `5/26` | serial / 2-digit year; restarts each January; editable; unique |
| Employee code | `EMP/26/007` | issued by a locked counter; editable |
| Lab accession | `LAB/2026/00184` | one per order |
| Discharge summary | `DS/2026/00012` | one per case sheet |
| Charge sheet | `CS-000123` | one per quote |
| Payment in the ledger | `12/26 Ramesh Kumar (Advance)` | patient ID, name, label |
| Dates | **India time (IST)** everywhere | "today" and "this month" are IST days; a 00:30 visit files under its own IST day [CR-14] |
| Money | rupees **with paise** everywhere [Q-50] | PDFs print `Rs.1,250.00` (the PDF font has no ₹ sign) |
| Payment modes | cash · UPI · card · bank transfer · cheque | UPI always needs its reference |

---

## 9. Data map

```
users ─┬─ created_by / updated_by / closed_by / settled_by / …  (attribution on every money row)

patients ──1:N── patient_billing (a bill per stay) ──1:N── patient_billing_installments (payments)
   │                    │                                         └──1:1── daily_ledger_transactions (IN)
   │                    ├──1:N── patient_charges ──► charge_items (the catalogue)
   │                    │           └── lab_medicine_status: included | NULL
   │                    ├──1:N── doctor_visit_settlements (fee rows) ◄── patient_consultations (visits)
   │                    │           ──► doctors, visit_purposes
   │                    └── referral commission, referral person (patients.referred_by ──► referrals)
   ├──1:N── patient_case_sheets ──► case_sheet_doctors, medicines, attachments, record_audit_log
   ├──1:N── lab_orders ──1:N── lab_order_items ──► lab_tests ──► parameters, reference ranges
   └──1:N── pharmacy_bills (records only)

charge_sheets ──1:N── charge_sheet_items          (quotes; forwarded into patient_charges)

daily_ledger_transactions ──► ledger_close_batches (closing)
petty_cash_entries ──► petty_cash_entry_history · ──1:1── advances (desk-paid)
employees ──1:N── salary_payments · advances
expenses (general expenses)

frozen history, no screen: daily_ledger_closures · daily_ledger_shift_settlements
```

---

## 10. What changed recently

If you knew the app before September 2026, these are the rules that moved. Each is decided; the reasoning and the client's words are in PRD-v2.

| Was | Now | Since |
|---|---|---|
| Charges added up to a bill with a **balance** and a base **package** | Charges are an internal record; the **total bill is the payments** | 2026-09-22 [CR-15] |
| Ledger: one day at a time; reception saw only its own rows; Verify + shift settle + day close | Ledger is a log of all rows; admin **bulk-closes** rows; one Open → Closed status | 2026-09-23 [CR-05, 06, 08] |
| Desk expenses were ledger debits | Desk spending is **petty cash**; the admin's is **general expenses** | 2026-09-23 [CR-02, 07] |
| Advances were admin/doctor only | **Reception pays advances**, from petty cash, without seeing salaries | 2026-09-23 [CR-03] |
| Doctor fees and commissions were admin-only; whoever set a price owned it | **Reception prices and pays** them; unpaid = anyone at the desk, paid = admin only | 2026-09-23/24 [CR-04, Q-88] |
| Lab/medicine: *Excluded* = collected as its own payment; *Included* = the hospital's income | *Included* = the hospital's **expense**; *paid directly* = **not recorded at all** | 2026-09-24 [Q-82, Q-83] |
| A doctor fee or commission payout wrote a ledger OUT | **No ledger entry**: the admin hands the money over directly; the fee row is the record | 2026-09-24 [CR-13] |
| "Given by" was free text on commissions and missing on doctor fees | A **user picker** on both, plus who changed the amount, the status and the carrier | 2026-09-24 |

---

## 11. Known gaps and risks

Ordered by how much they matter.

| # | Gap | Effect | Status |
|:-:|---|---|---|
| 1 | 🔴 **The database is open to anyone holding the browser's key.** Row-level security is off on all 52 tables, the anon role may read, insert, update and delete 50 of them — including `users` (password hashes), patients, payments and salaries — and that key is in the browser (the live-refresh feature uses it). | Anyone with the key can bypass every rule in §6 by calling the database directly. None of the app's tests can protect against this. | Known since before v2 (old release note #8). Fixing it means moving the server to the service-role key, revoking the anon grants, and giving live refresh its own narrow access. **Needs a decision and its own piece of work.** |
| 2 | 🟠 **Visit purposes have no screen.** Q-72 decided they would be managed "now", and the API allows it (admin, reception), but no page can add, rename or retire one. | The list is stuck at what was seeded; a new kind of visit needs a database change. | Gap against a decided requirement. |
| 3 | 🟠 **14 open defects**, each pinned by an expected-failure test (BUGS.md): among them a refresh token accepted as an access token (#1), sessions surviving a password change (#3), user-admin search and update weaknesses (#5, #6), a patient deletable with billing attached (#9), a visit edit that can predate joining (#14), a second bill openable for one patient (#22), a settlement payable against another patient's id (#27), merge maths (#44, #45), the CSV importer (#54). | Varies; the security ones (#1, #3–#6) matter most. | Documented and tested; not fixed. |
| 4 | 🟡 The **Dashboard** is a placeholder (every tile reads 0), and only the Admin ever sees it. | Nobody gets a useful landing page. | — |
| 5 | ⚪ The sidebar offers **Doctor** the Dashboard, Finances and Admin Panel, and each page sends them away. | None today: **no doctor has a login** [Q-98]. | **Deferred by the client:** doctor access will be designed when doctors are given logins; existing credentials are to be scrapped before the client release. |
| 6 | 🟡 **Lab technician accounts cannot be created** in the Admin panel (the role is missing from the list). | Lab logins need a database insert. | — |
| 7 | 🟡 **Manual fee rows and merging fee rows** exist only in the API [Q-72: "later"]. | — | Decided as later. |
| 8 | 🟡 On a phone, the advance log's "Given by" shows "—" for new advances; the desktop view shows the name as "Recorded by". | The person who gave the advance isn't visible on mobile. | Small screen fix. |
| 9 | ⚪ Lab prices reach no bill [Q-51]; discharge raises no final bill [Q-52]; salary is not in the ledger [§3.3]; no refunds or receipts [Q-73]; a returning patient is registered again [Q-74]. | — | **Decided**, not defects. |

---

## 12. Test and verification status

As of 2026-09-25, on `feature/v2-flow-prd-test-audit`:

| Check | Result |
|---|---|
| Automated tests | **61 files · 1,814 tests · 1,800 pass · 14 expected failures** (the open defects in §11 #3) · **0 unexpected failures**, stable across two full runs |
| Line coverage (API, `lib/`, middleware) | **82%** overall · billing 94% · finances 95% · ledger 91% · petty cash 96% · auth & middleware 97–98% · lowest: pharmacy integration 0–17%, lab API 64%, charge-sheet pharmacy routes 64% |
| Type check (`tsc`) | clean |
| Production build (`next build`) | passes |
| Lint (`eslint`) | 795 errors repo-wide, **all pre-existing** — 98% are `no-explicit-any`; the build does not run lint. This round added none. |
| API routes with **no** test | 11, all in the baseline lab, pharmacy and case-sheet modules (no v2 rule depends on them): lab interpretation templates and reference-range edits, pharmacy-bill attach and preview, charge-sheet pharmacy bills, the patient lab-orders list, a case-sheet attachment download, the next employee code |

**What the audit on 2026-09-25 changed.** Every test was checked against the decided rules. Three expected-failure tests demanded behaviour the client had decided against (an "outstanding balance" check, payroll in the ledger, refusing the doctor's payroll list) and were replaced by tests of the decided rule. Writing the missing tests for the v2 requirements then exposed six defects, all fixed and each now pinned by a test that fails without the fix:

- the **Given-by picker was empty in production** (it read a column the users table does not have);
- a **paid fee or commission was still partly editable by reception**, including a paid fee's amount — against Q-88;
- one payout route still **refused reception**, against Q-19;
- a fee raised through that route **counted as ₹0** (no total);
- the **monthly Finance PDF printed "undefined"** in one of its boxes;
- a **paid doctor visit could still be edited by reception** (moved to another doctor or purpose), against §3.2 row 6 — only deleting it was refused.
