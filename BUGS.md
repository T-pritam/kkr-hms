# Known defects

Each entry has a test that asserts the **intended** behaviour, marked `it.fails(...)` so
the suite stays green while the bug exists.

**When you fix one of these, its test starts passing — and Vitest then reports it as an
error** ("expected test to fail"). That is the signal to delete the `.fails` marker and
the entry here. The list and the suite cannot drift apart.

Status legend: 🔴 security · 🟠 correctness · 🟡 consistency

---

## Start here

14 failing-by-design tests cover the open defects below (as of the 2026-09-25 audit, which retired three that encoded rules the client had decided against and fixed the defect behind a fourth). If you fix nothing else, fix this one:

| # | What breaks | Where |
|---|---|---|
| **#1** | `verifyAuth` accepts a refresh token as an access token. | `lib/auth/verify.ts` |

**#16 and #23 were already stale and have been corrected below** — both
`*_included_in_package` columns exist (added by
`supabase/migrations/20260805000001_patient_billing_package_flags.sql`) and were verified
against the live database. The billing subsystem rebuild
(`docs/BILLING_CHARGES_MODULE.md`) then resolved **#17, #18, #24, #25, #26, #28, #29, #30
and #52**; those entries are marked resolved rather than deleted, because the tests that
document them are now ordinary passing tests worth keeping.

The class of bug #16 and #23 belonged to — **the code and the live schema disagreeing** —
is what `tests/helpers/schema.ts` exists to catch. It is a dump of the real column list,
and the fake client validates every query against it, so a route referencing a column the
database does not have fails loudly instead of silently.

---

## Section 1 — Auth & RBAC

### 🔴 #1 — `verifyAuth` accepts a refresh token as an access token
**Where:** `lib/auth/verify.ts:20`
**Test:** `tests/unit/verify-auth.test.ts` → "should reject a refresh token presented as an access token"

`verifyAuth` verifies the signature but never inspects `payload.type`. Every route that
authenticates through it (all of `app/api/patients/**`, `app/api/doctor-settlements/**`)
therefore accepts a 7-day refresh token wherever a 10-minute access token is expected.
`middleware.ts:29` does check `type === 'access'`, so the two halves of the codebase
disagree about what a valid token is.

**Fix:** add `if (payload.type !== 'access') return { isValid: false, ... }`.

---

### 🔴 #3 — Changing a password does not invalidate existing sessions
**Where:** `app/api/auth/change-password/route.ts:94`
**Test:** `tests/api/auth/change-password.test.ts` → "should invalidate existing sessions after a password change"

After a password change — including one driven by a *forgotten-password* reset — every
previously issued access and refresh token stays valid for its full lifetime (up to 7
days). Someone who has stolen a session keeps it even after the victim resets.

**Fix:** clear the auth cookies on success, and ideally add a `token_version` column to
the user row that `verifyToken` checks.

---

### 🔴 #4 — `check: true` is evaluated too late, and only truthiness is tested
**Where:** `app/api/auth/change-password/route.ts:61`
**Test:** `tests/api/auth/change-password.test.ts` → "should not change the password when check is present but falsy"

The validate-only branch sits *after* the password-length gate, which is why
`app/change-password/page.tsx:41` has to send the dummy password `'testtestt'` just to
ask whether a reset link is still valid. Any request where `check` is present but falsy
falls straight through and sets the user's password to that dummy string.

**Fix:** handle validation before the password checks — ideally as its own endpoint —
and branch on `check !== undefined`.

---

### 🔴 #5 — Search terms are interpolated into a PostgREST filter
**Where:** `app/api/admin/users/route.ts:33` (same pattern at `app/api/patients/route.ts` and `app/api/doctors/route.ts`)
**Test:** `tests/api/auth/admin-users.test.ts` → "should handle a search term containing a comma"

```ts
query.or(`username.ilike.%${search}%,email.ilike.%${search}%,role.ilike.%${search}%`)
```

`search` is user input spliced into the filter grammar. A comma starts a new OR term and
a parenthesis opens a new group, so a crafted term rewrites the query — at minimum
returning wrong rows, at worst filtering on columns the caller was never meant to reach.

**Fix:** strip or escape `,`, `.`, `(`, `)` and `:` from `search` before building the
expression.

---

### 🔴 #6 — `PATCH /api/admin/users/[id]` writes the request body verbatim
**Where:** `app/api/admin/users/[id]/route.ts:110`
**Tests:** `tests/api/auth/admin-users.test.ts` → "should refuse to promote a user to ADMIN", "should refuse to overwrite password_hash directly"

```ts
.update({ ...body, updated_at: ... })
```

No allowlist. Any admin can set `password_hash`, `needs_password_change`, `id`, or
`role: 'ADMIN'` — note that `PUT` on the same resource *does* block the admin promotion,
so the two verbs enforce different rules.

**Fix:** destructure the four fields `PUT` allows and apply the same role guard.

---

### 🔴 #9 — Any signed-in user can hard-delete a patient
**Where:** `app/api/patients/[id]/route.ts:194` — and no role check anywhere in the file
**Test:** `tests/api/patients/patients.test.ts`

`DELETE /api/patients/[id]` has no role check and no dependency check. In the live
database the foreign keys from billing, charges, consultations and case sheets would
reject the delete, so the practical result is a 500 rather than data loss — but the route
offers no protection of its own and no useful error.

---

### 🟡 #10 — `pageSize` is unbounded
**Where:** `app/api/patients/route.ts:21`
**Test:** `tests/api/patients/patients.test.ts`

`?pageSize=100000` returns the whole table in one response. The lab endpoints cap theirs
at 100; this one does not.

---

### 🟡 #11 — Creating a patient does not return the patient
**Where:** `app/api/patients/route.ts:160`
**Test:** `tests/api/patients/patients.test.ts`

The response is `{ message }` only, so the client cannot learn the new id and has to
re-query the list.

---

### 🟠 #12 — Editing a patient silently re-admits them
**Where:** `app/api/patients/[id]/route.ts:124`

`status: status || 'Active'` means any PUT that omits `status` — which the edit form does
— resurrects a discharged patient.

---

### 🟠 #13 — Discharged patients are never filtered out
**Where:** `app/api/patients/active/route.ts:24`

The filter is `.neq('status', 'discharge')` but the value written elsewhere is
`'Discharged'`. The two never match, so the "active patients" picker (used by the ledger
payment modal) lists everyone, discharged or not.

---

### 🟡 #14 — The join-date rule is enforced on create but not on edit
**Where:** `app/api/patients/[id]/consultations/[consultationId]/route.ts:61`

Creating a consultation before the patient's join date is rejected; editing one to that
same date is not.

---

### 🟠 #15 — One settled fee blocks deleting every visit with that doctor
**Where:** `app/api/patients/[id]/consultations/[consultationId]/route.ts:138-157`

The settled-fee guard matches on doctor + patient rather than on the consultation's own
billing cycle, so a settlement from a previous admission blocks deleting a mistaken entry
in the current one.

---

## ⚠️ Section 3 — Billing (the most serious findings)

### ✅ #16 — RESOLVED (entry was stale) — billing totals recalculate
**Resolved.** This entry was already stale when written: both columns exist, added by
`supabase/migrations/20260805000001_patient_billing_package_flags.sql` and verified against
the live database. The function's query succeeds and totals are written. The formula has
since changed — see `docs/BILLING_CHARGES_MODULE.md`: the package flags are ignored when
`base_charge` is 0, because there is then no package for anything to be included in.

**Where:** `lib/recalculate-billing.ts:14`
**Tests:** `tests/unit/recalculate-billing.test.ts` (7 cases), `tests/api/billing/charges.test.ts`, `tests/api/finances/finances.test.ts`

```ts
.select('base_charge, referral_commission_amount, referral_commission_included_in_package, doctor_fees_included_in_package')
```

**`patient_billing` has no `referral_commission_included_in_package` and no
`doctor_fees_included_in_package` column** — verified against the live database
(project `bmbbifxkjqmdqriootdw`). PostgREST rejects the query with `42703`, the function
logs and returns early, and **no total is ever written**.

Because this is the single place billing totals are derived, and every charge,
settlement, sync and billing edit calls it, `total_charges`, `patient_charges_total` and
`total_doctor_fees` are frozen at whatever they last held. Add a ₹5,000 charge and the
patient's bill does not move. The failure is silent — `console.error` only.

**Fix:** either add the two boolean columns to `patient_billing`, or drop them from the
select and from the `total_charges` formula. Then re-run the recalculation across every
existing billing record to repair the drift already in the data.

---

### ✅ #23 — RESOLVED (entry was stale) — both columns exist
**Resolved.** Same root cause as #16, and same correction: the columns exist. The billing
PATCH additionally now validates its input and checks that `billing_id` belongs to the
patient in the URL (#24).

**Where:** `app/api/patients/[id]/billing/route.ts:169-174`, `app/api/finances/summary/route.ts:100`
**Tests:** `tests/api/billing/billing.test.ts`, `tests/api/finances/finances.test.ts`

- `PATCH /api/patients/[id]/billing` **writes** both columns, so any request carrying an
  "included in package" checkbox fails outright with a 500. That is exactly what the
  billing tab sends.
- `GET /api/finances/summary` **selects** both, so the whole `patient_billing` query
  errors and every figure derived from it silently reads zero: referral commission,
  doctor fees, pending receivables and billing count. The finance overview under-reports
  income and expenses without any error reaching the screen.

**Fix:** as #16 — one decision resolves all three call sites.

---

### ✅ #26 — RESOLVED — `total_amount` is written on every path
**Resolved.** `20260808000005_consultation_visit_purpose.sql` repaired the drift already in
the data, and every write path sets `total_amount = amount_per_visit * visit_count`. It is
deliberately not a generated column: `merge` and `create-manual` set it directly.

**Correction (2026-09-25):** this entry said "every path" while one was still open —
`POST /api/patients/[id]/settlements` inserted the row without `total_amount`, and its
expected-failure test said so. It now computes it like the pricing route, and stamps
`amount_set_by`. That mattered more once the route was opened to reception (Q-19, #66): a
fee priced through it would have read as ₹0 on the patient's Overview.

**Where:** `app/api/doctor-settlements/[settlementId]/route.ts` (PUT), `app/api/patients/[id]/settlements/route.ts` (POST)
**Tests:** `tests/api/billing/patient-settlements.test.ts`, `tests/api/finances/doctor-settlements.test.ts`

---

### ✅ #17 — RESOLVED — charge quantity is persisted
**Resolved.** `qty` is in the insert and the PATCH allowlist, with a `qty >= 1` CHECK
behind it. The date-range generator depends on it.

**Where:** `app/api/patients/[id]/charges/route.ts:63-71` (and the PATCH below it)
**Test:** `tests/api/billing/charges.test.ts`

The charges form has a mandatory "Quantity" field, `recalculate-billing.ts` and the
patient PDF both compute `amount × qty`, and the column exists with a default of 1 — but
the route never includes `qty` in the insert. Every three-unit charge is billed as one.

---

### ✅ #18 — RESOLVED — charges are validated and role-checked
**Resolved.** `lib/billing/validate.ts` requires a name, `amount > 0` and `qty >= 1`;
`lib/billing/authz.ts` gates the route on `charge:write`; and the billing record is checked
against the patient in the URL. CHECK constraints back the first two in the database.

**Where:** `app/api/patients/[id]/charges/route.ts:63`
**Tests:** `tests/api/billing/charges.test.ts` (3 cases)

No required-field check, no `amount > 0`, and no verification that `patient_billing_id`
belongs to the patient in the URL. A charge with no amount, a negative amount, or one
attached to another patient's billing record is all accepted.

---

### ✅ #19 — RESOLVED — payments and the balance
**Where:** `app/api/patients/[id]/installments/route.ts`
**Tests:** `tests/api/billing/installments.test.ts`

**Zero and negative (2026-09-22, PRD v2 CR-12):** rejected before anything is written
(`lib/billing/payments.ts` `validatePayment`).

**Overpayment (superseded 2026-09-25):** there is no balance to exceed. Charges are for
internal knowledge and move no money (CR-15; the client, Q-64: *"charge has nothing to do
with the balance and patient payments"*), and the total bill *is* the payments received —
so a payment larger than the charges is simply a payment. The expected-failure test that
demanded a refusal encoded a rule the client rejected, and was replaced by one asserting
that payments are never capped by the charges.

---

### ✅ #21 — RESOLVED — editing or deleting a payment moves its ledger entry too
**Where:** `app/api/patients/[id]/installments/[installmentId]/route.ts`, `lib/billing/payments.ts`
**Tests:** `tests/api/billing/installments.test.ts` (now ordinary passing tests)

Resolved 2026-09-22 (PRD v2 CR-12). The payment and its ledger credit are one record:
the credit is always written with the payment (the optional `create_ledger_entry` is
gone), an edit updates it, a delete removes it, and a payment that never had one gets one
the first time it is edited. The ledger screen can no longer edit or delete a payment's
credit on its own (409 `LEDGER_ENTRY_IS_PAYMENT`).

---

### 🟡 #22 — A patient can end up with two billing records
**Where:** `app/api/patients/[id]/billing/route.ts:99`
**Test:** `tests/api/billing/billing.test.ts`

Nothing prevents a second billing record. The UI guards with an in-flight flag, which
does not survive two tabs or a double submit. Charges and payments then split across
records, and every consumer reads only `billings[0]`.

---

### ✅ #24 — RESOLVED — the billing id is checked against the patient
**Resolved.** Both `PATCH /api/patients/[id]/billing` and the charge routes look the
billing row up and refuse it with a 404 unless `patient_id` matches the URL.

**Where:** `app/api/patients/[id]/billing/route.ts:179`, `app/api/patients/[id]/settlements/route.ts` (PATCH)
**Tests:** `tests/api/billing/billing.test.ts`, `tests/api/billing/patient-settlements.test.ts` (#27)

Both routes act on `body.billing_id` / `body.settlement_id` without checking it belongs
to the patient named in the URL. Any admin can edit any patient's billing by supplying a
different id.

---

### ✅ #25 — RESOLVED — soft-deleted settlements are filtered out
**Resolved.** The listing applies `.is('deleted_at', null)`, matching sync and the billing
roll-up.

**Where:** `app/api/patients/[id]/settlements/route.ts` (GET)
**Test:** `tests/api/billing/patient-settlements.test.ts`

This listing omits the `deleted_at is null` filter that sync and the billing roll-up both
apply, so deleted settlements show in the settlements table and the patient PDF while
contributing nothing to the totals beside them.

---

### 🟠 #27 — Settling a doctor fee has no guard rails
**Where:** `app/api/patients/[id]/settlements/route.ts` (PATCH)
**Tests:** `tests/api/billing/patient-settlements.test.ts` (2 cases)

No ownership check (see #24), and no requirement that a settlement amount be supplied at
all — a fee can be marked paid for nothing.

---

### ✅ #28 — RESOLVED — sync leaves settled fees alone
**Resolved.** Sync skips rows already marked `settled` and reports them back in a `skipped`
array, so an admin is told the paid count and the real one have diverged rather than the
amount changing underneath them.

**Where:** `app/api/patients/[id]/settlements/sync/route.ts:87-96`
**Test:** `tests/api/billing/patient-settlements.test.ts`

Sync raises `visit_count` on a settlement that is already `settled: true`, changing an
amount that has been paid without unsettling it — unlike the pricing endpoint, which
explicitly unsettles first (and correctly so).

---

### ✅ #29 — RESOLVED — settlements are scoped to the billing cycle
**Resolved.** The lookup keys on `(patient_billing_id, doctor_id, visit_purpose_id)`, and a
partial unique index on the same triple (`WHERE deleted_at IS NULL`) makes the old state
unrepresentable.

**Where:** `app/api/patients/[id]/settlements/sync/route.ts:78-84`
**Test:** `tests/api/billing/patient-settlements.test.ts`

The existing-settlement lookup matches on patient and doctor but ignores
`patient_billing_id`, so a new billing cycle repoints the previous cycle's settlement
instead of opening its own. The earlier cycle's doctor fee is overwritten.

---

### ✅ #30 — RESOLVED — settlements with no visits are zeroed
**Resolved.** Sync walks the existing settlements as well as the visits, and zeroes any
unsettled row whose visits have all gone. Zeroed rather than deleted: an unsettled row at
zero visibly owes nothing, whereas deleting it would erase that the visits existed.

**Where:** `app/api/patients/[id]/settlements/sync/route.ts:73`
**Test:** `tests/api/billing/patient-settlements.test.ts`

The loop only walks doctors who still have consultations. Delete a doctor's last
consultation and their settlement keeps its old visit count and fee forever.

---

## Section 4 — Ledger

### ⚪ #36 — A day can be closed with unverified entries — *decided against, not a defect*

**Resolution (2026-08-04): closing warns about unverified entries; it does not block.**

Closing the day is a cash reconciliation, not a sign-off. Blocking on unverified entries
would strand a day whenever the person who verifies them is unavailable — and the Verify
button was itself unreachable until #32 was fixed, so a hard gate would have deadlocked
closing outright. `POST /api/ledger/close-day` returns `warnings.unverified_count`, the
close dialog shows it before the admin commits, and the count is persisted on the closure
row so the decision is auditable afterwards.

Covered by a passing test (`day-close.test.ts` — "warns about unverified entries rather
than blocking the close"). **Do not reopen this without changing that decision first.**

---

## Section 5 — Doctors, Settlements, Referrals, Finances

### 🟠 #44 — Division by zero in the merge maths
**Where:** `app/api/doctor-settlements/merge/route.ts:71`
**Test:** `tests/api/finances/doctor-settlements.test.ts` — "should not produce a NaN rate
when every merged settlement has zero visits"

`totalAmount / totalVisits` divides by a count that sync can legitimately leave at zero,
writing `NaN` into `amount_per_visit`.

**Fix:** treat a zero count as one, the way `payDoctorFee` in `lib/billing/payouts.ts`
already does — that is what closed the same defect (#43) on the settle path.

### 🟠 #45 — Merge does not check the doctor
**Where:** `app/api/doctor-settlements/merge/route.ts:52-60`

Merge validates that all settlements share a patient but never that they share a doctor.
Merging two doctors' rows silently reassigns every visit to `settlements[0].doctor_id`,
and the second doctor's fee disappears.

---

### 🟠 #47 / #48 — The doctor registry has no role checks and hard-deletes
**Where:** `app/api/doctors/route.ts`, `app/api/doctors/[id]/route.ts`

Any signed-in user, including a receptionist, can create, edit and delete doctors. Delete
is a hard delete with no soft-delete flag and no dependency check, even when
consultations and settlements still reference the doctor.

---

### 🟡 #51 — The finance summary computes a breakdown it never returns
**Where:** `app/api/finances/summary/route.ts:231-243`

`paymentModeBreakdown` is calculated and then omitted from the response, while
`app/finances/page.tsx:73` declares `payment_mode_breakdown` on its type — so it is always
`undefined` client-side. A `billingCount` variable is likewise computed and unused.

---

### ✅ #52 — RESOLVED — the payout names the doctor
**Resolved.** The route reads each settlement with its doctor embed *before* settling it —
which it has to do anyway, to know each row's own total — so the ledger description is no
longer built from a join-less update result.

**Where:** `app/api/finances/doctor-settlements/route.ts:209`

The ledger description reads `settlement.doctor?.name` from the result of an `.update()`
that carries no joins, so it is always undefined. Related: the settle modal sends
`settlement_amount: null`, so rows are marked paid with a null amount while the ledger
entry uses `total_amount`. This route also skips `recalculatePatientBilling` entirely.

---

## Section 6 — Employees & Salary

### ⚪ #53 — Employee and salary endpoints admit DOCTOR — *decided, not a defect*
**Where:** all of `app/api/employees/**` (`lib/employees/authz.ts`)

PRD v2 Q-06 decided it: *"Doctor … keeps payroll."* The salary screen is ADMIN and DOCTOR in
`middleware.ts`, and it is built on the employee list, so refusing DOCTOR at the API would
break the doctor's payroll screen. The staff *register* page stays admin-only at the page
level. The expected-failure test that demanded a 403 was removed (2026-09-25); the passing
test now cites Q-06.

---

### 🟡 #54 — The CSV importer is naive
**Where:** `app/api/employees/import/route.ts:36-66`
**Tests:** `tests/api/employees/employees.test.ts` (2 cases)

`split(',')` with no quote handling, so `"Kumar, Ramesh"` tears in half and shifts every
following column. There is also no duplicate detection: re-uploading the same file
silently creates a second copy of every employee. (Carriage returns are fine — values are
trimmed.)

---

### ⚪ #56 — Settling payroll writes no ledger entry — *decided, not a defect*
**Where:** `app/api/employees/salary/settle/route.ts`, `.../settle-all/route.ts`

PRD v2 §3.3 decided it: *"Salary settlement — Admin; stays in Employees."* The ledger is the
desk's receipts book — patient payments, registration fees and OPD — and since 2026-09-24
not even doctor fees or commissions write to it. Finances counts salary from
`salary_payments` (Q-36), so the two views agree by design. The expected-failure test asking
for a ledger debit was replaced (2026-09-25) by one asserting there is none.

---

## Section 7 — Lab

### 🔴 #57 — The lab module has no role checks at all
**Where:** every route under `app/api/lab-tests/**`, `app/api/test-parameters/**`, `app/api/test-results/**`

Authentication only. Any signed-in user — a receptionist included — can rewrite the price
list, change reference ranges, enter results and delete them.

---

### 🟠 #58 — Lab tests are hard-deleted with results attached
**Where:** `app/api/lab-tests/[id]/route.ts` (DELETE)

No soft delete and no dependency check, despite `is_active` existing for exactly this
purpose.

---

### 🟠 #59 — Parameter updates skip the reference-range invariants
**Where:** `app/api/test-parameters/[id]/route.ts` (PUT)

Create requires all four values when `gender_specific` is set; update enforces nothing, so
a parameter can be flipped to gender-specific with no gender ranges. Every result flagged
against it then falls back to the general range without anyone noticing.

---

### 🟠 #60 — The "critical" rule is wrong for ranges near zero
**Where:** `app/api/test-results/[id]/values/route.ts:106-108` (mirrored in `values/[valueId]/route.ts`)
**Tests:** `tests/api/lab/test-results.test.ts` (2 cases)

```ts
if (v.value < refMin * 0.5 || v.value > refMax * 1.5) flag = 'critical'
```

Multiplying the bounds only makes sense for strictly positive ranges. With `refMin = -2`,
anything in `[-2, -1)` — inside the normal range — is flagged critical. With `refMin = 0`,
"below range" and "critically below range" become the same condition, so every low result
is escalated to critical. This is a clinical-reporting error, not a cosmetic one.

**Fix:** define the critical threshold as an absolute offset or a per-parameter column.

---

### 🟡 #61 — Deleting a value reports success even when nothing matched
**Where:** `app/api/test-results/[id]/values/[valueId]/route.ts` (DELETE)

Correctly scoped by result, but returns 200 whether or not a row was found.

---

## Section 8 — Case sheets

### 🟡 #62 — The filename returned is not the filename stored
**Where:** `app/api/patients/[id]/case-sheets/upload/route.ts:34`

The route builds `${Date.now()}_${file.name}` and returns it, while the edge function
prepends a *second* timestamp and sanitises the name before storing the object. The value
handed back never matches the real R2 key.

---

### 🟡 #63 — Case sheet fields cannot be cleared
**Where:** `app/api/patients/[id]/case-sheets/[caseSheetId]/route.ts` (PATCH)

Fields are merged with `||`, so an empty string falls back to the existing value and a
discharge note can never be removed once set.

---

### 🔴 Not covered by a test: the upload edge function does not verify its caller
**Where:** `supabase/functions/upload-case-sheet/index.ts`

The function checks only that an `Authorization` header is *present* — it never validates
the JWT — and the Next.js route calls it with the **anon key**. Anyone who can reach the
function can mint presigned upload URLs for the bucket. This one needs fixing in the edge
function and cannot be exercised from the test suite.

---

## Section 9 — Found by the 2026-09-25 test audit (all resolved)

### ✅ #64 — RESOLVED — the "Handed over by" picker was always empty
**Where:** `app/api/users/route.ts`, `components/finances/given-by-picker.tsx`
**Tests:** `tests/api/finances/payout-attribution.test.ts`

Shipped 2026-09-24 reading `users.is_active`, a column `users` does not have (it has
`status`). The query failed, the picker fell back to an empty list, and the select showed
"Someone else — type the name below" while the form still sent the signed-in user's id — so
the screen and the record disagreed, and nobody could pick another user. It had no test;
the fake client rejects unknown columns, so one would have caught it. Now filters
`status = 'ACTIVE'`, and the picker always offers the signed-in user so what it shows is
what it sends. **No payout was recorded while it was broken** (checked on production).

### ✅ #65 — RESOLVED — a settled payout was still partly writable by reception
**Where:** `app/api/doctor-settlements/[settlementId]/route.ts` (PUT), `app/api/patients/[id]/billing/route.ts` (PATCH)
**Tests:** `tests/api/finances/payout-attribution.test.ts` (one case per field)

Q-88: once settled, a fee or commission is the admin's alone — *"reception can do nothing,
not even un-settle"*. Both guards watched only the price and the paid flag. So on a settled
**commission** reception could change who carried the cash, the notes, mode, reference and
date; on a settled **fee**, the mode, reference, notes, carrier, type — and the amount paid
itself, via `settlement_amount`, without the amount stamp. Every field is now compared
(a resent, unchanged value is not a change), an admin's restated amount keeps
`settlement_amount`, `total_amount` and `amount_set_by` in step, and an admin's correction
of the carrier carries its own `given_by_set_by` stamp.

### ✅ #66 — RESOLVED — one payout route still refused reception
**Where:** `app/api/patients/[id]/settlements/route.ts` (POST, PATCH)
**Tests:** `tests/api/billing/patient-settlements.test.ts`

Q-19 lets reception price and pay out doctor fees, and `create-manual`, `merge`, `sync`,
`settle` and the Finances routes all say so through `doctor-fee:write` / `payout:write`.
This route still checked for ADMIN by hand, and its tests enshrined that. It now uses the
same capabilities as its siblings.

---

## Observations that are not bugs (documented, not failing)

- **Inactive accounts are distinguishable.** `POST /api/auth/login` answers `403 "Account
  is inactive"` for a disabled account but `401 "Invalid credentials"` for an unknown
  one, so an attacker can enumerate valid addresses. This is a deliberate UX trade-off in
  most systems; the current behaviour is pinned by a passing test in `login.test.ts`.
  Change it to a generic 401 if enumeration matters more than the error message.
- **`/api/admin/*` is not covered by the middleware's admin-only list** (`/admin` does not
  prefix-match `/api/admin`). Every handler under `app/api/admin/` checks the role itself
  and answers 403, so this is defence-in-depth that is missing, not an open door. Pinned
  by a passing test in `middleware.test.ts`.
- **`POST /api/admin/users` returns 200, not 201**, for a created resource. Harmless, but
  inconsistent with the other create endpoints in the app.
