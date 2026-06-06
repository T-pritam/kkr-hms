# KKR Hospital Management System (HMS)

A full-stack, role-driven **Hospital Management System** for a multi-department hospital — patient
records & billing, doctor consultations & fee settlements, a pathology lab module, employee payroll,
a daily cash ledger, and a finance dashboard. Originally a Next.js monolith talking directly to
Supabase, it was **re-architected into two cleanly separated applications**: a Spring Boot REST API
that owns all data/auth/business logic, and a Vite + React single-page app that consumes it.

**Live:** frontend → `https://hms.pritamrao.tech` · API → `https://api-hms.pritamrao.tech`

---

## Highlights

- **Secure stateless auth** — access + refresh JWT (HS256) delivered as **httpOnly cookies**, with
  token rotation on refresh and server-enforced **role-based access control** on every endpoint.
- **4 roles** (Admin, Doctor, Nurse, Receptionist) — the backend is the source of truth for what
  each role can do; the UI mirrors it for UX.
- **Clean layered backend** — `controller → service → repository → entity`, DTOs over the wire,
  centralized exception handling, package-by-feature structure (~65 endpoints, 20 JPA entities).
- **Real domain logic** — patient billing recalculation, doctor visit-fee settlement (per-visit /
  total / merge), a prorated **payroll engine** (27-day month, OT, advances with validation), daily
  ledger close-out, and a monthly **finance summary** aggregating income vs. expenses.
- **File storage & email** — Cloudflare R2 (S3-compatible) for case-sheet PDFs via presigned
  downloads; Brevo transactional email for password resets.
- **Lightweight realtime** — a narrowly-scoped Supabase realtime subscription used only to trigger
  client refetches; all reads/writes go through the API.

---

## Architecture

```
┌──────────────────────────┐         ┌──────────────────────────────┐        ┌────────────────────┐
│  Frontend (Vite + React) │  HTTPS  │   Backend (Spring Boot 3)    │  JDBC  │  Supabase Postgres │
│  hms.pritamrao.tech      │ ──────► │   api-hms.pritamrao.tech     │ ─────► │  (existing DB)     │
│  React Router · Tailwind │ cookies │  Security · JPA · Services   │        └────────────────────┘
│  central API client      │ ◄────── │  RBAC · DTOs · ExceptionAdv  │ ─────► Cloudflare R2 (PDFs)
└─────────┬────────────────┘         └──────────────────────────────┘ ─────► Brevo (email)
          │ realtime (read-only, anon)
          └──────────────────────────────────────────► Supabase Realtime (refetch triggers only)
```

- **Auth flow:** `POST /auth/login` validates bcrypt credentials and sets `accessToken` (10 min) +
  `refreshToken` (7 d) httpOnly cookies. The frontend never reads the JWT; it learns the current
  user/role from `GET /auth/me`. On a `401`, the central API client transparently calls
  `POST /auth/refresh` (single-flight, rotates both tokens) and retries. `POST /auth/logout` clears
  the cookies.
- **RBAC:** a servlet filter authenticates each request from the access-token cookie and populates
  the Spring Security context; controllers authorize per-endpoint with `@PreAuthorize`.
- **Same database:** Hibernate runs with `ddl-auto: validate` — it connects to the existing Postgres
  and **never alters the schema**. Entities were modeled from the live schema.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Java 17, Spring Boot 3.3, Spring Security, Spring Data JPA / Hibernate, Maven |
| Auth | JJWT (HS256), BCrypt, httpOnly cookies |
| Database | PostgreSQL (Supabase), JDBC |
| Storage / Email | Cloudflare R2 via AWS S3 SDK v2; Brevo transactional email API |
| Frontend | React 19, Vite 6, React Router 6, TypeScript, Tailwind CSS v4 |
| Forms / PDF | React Hook Form, Zod, jsPDF |
| Realtime | Supabase JS (read-only subscription) |
| Infra | Ubuntu 24.04, Nginx (reverse proxy + static), Let's Encrypt/Certbot, systemd |

---

## Features by module

- **Patients** — registration, demographics, search/pagination; per-patient **billing** (base charge,
  charges, installments, paid amount), **consultations** (auto visit numbering), **doctor visit
  settlements**, **case sheets** (PDF upload/download), and lab history.
- **Doctors** — directory + per-patient visit-fee settlements (settle per-visit or by total, merge,
  manual entries) that feed back into patient billing totals.
- **Lab / Pathology** — test catalog with parameters (gender-specific reference ranges), test orders,
  and result entry with automatic **low/high/critical flagging**.
- **Employees & Payroll** — staff records, a salary engine (daily-rate proration over a 27-day month,
  overtime, advances with eligibility validation), monthly settle / settle-all, and CSV import.
- **Daily Ledger** — credit/debit transactions by payment mode, day close-out with closure records,
  per-employee shift summaries.
- **Finance** — monthly summary (income, expenses, salaries, commissions, doctor fees, net profit),
  expense management, and referral-commission / doctor-fee settlement with auto ledger entries.
- **Admin** — user management (create/update/reset-password) and role assignment.

## Role → permission matrix

| Area | Admin | Doctor | Nurse | Receptionist |
|---|:--:|:--:|:--:|:--:|
| Patients / Doctors / Lab / Test results / Referrals | ✅ | ✅ | ✅ | ✅ |
| Ledger transactions (list/create) | ✅ | ✅ | ✅ (own) | ✅ (own) |
| Employees · Payroll · Finance · Ledger close & shift | ✅ | ✅ | — | — |
| Expense writes · commission & doctor-fee settlement | ✅ | — | — | — |
| Admin user management | ✅ | — | — | — |

---

## Project structure

```
.
├── backend/                     # Spring Boot REST API
│   ├── src/main/java/tech/pritamrao/kkrhms/
│   │   ├── config/   security/  common/        # security, CORS, error handling, JWT
│   │   ├── auth/  users/                        # login/refresh/logout/me, admin user mgmt
│   │   ├── patients/  doctors/  lab/            # clinical domains (+ billing, settlements)
│   │   ├── employees/  ledger/  finances/  referrals/
│   │   ├── storage/  email/  billing/           # R2, Brevo, billing recalculation
│   │   └── KkrHmsApplication.java
│   ├── src/main/resources/application.yml
│   └── .env.example
├── frontend/                    # Vite + React SPA
│   ├── src/
│   │   ├── routes/                               # one component per page (React Router)
│   │   ├── components/  contexts/  hooks/        # UI, providers, realtime
│   │   ├── lib/api.ts                            # central API client (base URL, cookies, refresh)
│   │   └── main.tsx  App.tsx
│   └── .env.example
├── deploy/                      # Nginx vhosts + systemd unit
└── README.md
```

---

## Local development

**Prerequisites:** Java 17+, Maven 3.8+, Node 20+, access to the Postgres database.

```bash
# Backend  → http://localhost:8080
cd backend
cp .env.example .env          # fill in DB password, JWT secret, R2, Brevo
mvn spring-boot:run

# Frontend → http://localhost:5173
cd frontend
cp .env.example .env          # VITE_API_BASE_URL=http://localhost:8080
npm install
npm run dev
```

Log in with any row from the `users` table (the original auth scheme is preserved). To create a
throwaway admin:

```sql
insert into users (username,email,password_hash,role,status,needs_password_change)
values ('tester','tester@local', crypt('Test@1234', gen_salt('bf',12)), 'ADMIN','ACTIVE', false);
```

### Environment variables

**Backend** (`backend/.env`): `POSTGRES_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `JWT_SECRET`,
`COOKIE_DOMAIN`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `DEFAULT_PASSWORD`, `CORS_ALLOWED_ORIGINS`,
`APP_FRONTEND_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`,
`BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`.

**Frontend** (`frontend/.env`): `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_DEFAULT_PASSWORD`.

---

## Production deployment (Ubuntu + Nginx + Let's Encrypt)

The two apps run on a single droplet; Nginx serves the SPA statically and reverse-proxies the API.
Because both sites share the parent domain `pritamrao.tech`, the auth cookies are scoped to it
(`COOKIE_DOMAIN=.pritamrao.tech`, `COOKIE_SECURE=true`) so they flow between `hms.` and `api-hms.`.

```bash
# Backend: build a jar, run under systemd (see deploy/kkr-hms-backend.service)
cd backend && mvn -q -DskipTests package
# Frontend: static build served from /var/www/hms
cd frontend && npm ci && npm run build      # outputs dist/
```

Nginx vhosts live in `deploy/` (`nginx-hms.conf`, `nginx-api-hms.conf`); SSL is issued with
`certbot --nginx`. See `deploy/` for the systemd unit and reverse-proxy config.

**Required DNS** (two A records → droplet IP):

| Type | Host | Value |
|---|---|---|
| A | `hms` | `<droplet-ip>` |
| A | `api-hms` | `<droplet-ip>` |

---

## Notable engineering decisions

- **Schema-first entity modeling** — entities were derived by introspecting the live Postgres schema
  (not the legacy code), which surfaced and corrected drift between the old code and the real tables.
- **`ddl-auto: validate`** as a guardrail — the app refuses to start if an entity diverges from the
  database, catching mapping mistakes at boot rather than at runtime.
- **One central API client** — base URL, credentialed requests, and transparent single-flight token
  refresh live in exactly one place, keeping all call sites trivial.
- **Verbatim UI carry-over** — the React components, styling, and theme were preserved unchanged;
  only the data layer (Supabase → REST) and routing shell (Next.js → React Router) were rewritten.
