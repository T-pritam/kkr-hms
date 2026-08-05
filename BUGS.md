# Known defects

Each entry has a test that asserts the **intended** behaviour, marked `it.fails(...)` so
the suite stays green while the bug exists.

**When you fix one of these, its test starts passing — and Vitest then reports it as an
error** ("expected test to fail"). That is the signal to delete the `.fails` marker and
the entry here. The list and the suite cannot drift apart.

Status legend: 🔴 security · 🟠 correctness · 🟡 consistency

---

## Start here

46 failing-by-design tests cover the defects below. If you fix nothing else, fix these three:

| # | What breaks | Where |
|---|---|---|
| **#16** | **Billing totals are never recalculated** — the function dies on a missing column, silently. Add a charge and the bill does not move. | `lib/recalculate-billing.ts:14` |
| **#23** | The same missing columns 500 the billing editor and zero out the finance summary's commission, doctor fees and receivables. | `billing/route.ts:169`, `finances/summary/route.ts:100` |
| **#49** | `/api/referrals` has **no authentication** on either verb. | `app/api/referrals/route.ts` |

Three of these (#16, #23, #26) come from the same root cause: **the code and the live
schema disagree**. `patient_billing` has no `*_included_in_package` columns, and
`doctor_visit_settlements.total_amount` is a plain column nothing computes. The test
suite validates every query against the real column list in `tests/helpers/schema.ts`,
so this class of bug now fails loudly instead of silently.

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

### 🟡 #2 — `GET /api/auth/me` returns fewer fields than the client expects
**Where:** `app/api/auth/me/route.ts:18`
**Test:** `tests/api/auth/me-logout.test.ts` → "should return the username the client context expects"

The route echoes three JWT claims (`id`, `email`, `role`). `contexts/user-context.tsx`
types the response as the full `User`, so `username`, `status` and `needsPasswordChange`
are silently `undefined` everywhere the context is consumed.

**Fix:** either load the user row and return those fields, or narrow the context type.

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

### 🔴 #7 — The token-refresh branch skips every check below it
**Where:** `middleware.ts:46-58`
**Tests:** `tests/api/auth/middleware.test.ts` → "should still enforce admin-only paths while refreshing the access token", "should still bounce a refreshing user off the login page"

When the access token has expired and a valid refresh token is present, the middleware
mints a new access token and `return`s immediately — before the signed-in redirect and
before the admin-only path check. A non-admin whose access token has just expired gets
one unguarded request into `/finances`, `/employees` or `/admin`. It recurs every 10
minutes, for as long as the refresh token lives.

**Fix:** set the cookie on the response and fall through to the checks instead of
returning early.

---

### 🟠 #8 — The refreshed cookie outlives the token inside it
**Where:** `middleware.ts:51`
**Test:** `tests/api/auth/middleware.test.ts` → "should give the refreshed cookie the same lifetime as the token it carries"

The refreshed cookie is set with `maxAge: 20 * 60` while `generateAccessToken` mints a
10-minute JWT. For the last 10 minutes the browser holds a cookie that every endpoint
rejects, and `middleware.ts` only re-refreshes on a request that carries a *valid*
refresh token — so the user sees spurious redirects to `/login`.

**Fix:** use `maxAge: 10 * 60`, matching `ACCESS_TOKEN_EXPIRY`.

---
## Section 2 — Patients & Consultations

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

### 🔴 #16 — Billing totals are never recalculated. The function is dead.
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

### 🔴 #23 — The same two missing columns break billing edits and the finance summary
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

### 🟠 #26 — `doctor_visit_settlements.total_amount` is nothing but a stale number
**Where:** `app/api/doctor-settlements/[settlementId]/route.ts` (PUT), `app/api/patients/[id]/settlements/route.ts` (POST)
**Tests:** `tests/api/billing/patient-settlements.test.ts`, `tests/api/finances/doctor-settlements.test.ts`

The column is a plain nullable numeric in the live schema — **no generated expression and
no trigger** (confirmed: `information_schema.columns.is_generated = 'NEVER'`, and the
database has no triggers at all). Only `create-manual` and `merge` ever set it.

So: `sync` creates settlements with `total_amount` null, and the pricing endpoint changes
`amount_per_visit` and `visit_count` without touching it. Meanwhile the billing roll-up
sums precisely that column, and the finance summary's "pending doctor fees" reads it too.

**Fix:** make it a generated column (`visit_count * amount_per_visit`), or write it
explicitly everywhere pricing changes.

---

### 🟠 #17 — Charge quantity is collected, multiplied by, and never saved
**Where:** `app/api/patients/[id]/charges/route.ts:63-71` (and the PATCH below it)
**Test:** `tests/api/billing/charges.test.ts`

The charges form has a mandatory "Quantity" field, `recalculate-billing.ts` and the
patient PDF both compute `amount × qty`, and the column exists with a default of 1 — but
the route never includes `qty` in the insert. Every three-unit charge is billed as one.

---

### 🟠 #18 — Charges are not validated at all
**Where:** `app/api/patients/[id]/charges/route.ts:63`
**Tests:** `tests/api/billing/charges.test.ts` (3 cases)

No required-field check, no `amount > 0`, and no verification that `patient_billing_id`
belongs to the patient in the URL. A charge with no amount, a negative amount, or one
attached to another patient's billing record is all accepted.

---

### 🟠 #19 — Payments are not validated either
**Where:** `app/api/patients/[id]/installments/route.ts:74`
**Tests:** `tests/api/billing/installments.test.ts` (2 cases)

Nothing compares the payment against the outstanding balance, and nothing rejects a zero
or negative amount. Overpayment produces a negative balance everywhere it is displayed.

---


### 🟠 #21 — Editing or deleting a payment leaves the ledger entry behind
**Where:** `app/api/patients/[id]/installments/[installmentId]/route.ts`
**Tests:** `tests/api/billing/installments.test.ts` (2 cases)

Both verbs re-sum `patient_paid_amount` but never touch the ledger credit created
alongside the payment. The two records drift apart, and because no reference is stored
linking them, there is no way to find the orphan afterwards.

---

### 🟡 #22 — A patient can end up with two billing records
**Where:** `app/api/patients/[id]/billing/route.ts:99`
**Test:** `tests/api/billing/billing.test.ts`

Nothing prevents a second billing record. The UI guards with an in-flight flag, which
does not survive two tabs or a double submit. Charges and payments then split across
records, and every consumer reads only `billings[0]`.

---

### 🟠 #24 — Billing and settlement updates trust an id from the request body
**Where:** `app/api/patients/[id]/billing/route.ts:179`, `app/api/patients/[id]/settlements/route.ts` (PATCH)
**Tests:** `tests/api/billing/billing.test.ts`, `tests/api/billing/patient-settlements.test.ts` (#27)

Both routes act on `body.billing_id` / `body.settlement_id` without checking it belongs
to the patient named in the URL. Any admin can edit any patient's billing by supplying a
different id.

---

### 🟡 #25 — Soft-deleted settlements still appear in the patient's list
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

### 🟠 #28 — Sync reopens settled fees
**Where:** `app/api/patients/[id]/settlements/sync/route.ts:87-96`
**Test:** `tests/api/billing/patient-settlements.test.ts`

Sync raises `visit_count` on a settlement that is already `settled: true`, changing an
amount that has been paid without unsettling it — unlike the pricing endpoint, which
explicitly unsettles first (and correctly so).

---

### 🟠 #29 — A second admission reuses the first admission's settlement
**Where:** `app/api/patients/[id]/settlements/sync/route.ts:78-84`
**Test:** `tests/api/billing/patient-settlements.test.ts`

The existing-settlement lookup matches on patient and doctor but ignores
`patient_billing_id`, so a new billing cycle repoints the previous cycle's settlement
instead of opening its own. The earlier cycle's doctor fee is overwritten.

---

### 🟡 #30 — Sync never clears a settlement that no longer has visits
**Where:** `app/api/patients/[id]/settlements/sync/route.ts:73`
**Test:** `tests/api/billing/patient-settlements.test.ts`

The loop only walks doctors who still have consultations. Delete a doctor's last
consultation and their settlement keeps its old visit count and fee forever.

---

## Section 4 — Ledger

### 🟡 #33 — A user can verify their own entry
**Where:** `app/api/ledger/transactions/[id]/status/route.ts`

No separation of duties: whoever recorded the transaction can also mark it verified.

---


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

### 🔴 #49 — `/api/referrals` has no authentication whatsoever
**Where:** `app/api/referrals/route.ts` — both GET and POST
**Tests:** `tests/api/finances/doctors-referrals.test.ts` (3 cases)

Neither verb checks a token. Every other route in the application does. The referral list
can be read and written by anyone who can reach the endpoint.

---

### 🟠 #43 / #44 — Division by zero in the settlement maths
**Where:** `app/api/doctor-settlements/settle/route.ts:82` and `:164`; `app/api/doctor-settlements/merge/route.ts:71`
**Tests:** `tests/api/finances/doctor-settlements.test.ts` (2 cases)

`settlement_amount / visit_count` and `totalAmount / totalVisits` both divide by a count
that is **zero for every settlement sync has just created**, writing `Infinity` or `NaN`
into `amount_per_visit`.

---

### 🟠 #45 — Merge does not check the doctor
**Where:** `app/api/doctor-settlements/merge/route.ts:52-60`

Merge validates that all settlements share a patient but never that they share a doctor.
Merging two doctors' rows silently reassigns every visit to `settlements[0].doctor_id`,
and the second doctor's fee disappears.

---

### 🟡 #46 — DELETE requires a request body
**Where:** `app/api/doctor-settlements/[settlementId]/route.ts`

`await request.json()` is called unconditionally, so a DELETE sent without a body — the
ordinary way to send one — throws and returns 500.

---

### 🟠 #47 / #48 — The doctor registry has no role checks and hard-deletes
**Where:** `app/api/doctors/route.ts`, `app/api/doctors/[id]/route.ts`

Any signed-in user, including a receptionist, can create, edit and delete doctors. Delete
is a hard delete with no soft-delete flag and no dependency check, even when
consultations and settlements still reference the doctor.

---

### 🟡 #50 — Referral authorship is never recorded
**Where:** `app/api/referrals/route.ts:29`

`created_by` comes from `supabase.auth.getUser()`, but the app authenticates with its own
JWT cookies and never signs in to Supabase Auth, so this is always null.

---

### 🟡 #51 — The finance summary computes a breakdown it never returns
**Where:** `app/api/finances/summary/route.ts:231-243`

`paymentModeBreakdown` is calculated and then omitted from the response, while
`app/finances/page.tsx:73` declares `payment_mode_breakdown` on its type — so it is always
`undefined` client-side. A `billingCount` variable is likewise computed and unused.

---

### 🟡 #52 — Every doctor payout is logged against "Unknown Doctor"
**Where:** `app/api/finances/doctor-settlements/route.ts:209`

The ledger description reads `settlement.doctor?.name` from the result of an `.update()`
that carries no joins, so it is always undefined. Related: the settle modal sends
`settlement_amount: null`, so rows are marked paid with a null amount while the ledger
entry uses `total_amount`. This route also skips `recalculatePatientBilling` entirely.

---

## Section 6 — Employees & Salary

### 🟠 #53 — Every employee and salary endpoint admits DOCTOR
**Where:** all of `app/api/employees/**`

The gate is `role !== 'ADMIN' && role !== 'DOCTOR'` while the error text says "Admin
access required". Only the page middleware keeps non-admins out of `/employees`, so a
direct API call from a doctor's session succeeds — including salary edits and settlement.

---

### 🔴 #55 — One of the two advance endpoints ignores the cap
**Where:** `app/api/employees/advances/route.ts` (POST)
**Test:** `tests/api/employees/employees.test.ts`

`POST /api/employees/[id]/salary/advances` enforces the advance limit through
`validateSalaryAdvance`. `POST /api/employees/advances` — same table, same effect —
enforces nothing, so an advance far beyond the salary is accepted and leaves a negative
final salary.

---

### 🟡 #54 — The CSV importer is naive
**Where:** `app/api/employees/import/route.ts:36-66`
**Tests:** `tests/api/employees/employees.test.ts` (2 cases)

`split(',')` with no quote handling, so `"Kumar, Ramesh"` tears in half and shifts every
following column. There is also no duplicate detection: re-uploading the same file
silently creates a second copy of every employee. (Carriage returns are fine — values are
trimmed.)

---

### 🟠 #56 — Settling payroll writes no ledger entry
**Where:** `app/api/employees/salary/settle/route.ts`, `.../settle-all/route.ts`

Doctor fees and referral commissions both post a ledger debit when paid. Salary does not,
so payroll — usually the largest single outflow — never appears in the daily cash book.
The finance summary picks it up from `salary_payments` separately, so the two views of
the same month disagree.

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
