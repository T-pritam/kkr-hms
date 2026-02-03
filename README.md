# KKR Hospital Management System

A secure, full-stack hospital management system built with Next.js 14, Supabase, and TypeScript. Features role-based access control, JWT authentication, and comprehensive user management.

## 🚀 Features

### Security (Top Priority)
- ✅ JWT-based authentication with short-lived access tokens (10 minutes)
- ✅ Secure refresh token mechanism (7 days)
- ✅ HttpOnly cookies for token storage
- ✅ Role-based access control (RBAC)
- ✅ Password hashing with bcrypt (12 rounds)
- ✅ Protected API routes with middleware
- ✅ Row Level Security (RLS) in Supabase

### Mobile-Responsive UI
- ✅ Fully responsive design for mobile, tablet, and desktop
- ✅ Dark theme UI with orange accents
- ✅ Collapsible sidebar for mobile devices
- ✅ Touch-friendly interface elements

### Authentication & Authorization
- ✅ Login page (no signup - admin creates users)
- ✅ Password reset via email with Brevo
- ✅ Forced password change on first login
- ✅ User status management (Active/Inactive)

### User Roles
- **Admin**: Full access to all features
- **Doctor**: Access to patients, doctors, daily summary
- **Nurse**: Access to patients, doctors, daily summary
- **Receptionist**: Access to patients, doctors, daily summary

## 🛠 Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript
- **Backend**: Next.js API Routes, Supabase
- **Database**: PostgreSQL (Supabase)
- **Authentication**: JWT (jose library)
- **Email**: Brevo API via Supabase Edge Functions
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

## 📋 Prerequisites

- Node.js 18+ installed
- Supabase account
- Brevo account (for email functionality)

## ⚙️ Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Project Settings > API
3. Copy your Project URL, Anon Key, and Service Role Key
4. Run the database schema:
   - Go to SQL Editor in Supabase Dashboard
   - Copy contents from `supabase/schema.sql`
   - Execute the SQL script

### 3. Configure Environment Variables

Edit `.env.local` with your credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
JWT_SECRET=your_secure_jwt_secret_at_least_32_characters
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=noreply@yourcompany.com
BREVO_SENDER_NAME=KKR Hospital
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Deploy Supabase Edge Function

```bash
# Install Supabase CLI
npm install -g supabase

# Login and link project
supabase login
supabase link --project-ref your_project_ref

# Deploy function
supabase functions deploy send-reset-email

# Set secrets
supabase secrets set BREVO_API_KEY=your_brevo_api_key
supabase secrets set BREVO_SENDER_EMAIL=noreply@yourcompany.com
supabase secrets set BREVO_SENDER_NAME="KKR Hospital"
```

### 5. Run the Application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 🔑 Default Login

**Email**: `admin@kkrhospital.com`  
**Password**: `Admin@123`

⚠️ **Change this password immediately after first login!**

## 📱 Application Sections

1. **Dashboard** (All) - Overview and statistics
2. **Patients** (All) - Patient management
3. **Doctors** (All) - Doctor profiles
4. **Employees** (Admin) - Employee details & salary
5. **Finances** (Admin) - Financial overview
6. **Daily Ledger** - Daily summary (All) & Employee shifts (Admin)
7. **Admin Panel** (Admin) - User CRUD operations
8. **Logout** (All)

## 🔒 Security Features

- JWT tokens (10min access, 7day refresh)
- Bcrypt password hashing (12 rounds)
- HttpOnly secure cookies
- Role-based route protection
- Email-based password reset
- Row Level Security in database

## 📁 Project Structure

```
kkr-hms/
├── app/                   # Next.js app directory
│   ├── admin/            # Admin panel
│   ├── api/              # API routes
│   ├── dashboard/        # Dashboard
│   └── ...               # Other pages
├── components/           # React components
├── lib/                  # Utilities
├── supabase/            # Database schema & functions
└── types/               # TypeScript types
```

## 🚧 Future Development

Ready-to-implement placeholders:
- Patient medical records
- Doctor scheduling
- Employee attendance
- Salary processing
- Financial transactions
- Billing & invoicing

## 📞 Troubleshooting

- **Cannot login**: Check database schema is executed
- **Email not sending**: Verify Brevo API key and Edge Function
- **Token errors**: Clear cookies and check JWT_SECRET
- **Database errors**: Confirm schema and RLS policies

---

**Built with ❤️ for KKR Hospital**

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
