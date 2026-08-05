# Billing & Charges module

Rebuild of patient charges, temporary charge sheets, and doctor visit settlement.

---

## What was missing

**There was no charge master.** The list of chargeable things was a hardcoded array of ten
strings inside `components/patients/charges-tab.tsx`, and `patient_charges.charge_type` was
free varchar with no FK and no CHECK. Adding a service meant editing and redeploying the
app. The price was typed from memory every time, so two people billing the same thing on
the same day could and did charge different amounts.

**Nothing knew how a charge accrues.** Registration is billed once; room rent, oxygen and a
nebuliser are billed per day. A twelve-day stay meant twelve identical manual entries, and
one forgotten day was invisible.

**A doctor visit had no type.** Settlement grouped visits by `doctor_id` alone and
multiplied one hand-typed rate by the count, so a doctor who consulted twice at ₹300 and
operated once at ₹5,000 came out as "3 visits" at a single rate — a figure that is wrong
whichever rate is chosen. `docs/PATIENT_DOCTOR_MODULE.md` recorded this as a known gap:
*"No per-doctor consultation fee. Settlement amounts stay hand-entered."*

**Billing assumed a package.** `base_charge` was not technically required, but the totals
formula added the referral commission to what the *patient* owed whenever the "included in
package" tick was off — which is meaningless when there is no package. The two ticks stayed
live and editable with a base charge of zero.

**Charges were not validated at all.** No required fields, no `amount > 0`, no check that
`patient_billing_id` belonged to the patient in the URL, and no role check — a lab
technician could add a ten-thousand-rupee charge to anyone. `qty` was collected by the
form, multiplied by in the totals and the PDF, and never persisted.

---

## The flow

### Placing a charge

1. Someone adds the service to the **Charge Catalogue** once, with a category, a billing
   mode and a default price. Admin only — it is the price list.
2. At the desk, **Add Charge** on the patient's Charges tab opens a picker over the
   catalogue. Choosing an entry prefills the rate, which stays editable.
3. The form's shape follows the entry's `billing_mode`:
   - `one_time` → one date, a quantity, a rate. One row.
   - `per_day` → a date range and a rate per day. **One row per day**, all sharing a
     `charge_group_id`.
4. Totals recalculate through `lib/recalculate-billing.ts`, the single place they are
   derived.

One row per day rather than one row with a span, because a rate can change mid-stay and a
single day can need removing. The cost is readability, which the **Grouped** view buys
back: it collapses each block to one line with a subtotal, expandable to the days inside.

### Charge sheets

An estimate for someone who may not be a patient yet. Reception raises one against a
registered patient *or* a walk-in, prints it, and it affects nothing — no dues, no ledger,
no billing record. An admin may then **forward** a patient sheet, which copies the lines
into `patient_charges` and stamps `forwarded_billing_id`. That stamp is the idempotency
key: a second forward is refused, so a double-click cannot bill twice.

### Doctor visits and settlement

1. Visit purposes are configured centrally (Consultation, Operation, Ward Round, …).
2. Each doctor gets a **fee schedule**: one rate per purpose. Admin only — a doctor must not
   set their own rate.
3. Recording a visit requires a purpose. The fee prefills from the schedule and stays
   editable, and whatever is agreed is snapshotted onto the visit.
4. **Sync** rebuilds settlements grouped by **(doctor, purpose)**, seeded from the fees on
   the visits themselves. Two consultations and one operation become two settlement rows,
   priced and paid independently.

Nothing reads the rate card back after the visit is saved. Repricing the card must never
reprice a visit that has already happened.

---

## Screens

| Screen | Path | Who |
|---|---|---|
| Charge Catalogue | `/charges/catalogue` | Everyone reads; ADMIN writes |
| Charge Sheets | `/charges/sheets` | Reception raises; ADMIN forwards |
| Patient → Charges tab | `/patients/[id]` | Reception, nurse, doctor, admin |
| Patient → Doctor Visits tab | `/patients/[id]` | Same |
| Patient → Billing & Settlement tab | `/patients/[id]` | Read by all; ADMIN settles |
| Doctor fee schedule | `/doctors` → ₹ button | ADMIN only |
| Finance → Settlements | `/finances` | ADMIN, DOCTOR |

---

## Data model

```
charge_items            the price list. category + billing_mode + default_price
  └─ patient_charges    charge_item_id, plus a snapshotted charge_type and billing_mode
                        charge_group_id ties the rows one date range produced
                        source_sheet_id records a forwarded charge sheet

charge_sheets           an estimate. subject_type = patient | opd
  └─ charge_sheet_items line_total is GENERATED (unit_price * qty)
  charge_sheet_counters + next_charge_sheet_no() -> CS-000001

visit_purposes          what kinds of visit exist. `code` is the stable machine key
  └─ doctor_fee_schedule  UNIQUE (doctor_id, visit_purpose_id) — one rate per pair

patient_consultations   + visit_purpose_id, and price_per_visit repurposed as the
                        agreed fee for that visit
doctor_visit_settlements + visit_purpose_id
                        UNIQUE (patient_billing_id, doctor_id, visit_purpose_id)
                        WHERE deleted_at IS NULL
```

Two snapshot rules run through all of it. `patient_charges.charge_type` and
`charge_sheet_items.description` keep the name as it was, so a catalogue rename never
rewrites an issued bill. `patient_consultations.price_per_visit` keeps the fee as agreed,
so a rate card change never reprices history.

### Totals

`lib/recalculate-billing.ts` is the only place `total_charges` is derived:

```
total_charges = base_charge
              + patient_charges_total
              + (package && doctor_fees_included  ? 0 : total_doctor_fees)
              + (package && !commission_included  ? referral_commission : 0)

package = base_charge > 0
```

With no base charge there is no package, so both flags are ignored rather than trusted, and
the referral commission is a **payout to the referrer** — recorded, listed in Finance,
settled as a ledger debit, and not billed to the patient. Reading the flags literally in
that state would drop the doctor's fees off the bill on the strength of a package worth
zero.

---

## Roles

`lib/billing/authz.ts`. The split that matters is between *placing* a charge and *pricing*
one.

| Capability | Roles | Why |
|---|---|---|
| `charge:read` | everyone | Every tab in the patient record shows a bill |
| `charge:write` | admin, doctor, nurse, reception | Desk work; visible and reversible |
| `charge-catalogue:write` | admin | One edit changes what everything costs |
| `charge-sheet:write` | admin, doctor, nurse, reception | A quote is not money |
| `charge-sheet:forward` | admin | The moment a quote creates a due |
| `billing:write` | admin | The package and the settled flags |
| `visit-purpose:write` | admin | Settlements group on it |
| `doctor-fee:write` | admin | A doctor must not set their own rate |

---

## Fixed along the way

Rewriting these paths meant touching ten defects recorded in `BUGS.md`:

- **#17** `qty` collected, multiplied by, never saved. Every three-unit charge billed as one.
- **#18** Charges not validated at all, and no role check.
- **#24** Billing and charge writes trusted a `billing_id` from the request body.
- **#25** The settlements listing omitted the `deleted_at is null` filter.
- **#26** `doctor_visit_settlements.total_amount` left stale while `visit_count` moved.
- **#28** Sync raised the visit count on an already-settled row, changing a paid amount.
- **#29** Sync ignored `patient_billing_id`, so a second admission overwrote the first's fee.
- **#30** Sync never cleared a settlement whose last visit had been deleted.
- **#52** Every doctor payout logged against "Unknown Doctor".
- Bulk doctor payout applied one `settlement_amount` to *every* selected settlement, booking
  that amount as a separate ledger debit for each.

`#16`/`#23` were already stale when this work started — both package-flag columns exist
(added by `20260805000001`).

---

## Known gaps

- **Charge sheets are not numbered per year.** `CS-000001` runs continuously. Fine for
  short-lived working paper; revisit if they are ever archived by year.
- **Forwarding is not transactional.** PostgREST has no transactions, so the sheet is
  stamped only after the charges are written. A failure between them leaves the sheet as a
  draft with charges already on the bill — recoverable, but it needs a human.
- **`merge` and `create-manual` settlements have no purpose.** They can span several, so
  `visit_purpose_id` is nullable and those rows show "—".
- **Editing a per-day block edits one day.** There is no "reprice the whole stay" action;
  the block can be deleted and re-entered.
- **Retiring a visit purpose does not migrate its settlements.** They keep pointing at it,
  which is intended, but the fee schedule UI stops offering it.
- **No per-charge discount.** The rate is editable per charge, which covers the common case
  by hand.
