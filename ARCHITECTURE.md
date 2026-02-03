# System Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser/Client                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Login Page   │  │  Dashboard   │  │ Admin Panel  │  ...    │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js 14 Application                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                      Middleware                          │  │
│  │  • Check authentication (JWT)                            │  │
│  │  • Refresh tokens if needed                              │  │
│  │  • Role-based route protection                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ▼                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Pages/Routes │  │  API Routes  │  │  Components  │         │
│  │              │  │              │  │              │         │
│  │ • Dashboard  │  │ • /api/auth  │  │ • Sidebar    │         │
│  │ • Patients   │  │ • /api/admin │  │ • Modals     │         │
│  │ • Admin      │  │              │  │ • UI         │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Supabase Backend                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                PostgreSQL Database                       │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │  │
│  │  │  users  │  │patients │  │ doctors │  │employees│    │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │  │
│  │  • Row Level Security (RLS)                             │  │
│  │  • Automatic timestamps                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Edge Functions                          │  │
│  │  ┌────────────────────────────────────────────┐         │  │
│  │  │  send-reset-email                          │         │  │
│  │  │  • Receives reset request                  │         │  │
│  │  │  • Generates HTML email                    │         │  │
│  │  │  • Sends via Brevo API                     │         │  │
│  │  └────────────────────────────────────────────┘         │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Brevo Email Service                        │
│  • Sends password reset emails                                 │
│  • Professional HTML templates                                 │
│  • Delivery tracking                                            │
└─────────────────────────────────────────────────────────────────┘
```

## Authentication Flow

```
┌─────────┐                                    ┌──────────┐
│ Browser │                                    │  Server  │
└────┬────┘                                    └────┬─────┘
     │                                              │
     │  1. POST /api/auth/login                    │
     │  { email, password }                        │
     ├────────────────────────────────────────────►│
     │                                              │
     │                              2. Validate    │
     │                                 credentials  │
     │                                 against DB   │
     │                                              │
     │                              3. Generate    │
     │                                 JWT tokens   │
     │                                 (access +    │
     │                                  refresh)    │
     │                                              │
     │  4. Set httpOnly cookies                    │
     │  + Return user data                         │
     │◄────────────────────────────────────────────┤
     │                                              │
     │  5. Redirect to /dashboard                  │
     │     or /change-password                     │
     │                                              │
     │                                              │
     │  6. Every subsequent request                │
     │     includes cookies automatically          │
     ├────────────────────────────────────────────►│
     │                                              │
     │                              7. Middleware   │
     │                                 verifies     │
     │                                 access token │
     │                                              │
     │                              8. If expired,  │
     │                                 use refresh  │
     │                                 to generate  │
     │                                 new access   │
     │                                              │
     │  9. Response + updated cookies              │
     │◄────────────────────────────────────────────┤
     │                                              │
```

## Password Reset Flow

```
┌─────────┐          ┌──────────┐          ┌──────────┐          ┌─────────┐
│ Admin   │          │  Server  │          │ Supabase │          │  Brevo  │
└────┬────┘          └────┬─────┘          └────┬─────┘          └────┬────┘
     │                    │                     │                      │
     │ 1. Click reset     │                     │                      │
     │    password for    │                     │                      │
     │    user@email.com  │                     │                      │
     ├───────────────────►│                     │                      │
     │                    │                     │                      │
     │                    │ 2. Generate random  │                      │
     │                    │    reset token      │                      │
     │                    │                     │                      │
     │                    │ 3. Save token +     │                      │
     │                    │    expiry to DB     │                      │
     │                    ├────────────────────►│                      │
     │                    │                     │                      │
     │                    │ 4. Call Edge        │                      │
     │                    │    Function         │                      │
     │                    ├────────────────────►│                      │
     │                    │                     │                      │
     │                    │                     │ 5. Send email via    │
     │                    │                     │    Brevo API         │
     │                    │                     ├─────────────────────►│
     │                    │                     │                      │
     │                    │                     │                      │ 6. Email
     │                    │                     │                      │    delivered
     │                    │                     │                      │    to user
     │ 7. Success message │                     │                      │
     │◄───────────────────┤                     │                      │
     │                    │                     │                      │
```

```
┌─────────┐          ┌──────────┐          ┌──────────┐
│  User   │          │  Server  │          │ Supabase │
└────┬────┘          └────┬─────┘          └────┬─────┘
     │                    │                     │
     │ 8. Click link in   │                     │
     │    email           │                     │
     │    (/change-password?token=xxx)         │
     │                    │                     │
     │ 9. Enter new       │                     │
     │    password        │                     │
     ├───────────────────►│                     │
     │                    │                     │
     │                    │ 10. Verify token    │
     │                    │     & expiry        │
     │                    ├────────────────────►│
     │                    │                     │
     │                    │ 11. Hash password   │
     │                    │     & update        │
     │                    ├────────────────────►│
     │                    │                     │
     │ 12. Redirect to    │                     │
     │     /dashboard     │                     │
     │◄───────────────────┤                     │
     │                    │                     │
```

## Role-Based Access Control

```
                    ┌──────────────────┐
                    │  User Login      │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │ JWT Payload      │
                    │ { role: "ADMIN" }│
                    └────────┬─────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
    ┌───▼────┐          ┌───▼────┐          ┌───▼────┐
    │ ADMIN  │          │ DOCTOR │          │ NURSE  │
    └───┬────┘          └───┬────┘          └───┬────┘
        │                   │                    │
        │                   │                    │
    All Routes          Limited Routes       Limited Routes
        │                   │                    │
    ┌───▼────────────────────────────────────────▼───┐
    │ Middleware checks role from JWT token          │
    │ • Extract role from access token               │
    │ • Check route requirements                     │
    │ • Allow or redirect based on permissions       │
    └─────────────────────────────────────────────────┘
```

## Database Schema

```
┌─────────────────────────────────────────────┐
│                  users                      │
├─────────────────────────────────────────────┤
│ id (UUID, PK)                               │
│ username (VARCHAR)                          │
│ email (VARCHAR, UNIQUE)                     │
│ password_hash (TEXT)                        │
│ role (VARCHAR) ─────────┐                   │
│   • ADMIN               │                   │
│   • DOCTOR              │                   │
│   • NURSE               │                   │
│   • RECEPTIONIST        │                   │
│ status (VARCHAR) ───────┤                   │
│   • ACTIVE              │                   │
│   • INACTIVE            │                   │
│ needs_password_change (BOOLEAN)             │
│ reset_token (TEXT, nullable)                │
│ reset_token_expiry (TIMESTAMP, nullable)    │
│ last_login (TIMESTAMP)                      │
│ created_at (TIMESTAMP)                      │
│ updated_at (TIMESTAMP)                      │
└─────────────────────────────────────────────┘
            │
            │ (Foreign Key References)
            │
    ┌───────┴───────────────────────┐
    │                               │
┌───▼──────────┐          ┌────────▼────────┐
│   doctors    │          │   employees     │
├──────────────┤          ├─────────────────┤
│ id           │          │ id              │
│ user_id (FK) │          │ user_id (FK)    │
│ specialization│         │ employee_id     │
│ license_number│         │ department      │
│ ...          │          │ salary          │
└──────────────┘          └─────────────────┘
```

## JWT Token Structure

```
┌────────────────────────────────────────┐
│         Access Token (10 min)          │
├────────────────────────────────────────┤
│ Header:                                │
│   { alg: "HS256", typ: "JWT" }        │
├────────────────────────────────────────┤
│ Payload:                               │
│   {                                    │
│     userId: "uuid",                    │
│     email: "user@example.com",         │
│     role: "ADMIN",                     │
│     type: "access",                    │
│     iat: 1234567890,                   │
│     exp: 1234568490  // +10 min        │
│   }                                    │
├────────────────────────────────────────┤
│ Signature:                             │
│   HMACSHA256(header + payload, secret) │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│        Refresh Token (7 days)          │
├────────────────────────────────────────┤
│ Same structure but:                    │
│   type: "refresh"                      │
│   exp: +7 days                         │
└────────────────────────────────────────┘
```

## Component Hierarchy

```
App
├── Login Page (Public)
├── Reset Password Page (Public)
├── Change Password Page (Public)
└── Dashboard Layout (Protected)
    ├── Sidebar
    │   ├── Navigation Menu (Role-based)
    │   └── Logout Button
    └── Main Content Area
        ├── Dashboard Page
        ├── Patients Page
        ├── Doctors Page
        ├── Employees Pages (Admin only)
        │   ├── Details
        │   └── Salary
        ├── Finances Page (Admin only)
        ├── Daily Ledger Pages
        │   ├── Summary
        │   └── Employee Ledger (Admin only)
        └── Admin Panel (Admin only)
            ├── User Table
            ├── Create User Modal
            └── Edit User Modal
```

## Security Layers

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Client Side                                    │
│ • Route protection via middleware                       │
│ • Automatic redirects                                   │
│ • UI element visibility based on role                   │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ Layer 2: API Routes                                     │
│ • JWT verification on every request                     │
│ • Role checking before data access                      │
│ • Input validation                                      │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ Layer 3: Database                                       │
│ • Row Level Security (RLS) policies                     │
│ • Password hashing (bcrypt)                             │
│ • Secure token storage                                  │
└─────────────────────────────────────────────────────────┘
```

## Data Flow Example: Creating a User

```
1. Admin clicks "Create User" button
   │
2. CreateUserModal component opens
   │
3. Admin fills form and submits
   │
4. POST /api/admin/users
   │
5. API Route:
   ├─ Verify access token (JWT)
   ├─ Check if user is ADMIN
   ├─ Validate input data
   ├─ Hash password (bcrypt)
   └─ Insert into database
   │
6. Supabase:
   ├─ Check RLS policies
   ├─ Insert user record
   └─ Return new user data
   │
7. API Response: { success: true, user: {...} }
   │
8. Modal closes, user table refreshes
```

---

**This architecture ensures:**
- ✅ Secure authentication at multiple layers
- ✅ Role-based access control
- ✅ Scalable and maintainable code structure
- ✅ Clear separation of concerns
- ✅ Easy to extend with new features
