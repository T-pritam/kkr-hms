# KKR HMS — Patient Workflow Documentation

> Covers the full lifecycle: Registration → Consultations → Charges → Billing → Payments → Doctor Settlements → Case Sheets → Lab Results

---

## 1. Patient Registration

**Route:** `POST /api/patients`  
**Page:** `/patients`

- Create a patient with a unique `patient_id` (auto-suggested or manual), name, phone, gender, DOB, address, join date, referred_by, emergency contact, medical history, allergies, current medications.
- `status` defaults to `Active`.
- List view supports paginated search by name, patient_id, or phone.
- Edit (`PUT /api/patients/[id]`) updates any field; patient_id uniqueness is re-validated.
- Delete (`DELETE /api/patients/[id]`) hard-deletes the patient record.

---

## 2. Doctor Consultations

**Route:** `POST /api/patients/[id]/consultations`  
**Page:** `/patients/[id]` → Doctor Visits tab

- Record a doctor visit: select doctor, set date, price per visit, notes, and optionally link to a billing cycle.
- `visit_number` is auto-incremented per doctor per patient.
- Visit date must be on or after patient join date.
- Consultations are soft-deleted (`deleted_at`); GET excludes deleted records.
- Each consultation can be linked to a `billing_id` for settlement grouping.

---

## 3. Billing Cycle (Admission / IPD Episode)

**Route:** `POST /api/patients/[id]/billing`  
**Page:** `/patients/[id]` → Billing & Settlement tab

- A billing record represents one care episode (e.g., admission).
- Fields: `base_charge` (bed/room/facility fee), `referral_commission_amount`, optional `referral_id`.
- Billing aggregates:
  - **Base Charge** — room/facility fee
  - **Doctor Fees** (`total_doctor_fees`) — sum of all linked doctor visit settlements
  - **Other Charges** (`patient_charges_total`) — miscellaneous charges
  - **Total Charges** = Base + Doctor Fees + Other Charges
  - **Total Paid** (`patient_paid_amount`) — auto-recalculated from installments
  - **Balance** = Total Charges − Total Paid
- Admin can update base charge, referral commission, and referral settlement info via `PATCH`.

---

## 4. Additional Charges

**Route:** `POST /api/patients/[id]/charges`  
**Page:** `/patients/[id]` → Charges tab

- Add line-item charges against a billing: charge type (e.g., medicine, procedure, consumable), description, amount, date, quantity.
- Charges are linked to a `billing_id`.
- `patient_charges_total` on the billing record is updated accordingly.
- GET supports filtering by `billing_id`.

---

## 5. Doctor Visit Settlements

**Route:** `POST /api/patients/[id]/settlements`  
**Page:** `/patients/[id]` → Billing & Settlement tab

- Summarises how many visits a doctor made during a billing episode and the fee owed.
- Fields: `doctor_id`, `visit_count`, `amount_per_visit`, optional total override.
- `total_amount = visit_count × amount_per_visit` (or explicit total).
- Admin `PATCH` marks a settlement as **settled**: records `settlement_amount`, `payment_method`, `transaction_reference`, `settlement_date`.
- Settlements can be **merged** (2+ settlements for same patient → one record, visit counts summed).
- Admin can create manual settlements via `POST /api/doctor-settlements/create-manual`.
- Bulk settling via `POST /api/doctor-settlements/settle` (single or multi-select).
- Soft-delete supported; hard-delete available for Admins.

---

## 6. Payment Installments

**Route:** `POST /api/patients/[id]/installments`  
**Page:** `/patients/[id]` → Payments tab

- Record patient payments against a billing in one or more installments.
- Fields: `amount`, `payment_date`, `payment_method` (cash/card/UPI/etc.), `transaction_reference`, `remarks`.
- `installment_number` is auto-incremented per billing.
- On each installment POST, `patient_paid_amount` on the billing is recalculated.
- Optionally creates a corresponding **daily ledger credit transaction**.

---

## 7. Case Sheets & Discharge

**Route:** `POST /api/patients/[id]/case-sheets`  
**Page:** `/patients/[id]` → Case Sheet tab

- Attach clinical notes and a discharge summary to a patient billing episode.
- Fields: `discharge_date`, `discharge_notes`, `case_sheet_url` (file upload link), `case_sheet_filename`, `patient_billing_id`.
- Multiple case sheets can be linked to a single patient (e.g., multiple admissions).
- GET returns all case sheets ordered by creation date (newest first).

---

## 8. Lab Test Results (Patient Context)

**Route:** `GET /api/patients/[id]/test-results`  
**Page:** `/patients/[id]` → Lab Results tab

- View all lab tests ordered for this patient, paginated.
- Each result includes: test name, code, category, ordered date, status, reference doctor, verifying user.
- Full result entry and verification is done from the Lab module (see Lab section in app-functionality.md).

---

## 9. Referrals (Patient Context)

- Referral agents are managed globally (see Referral Management in app-functionality.md).
- During billing creation, a `referral_id` is optionally linked.
- `referral_commission_amount` is stored on the billing record.
- Admin marks referral commission as settled (`referral_settled = true`) with `referral_settlement_date`, `referral_settlement_payment_method`, and `referral_transaction_ref` via `PATCH /api/patients/[id]/billing`.

---

## Billing Summary Formula

```
Total Charges = Base Charge + Total Doctor Fees + Other Charges (patient_charges_total)
Balance       = Total Charges − Total Paid (patient_paid_amount)
```

---

## Role Permissions Summary

| Action | ADMIN | DOCTOR | NURSE | RECEPTIONIST |
|---|---|---|---|---|
| Register / Edit patient | ✅ | ✅ | ✅ | ✅ |
| Add consultation | ✅ | ✅ | ✅ | ✅ |
| Add/view charges | ✅ | ✅ | ✅ | ✅ |
| Add payment installment | ✅ | ✅ | ✅ | ✅ |
| Create/view billing | ✅ | ✅ | ✅ | ✅ |
| Update billing (base charge, referral) | ✅ | — | — | — |
| Create/view doctor settlements | ✅ | ✅ | ✅ | ✅ |
| Mark settlement as settled | ✅ | — | — | — |
| Merge / delete settlements | ✅ | — | — | — |
| Upload case sheet | ✅ | ✅ | ✅ | ✅ |
| Delete patient | ✅ | — | — | — |
