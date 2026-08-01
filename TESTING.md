# Testing

## Running the suite

```bash
npm test              # run everything once — this is the single trigger
npm run test:watch    # re-run affected tests on save
npm run test:coverage # per-file coverage report into ./coverage
npx tsc --noEmit      # the tests are typed against the real handlers
```

Per-section shortcuts: `npm run test:auth`, `test:patients`, `test:billing`, `test:ledger`,
`test:finances`, `test:employees`, `test:lab`, `test:casesheets`, `test:harness`.

No dev server, no database, no network — the whole suite is self-contained.

### Reading the output

```
Test Files  29 passed (29)
     Tests  830 passed | 87 expected fail (917)
```

`expected fail` are the known defects in [BUGS.md](./BUGS.md), written with `it.fails(...)`
so they assert the behaviour the code *should* have. **If one of them starts passing,
Vitest reports it as an error** — that means someone fixed the bug, and the `.fails`
marker plus the BUGS.md entry should be removed.

---

## How it works

Route handlers are imported and called directly:

```ts
import { POST as login } from '@/app/api/auth/login/route'
const { status, body } = await call(login, 'POST', '/api/auth/login', { body: { email, password } })
```

`tests/setup.ts` replaces four modules for every test:

| Replaced | With |
|---|---|
| `@/lib/supabase/server`, `@/lib/supabase/service` | the in-memory fake client |
| `next/headers` | a cookie jar the tests can read and write |
| `@/lib/supabase/middleware` | a no-op (the real one calls Supabase Auth over the network on every request) |

Everything else is the real thing: the actual handlers, real `jose` JWT signing and
verification, real `bcryptjs` hashing.

### The fake database — `tests/helpers/fake-supabase.ts`

A small PostgREST emulator over plain arrays. It supports the entire query surface this
app uses: filters (`eq/neq/gt/gte/lt/lte/in/is/not/ilike/or`), `order`/`range`/`limit`,
`single`/`maybeSingle`, `insert`/`update`/`upsert`/`delete`, `count: 'exact'`, and
embedded resources (`doctor:doctors(id, name)`, `users!created_by(...)`, nested).

It deliberately copies several real behaviours that route handlers branch on:

- `.single()` with 0 or >1 rows returns error code **PGRST116**
- `.eq(col, null)` matches **nothing** (PostgREST semantics)
- ORDER BY places nulls last ascending, first descending
- `count: 'exact'` counts before `.range()` is applied

### Schema validation — `tests/helpers/schema.ts`

The fake is **schema-aware**. Every select, filter and write payload is checked against
the real column list, dumped from the live Supabase project:

```sql
SELECT table_name, string_agg(column_name, ',' ORDER BY ordinal_position)
FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name;
```

A query naming a column the table does not have fails with PostgREST's own error
(`42703` on reads, `PGRST204` on writes), and `db.seed()` throws outright on a bad
fixture. This is what caught BUGS.md #16 and #23 — code that has drifted away from the
schema and fails silently in production. **Re-dump `schema.ts` whenever the schema
changes**, or the suite will keep testing against a database that no longer exists.

Note that `doctor_visit_settlements.total_amount` is a plain nullable column in the real
schema — not generated, no trigger — so the fake leaves it exactly as written. Several
tests depend on that to expose stale-total bugs.

Test-facing API:

```ts
db.seed('users', { id: 'u1', role: 'ADMIN' })   // insert fixture rows
db.rows('users')                                // read the table back
db.find('users', r => r.id === 'u1')            // find one row
db.count('users')
db.failNext('users')                            // make the next query error (drives 500 branches)
db.reset()                                      // automatic, between every test
```

### Sessions — `tests/helpers/auth.ts`

The app has **two** auth paths: `verifyAuth(request)` reads request cookies, and
`getAccessToken()` reads `next/headers`. `signInAs()` installs a real signed token into
both, so either style of handler sees the same session.

```ts
await signInAs('ADMIN')                        // also: DOCTOR, NURSE, RECEPTIONIST
await signInAs('ADMIN', { userId: 'u1', seedUser: true })
await signInWithRefreshTokenOnly('NURSE')      // access token expired
signOut()
await expiredToken(); await tamperedToken()    // negative cases
```

### Fixtures — `tests/helpers/seed.ts`

`aPatient()`, `aBilling()`, `aDoctor()`, `aCharge()`, `anInstallment()`, `aSettlement()`,
`aTransaction()`, `aClosure()`, `anEmployee()`, `aSalaryRecord()`, `anAdvance()`,
`anExpense()`, `aReferral()`, `aLabTest()`, `aTestParameter()`, `aTestResult()`,
`aTestResultValue()`, `aCaseSheet()`, `aConsultation()`, `aUser()`, `aResetToken()` —
each takes overrides and returns the stored row.

### The clock

Time is frozen at **2026-03-15T10:30:00Z** (`NOW`, `TODAY`, `THIS_MONTH` exported from
`tests/setup.ts`), so handlers that default a date with `new Date()` are assertable.

---

## Adding a test for a new route

```ts
import { describe, it, expect } from 'vitest'
import { POST as createThing } from '@/app/api/things/route'
import { call } from '../../helpers/request'
import { signInAs, signOut } from '../../helpers/auth'
import { db } from '../../helpers/fake-supabase'

describe('POST /api/things', () => {
  it('rejects an unauthenticated caller', async () => {
    signOut()
    expect((await call(createThing, 'POST', '/api/things', { body: {} })).status).toBe(401)
  })

  it('creates the thing', async () => {
    await signInAs('ADMIN')
    const { status } = await call(createThing, 'POST', '/api/things', { body: { name: 'x' } })

    expect(status).toBe(201)
    expect(db.rows('things')).toHaveLength(1)   // assert the write, not just the response
  })
})
```

Cover, at minimum: unauthenticated → wrong role → each validation branch → missing entity
→ happy path (response **and** resulting database state) → database failure.

---

## What these tests do NOT cover — check these by hand

The suite stops at the process boundary. Everything below needs a human, a browser, or the
real Supabase project.

### Email (Brevo)
1. **The reset email arriving in the inbox** — sender address and name, subject, branding,
   spam placement. *Automated:* the token row is written as a SHA-256 hash with a 1-hour
   expiry, and the edge function is called with the correct `{ email, resetUrl, username,
   baseUrl }` payload and service-role authorization.
2. **Clicking the real link** → `/change-password?token=…` loads and accepts the token.
3. **Real 1-hour expiry** — the suite fakes the clock, so only a real wait proves it.
4. **Admin "reset to default password" sends no email at all.** Confirm your process for
   telling that user their new password out of band.

### File storage (Cloudflare R2)
5. **A real upload storing real bytes**, and the downloaded file opening as a valid PDF.
   *Automated:* the PDF-only and 10 MB validations, the presign call shape, key derivation.
6. **Presigned URL expiry** (1 h upload, 1 h download) against the live service.

### Database behaviour the fake cannot know
The fake now validates column names against the real schema (see above), but it still
cannot enforce constraints:

7. **Unique constraints** — `patients.patient_id`, `lab_tests.code`,
   `salary_payments (employee_id, month_year)`. The app pre-checks these in JavaScript;
   whether the database also enforces them is untested.
8. **Foreign keys and cascades on hard deletes** — doctors, lab tests and patients are all
   deleted outright with dependent rows still pointing at them.
9. **RLS is currently disabled on all 23 tables** in the live project, which the Supabase
   advisor flags as critical: anyone holding the anon key can read or write every row,
   including `users` and `password_reset_tokens`. The app uses the anon key for most
   queries, so enabling RLS needs policies designed first — do not just switch it on.
10. **Race conditions** — `visit_number`, `installment_number` and billing-row creation are
    all non-atomic read-then-write sequences. Duplicates only appear under real concurrency.

### Browser and runtime
12. **Cookie semantics in a real browser** — `httpOnly`, `secure` in production, `sameSite`,
    and the silent 10-minute refresh. *Automated:* the values the code sets.
13. **Middleware redirects end to end** in a real Next runtime, which also makes a live
    `supabase.auth.getUser()` call on every single request.
14. **Supabase Realtime** (`useRealtimeRefetch`) — open two tabs, confirm one updates the other.
15. **PDF visual quality** — the seven finance PDFs, the patient report and the lab report:
    pagination, column alignment, fonts, ₹ glyphs, red/green flag rendering.
16. **`window.print()`** for the lab report; responsive layout; dark/light theme.

### Out of scope by design
17. The `backup-database` edge function and scheduled backups.
18. Load and performance, including the unbounded `pageSize` on `/api/patients` and the
    unlimited `recent_transactions` list in the finance summary.
