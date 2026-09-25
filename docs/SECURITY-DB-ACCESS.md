# Database access (BUGS #68) — the problem, the fix, and a safe workaround

| | |
|---|---|
| **Status** | **Steps 1, 2 and 3 applied to production on 2026-09-25** and verified (§0). Step 4 (row-level security) is not done. |
| **Written** | 2026-09-25, from read-only checks on production (`bmbbifxkjqmdqriootdw`) and the code on `feature/v2-release-fixes` |
| **Decision needed** | Only whether to run step 4 (§4) |

---

## 0. What was done on 2026-09-25

Applied in an order where the live app never depended on something not yet in place,
checking production before each next step:

| # | Change | How it was checked |
|---|---|---|
| 1 | Migration `20260925000006` (additive): the `change_signals` table, a statement-level trigger on each of the 28 watched tables, the table added to the live-refresh stream, an hourly prune job | A subscriber holding only the public key received a signal per table, filtered correctly, with no row data |
| 2 | Code `521644e` deployed: the server uses `SUPABASE_SERVICE_ROLE_KEY` (`lib/supabase/server.ts`); the live-refresh hook listens to `change_signals` | Before deploy: the build run locally against production — 31 read endpoints, all 200. After deploy: Supabase's gateway log shows the live server calling as `service_role`. All 664 public-key requests in the log window came from the old server code; nothing else used the key |
| 3 | Migration `20260925000007` (narrowing): every right of `anon` and `authenticated` revoked — tables, sequences, functions, and for future objects; the real tables removed from the live-refresh stream | As the public key: users, patients, salaries, payments, writes and the number functions all answer *permission denied*; only `change_signals` reads. As the server's role: every table readable and writable, every sequence and function usable, writes still fire the signals. The 31 endpoints re-run against the locked database: all 200. Live refresh re-tested after the lock: delivered |
| 4 | Migration `20260925000008` + `backup-database` v23: the backup needs a secret the scheduled job reads from Vault; the response no longer carries the file's link | Public key without the secret, or with a wrong one: 401. The job's exact request: 200, backup written |

**Found on the way — backups had been failing.** Every scheduled backup in the log window
(24 Sep 12:30 UTC to 25 Sep 06:30 UTC) had failed with *password authentication failed for user
"postgres"*: the function's hand-set `DATABASE_URL` held an outdated password. It now uses the
connection string Supabase injects and keeps current (`SUPABASE_DB_URL`), and the first run
succeeded. That run also applied the function's existing 3-day retention, which had not run
while every backup failed: it removed 13 backup files older than 3 days.

**Undo, if ever needed:** `supabase/rollback/20260925000007_reopen_anon_access.sql` restores
exactly the rights the public key had before (snapshot taken first). It reopens the hole — an
emergency switch only.

**One visible difference:** a browser tab left open from *before* the deploy keeps the old
live-refresh code until it is reloaded, so it will not refresh on its own until then. Every
page load after the deploy uses the new code.

---

## 1. In one minute

The app talks to its database with a key called the **anon key**. That key is not secret —
it is shipped to every browser that opens the app, and it cannot be hidden, by design.
Normally that is fine, because the database is supposed to refuse the anon key almost
everything. **Here it refuses nothing**: the anon key can read, change and delete almost
every table, because every table was opened to it and row-level security is off everywhere.

So anyone who opens the site and copies the key out of the browser can skip every rule the
app enforces — permissions, locks, closing, audit — and talk to the database directly.

**Why it can't just be switched off:** the app's own server *also* uses that same anon key for
almost everything — logging in, patients, payments, payroll. Take its rights away and the
whole app stops. That is the part that makes this big.

**The way out, in short:** give the server its own key (it already has one, unused), then take
the anon key's rights away step by step, keeping a one-command undo for each step. The first
two steps are a workaround that closes the dangerous part in about a day; the last two finish it.

---

## 2. What someone holding the key can do today

Checked on production, read-only:

| Door | What is open | What it means |
|---|---|---|
| **Direct table access** | Read, insert, update and delete on **50 of 52 tables** | Read every patient, payment and salary; change a payment; delete a bill; make themselves an admin |
| **Password hashes** | `users` is one of those 50, with `password_hash` | Hashes can be copied and cracked offline |
| **Live-refresh stream** | 21 tables are broadcast to anyone subscribed with the key — **including `users`, `salary_payments`, `employees`, `advances`, `expenses`** | Every change to those rows arrives *in full*, as it happens. The app only uses these signals to refetch; it ignores their contents |
| **Database functions** | 12 callable, e.g. `next_patient_id`, `next_employee_code`, and the retired `close_ledger_day` / `reopen_ledger_day` | Burn patient and employee numbers; write old-style ledger closures |
| **Backup function** | `backup-database` accepts the anon key — and the scheduled backup itself calls it with the anon key | Anyone can trigger a full database dump and is handed the link to the file |

Two things are **not** open: files (case sheets, lab reports) are in Cloudflare R2, which the
app only reaches server-side with signed links; and there are no Supabase storage buckets.

> Scrapping the existing user passwords before release is worthwhile, but it does not close
> this: the anon key is not a password, and it keeps working for everyone.

---

## 3. What uses the anon key today (why a careless fix breaks things)

| User of the key | Where | What happens if the anon key loses its rights |
|---|---|---|
| **The app's server** | 101 API routes and login, through `lib/supabase/server.ts` | **Everything breaks** — nobody can log in |
| **Live refresh** (screens updating when a colleague saves) | 18 screens, through `hooks/use-realtime-refetch.ts` | Screens stop updating on their own; they still work, and still update after your own actions or a reload |
| **Scheduled backup** | A database cron job, four times a day | Keeps working (the function reads the database with its own direct connection) — but see §4, step 2 |
| Password reset e-mail, password change | Already use the server's own **service key** | Unaffected |

---

## 4. The fix — four steps, safest first

Each step ships on its own, is invisible or nearly invisible to users, and has an undo that
runs in seconds. Nothing moves on to the next step until the last one has been used for a day.

### Step 1 — The server uses its own key · *invisible to users*

- **Change:** one line in `lib/supabase/server.ts` — use `SUPABASE_SERVICE_ROLE_KEY` (server-only,
  already configured; the password routes use it) instead of the anon key. Optionally drop the
  unused Supabase-auth call the middleware makes on every page load.
- **Breaks:** nothing expected — the service key can do everything the anon key could.
- **Before:** confirm `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel (Settings → Environment
  Variables). It must never be renamed `NEXT_PUBLIC_…`.
- **Undo:** revert the one line.
- **Effort:** about an hour, plus checking the main screens.

After this, the anon key is used **only** by live refresh and the backup cron.

### Step 2 — Close every door the browser does not need · *the workaround*

One migration, plus a small change to the backup function:

- **Nobody but the server can write:** revoke insert, update and delete on every table from the
  anon key.
- **No functions:** revoke the 12 database functions from the anon key.
- **Close the sensitive tables completely:** `users`, `salary_payments`, `employees`, `advances`,
  `expenses` — no reading, and taken out of the live-refresh stream. The Admin panel and the
  payroll screens then stop updating on their own (they still update after your own action).
- **Close every table live refresh does not use**, and drop the retired ones from the stream.
- **Backup:** give the function a secret of its own (stored in the function's settings and in the
  cron job), refuse calls without it, and stop returning the file's link.
- **Undo:** a prepared re-grant script, applied in seconds.
- **Effort:** half a day.

**What this achieves:** nobody holding the key can change or delete anything, read passwords,
payroll or staff records, burn number series, or trigger a backup. **What stays open until
step 3:** *reading* the everyday tables live refresh listens to — patients, bills, payments,
charges, visits, the ledger, petty cash, lab, doctors, charge sheets, referrals.

### Step 3 — Live refresh without the data · *invisible to users*

- **Change:** a tiny `change_signals` table (which table changed, and when — nothing else) kept
  up to date by database triggers. The browser listens to that instead of the real tables; one
  file changes (`hooks/use-realtime-refetch.ts`), and screens behave as now — **and the 11 screens
  whose live refresh never worked start updating too** (BUGS #75, appendix). Then the last
  read rights are revoked and the real tables leave the stream.
- **Breaks:** nothing expected; if it does, live refresh degrades to "update after your own
  action", which is the step-2 behaviour.
- **Undo:** point the hook back and re-grant.
- **Effort:** about a day.

After this, the anon key can do **nothing** except learn that "some table changed".

### Step 4 — Lock it in

- Turn on row-level security on every table, with no rules for the anon key, so a future
  mistaken grant cannot reopen anything. Supabase's own security advisor stops flagging it.
- **Effort:** an hour.

No key needs rotating: once the anon key has no rights, it is harmless even though it is public.

---

## 5. The workaround "on a whole", in short

**Steps 1 and 2 together** are the workaround you asked about: roughly a day of work, a
one-command undo at each point, and after it the dangerous part is closed — **no one outside
the server can change, delete, read passwords or payroll, or trigger a backup**. The only
visible change is that the Admin panel and payroll screens no longer refresh by themselves.

What it deliberately leaves for steps 3 and 4 is *read-only* access to the everyday clinical
and billing tables, which live refresh still needs until it has its own signal table.

---

## 6. What I need from you

1. **Go-ahead per step** — or for steps 1 + 2 together as the workaround.
2. **Where to try it first.** Production with the undo scripts ready is workable (each step
   reverses in seconds), but a staging copy is safer. A Supabase branch or a second free
   project would do; say which you prefer.
3. **Vercel:** confirm `SUPABASE_SERVICE_ROLE_KEY` is set for Production.
4. **Cloudflare R2:** check whether the bucket has *public access* (an `r2.dev` link) switched
   on. The app never uses public links, so it can be switched off; if it is on, anyone who has
   a file's link can download that case sheet or backup.
5. **Is it acceptable** that the Admin panel and payroll screens stop refreshing on their own
   between steps 2 and 3?

---

## Appendix — the inventory behind §2

**Live-refresh stream (21 tables):** advances · daily_ledger_closures · daily_ledger_shift_settlements ·
daily_ledger_transactions · doctor_visit_settlements · doctors · employees · expenses · lab_tests ·
patient_billing · patient_billing_installments · patient_case_sheets · patient_charges ·
patient_consultations · patient_test_results · patients · referrals · salary_payments ·
test_parameters · test_result_values · users

**Functions the anon key can call (12):** close_ledger_day · ledger_closure_continuity · ledger_open_days ·
next_charge_sheet_no · next_discharge_summary_no · next_employee_code · next_lab_order_no ·
next_patient_id · peek_next_employee_code · peek_next_patient_id · reopen_ledger_day · set_updated_at

**Screens using live refresh:** 18, all through `hooks/use-realtime-refetch.ts`, all of which only
refetch on a signal and never read the row it carries — which is what makes step 3 safe.

**A separate bug found while mapping this (BUGS #75):** 11 of those subscriptions can never fire,
because their tables were never added to the stream — so these screens have never updated on
their own: the **lab worklist** and a patient's lab history (`lab_orders`, `lab_order_items`,
`lab_result_values`), **charge sheets** (`charge_sheets`, `charge_sheet_items`), the **petty cash
log** (`petty_cash_entries`), the **charge catalogue** (`charge_items`), the test catalogue's ranges
(`test_parameter_ranges`), and a case sheet's doctors, medicines and scans
(`case_sheet_doctors`, `case_sheet_medications`, `case_sheet_attachments`). Adding them to today's
stream would widen the exposure above, so the right fix is step 3's signal table, which covers
them all at no extra risk.
