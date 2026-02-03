# 📚 Documentation Index

Welcome to the KKR Hospital Management System documentation. Use this index to quickly find what you need.

## 🚀 Quick Start

**New to the project? Start here:**

1. [PROJECT-SUMMARY.md](PROJECT-SUMMARY.md) - **Start here!** Complete overview of what's been built
2. [CHECKLIST.md](CHECKLIST.md) - Step-by-step setup verification checklist
3. [SETUP.md](SETUP.md) - Detailed setup instructions with screenshots

## 📖 Main Documentation

### For Users & Administrators

- **[README.md](README.md)** - Project overview, features, and quick start guide
  - What the system does
  - Key features
  - Tech stack
  - Basic setup steps
  - Default login credentials
  - Troubleshooting

### For Developers

- **[API.md](API.md)** - Complete API documentation
  - All endpoints with request/response examples
  - Authentication flow
  - Authorization rules
  - Error responses
  - Testing with cURL

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture and design
  - High-level architecture diagrams
  - Authentication flow
  - Password reset flow
  - Role-based access control
  - Database schema
  - Component hierarchy
  - Security layers

### For DevOps

- **[COMMANDS.md](COMMANDS.md)** - Quick reference for common commands
  - Development commands
  - Supabase CLI commands
  - Database queries
  - Git commands
  - Testing commands
  - Troubleshooting commands

## 📁 Technical Files

### Configuration Files

- **[.env.example](.env.example)** - Template for environment variables
  - Copy to `.env.local` and fill in your values
  - Required for app to run

- **[.env.local](.env.local)** - Your actual environment variables
  - ⚠️ Never commit this file!
  - Contains sensitive credentials
  - Gitignored by default

### Database

- **[supabase/schema.sql](supabase/schema.sql)** - Database schema
  - Complete SQL schema
  - Creates all tables
  - Sets up RLS policies
  - Creates default admin user
  - Run this in Supabase SQL Editor

### Edge Functions

- **[supabase/functions/send-reset-email/index.ts](supabase/functions/send-reset-email/index.ts)** - Email Edge Function
  - Sends password reset emails
  - Uses Brevo API
  - Deploy with Supabase CLI

## 🎯 Use Cases

### "I want to set up the system"
→ Read: [SETUP.md](SETUP.md) + [CHECKLIST.md](CHECKLIST.md)

### "I want to understand what's been built"
→ Read: [PROJECT-SUMMARY.md](PROJECT-SUMMARY.md) + [README.md](README.md)

### "I want to add new API endpoints"
→ Read: [API.md](API.md) + [ARCHITECTURE.md](ARCHITECTURE.md)

### "I want to understand the authentication system"
→ Read: [ARCHITECTURE.md](ARCHITECTURE.md) sections on Auth Flow

### "I forgot a command"
→ Read: [COMMANDS.md](COMMANDS.md)

### "Something isn't working"
→ Read: Troubleshooting sections in [SETUP.md](SETUP.md) and [README.md](README.md)

### "I want to deploy to production"
→ Read: [README.md](README.md) section on Production Deployment

### "I want to add a new user role"
→ Read: [ARCHITECTURE.md](ARCHITECTURE.md) RBAC section + [API.md](API.md)

## 📂 Project Structure

```
kkr-hms/
│
├── 📚 Documentation (You are here!)
│   ├── README.md              ⭐ Main documentation
│   ├── PROJECT-SUMMARY.md     ⭐ Complete overview
│   ├── SETUP.md              ⭐ Setup guide
│   ├── CHECKLIST.md          ⭐ Setup checklist
│   ├── API.md                📘 API reference
│   ├── ARCHITECTURE.md       📘 System design
│   ├── COMMANDS.md           📘 Quick reference
│   └── INDEX.md              📘 This file
│
├── ⚙️ Configuration
│   ├── .env.local            🔐 Your credentials
│   ├── .env.example          📋 Template
│   ├── tsconfig.json         ⚙️ TypeScript config
│   ├── next.config.ts        ⚙️ Next.js config
│   └── tailwind.config.ts    ⚙️ Tailwind config
│
├── 💻 Application Code
│   ├── app/                  📱 Next.js pages & API routes
│   ├── components/           🧩 React components
│   ├── lib/                  🛠️ Utilities & helpers
│   ├── types/                📝 TypeScript types
│   └── middleware.ts         🛡️ Route protection
│
├── 🗄️ Database
│   └── supabase/
│       ├── schema.sql        📊 Database schema
│       └── functions/        ☁️ Edge Functions
│
└── 📦 Dependencies
    ├── package.json          📋 NPM packages
    └── node_modules/         📚 Installed packages
```

## 🔍 Quick Lookups

### Environment Variables Reference
See: [.env.example](.env.example)

Required variables:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `JWT_SECRET` - Secret for JWT tokens (32+ chars)
- `BREVO_API_KEY` - Brevo email API key
- `BREVO_SENDER_EMAIL` - Verified sender email
- `BREVO_SENDER_NAME` - Sender name for emails
- `NEXT_PUBLIC_APP_URL` - Your app URL

### Default Credentials
See: [README.md](README.md#default-login)

- Email: admin@kkrhospital.com
- Password: Admin@123

### User Roles
See: [ARCHITECTURE.md](ARCHITECTURE.md#role-based-access-control)

- `ADMIN` - Full access
- `DOCTOR` - Limited access
- `NURSE` - Limited access
- `RECEPTIONIST` - Limited access

### API Endpoints
See: [API.md](API.md)

**Authentication:**
- POST /api/auth/login
- POST /api/auth/logout
- POST /api/auth/reset-password
- POST /api/auth/change-password

**Admin:**
- GET /api/admin/users
- POST /api/admin/users
- PUT /api/admin/users/[id]
- PATCH /api/admin/users/[id]
- DELETE /api/admin/users/[id]
- POST /api/admin/users/[id]/reset-password

### Pages & Routes
See: [PROJECT-SUMMARY.md](PROJECT-SUMMARY.md)

**Public:**
- /login
- /reset-password
- /change-password

**Protected (All Users):**
- /dashboard
- /patients
- /doctors
- /daily-ledger/summary

**Protected (Admin Only):**
- /employees/details
- /employees/salary
- /finances
- /daily-ledger/employee-ledger
- /admin

## 🆘 Troubleshooting Guide

### Setup Issues
→ [SETUP.md](SETUP.md) Troubleshooting section

### Runtime Errors
→ [README.md](README.md) Troubleshooting section

### Command Reference
→ [COMMANDS.md](COMMANDS.md) Troubleshooting Commands

### API Issues
→ [API.md](API.md) Error Responses section

## 🔄 Update History

### Version 1.0 (February 3, 2026)
- ✅ Initial complete implementation
- ✅ Full authentication system
- ✅ User management (CRUD)
- ✅ Role-based access control
- ✅ Email integration
- ✅ Mobile-responsive UI
- ✅ Complete documentation

## 📞 Getting Help

1. **Check the docs first** - Most answers are here
2. **Use the search** - Ctrl+F in each file
3. **Follow setup guide** - [SETUP.md](SETUP.md) is comprehensive
4. **Check checklist** - [CHECKLIST.md](CHECKLIST.md) for verification
5. **Review architecture** - [ARCHITECTURE.md](ARCHITECTURE.md) for understanding

## 🎓 Learning Path

### For New Developers

1. Read [PROJECT-SUMMARY.md](PROJECT-SUMMARY.md) - Understand what's built
2. Read [ARCHITECTURE.md](ARCHITECTURE.md) - Understand how it works
3. Follow [SETUP.md](SETUP.md) - Get it running locally
4. Read [API.md](API.md) - Learn the API
5. Explore the code - Start with `app/login/page.tsx`

### For System Administrators

1. Read [SETUP.md](SETUP.md) - Set up the system
2. Use [CHECKLIST.md](CHECKLIST.md) - Verify setup
3. Read [COMMANDS.md](COMMANDS.md) - Learn maintenance commands
4. Keep [README.md](README.md) - For quick reference

### For Project Managers

1. Read [PROJECT-SUMMARY.md](PROJECT-SUMMARY.md) - See what's done
2. Read [README.md](README.md) - Understand capabilities
3. Check "Future Development" - See what's next

## 📝 Contributing

Before making changes:

1. Understand the architecture - [ARCHITECTURE.md](ARCHITECTURE.md)
2. Follow existing patterns - Review current code
3. Test thoroughly - Use [COMMANDS.md](COMMANDS.md) for testing
4. Update docs - Keep documentation current

## ⚡ Quick Actions

### Just want to run it?
```bash
# 1. Set up .env.local (copy from .env.example)
# 2. Run:
npm install
npm run dev
```

### Just want to deploy the Edge Function?
```bash
supabase login
supabase link --project-ref YOUR_REF
supabase functions deploy send-reset-email
```

### Just want to test the API?
See: [COMMANDS.md](COMMANDS.md) Testing Commands section

### Just want to add a user?
1. Login at http://localhost:3000/login
2. Go to Admin Panel
3. Click "Create User"

---

## 📚 Full Documentation List

1. ⭐ [PROJECT-SUMMARY.md](PROJECT-SUMMARY.md) - Complete overview
2. ⭐ [README.md](README.md) - Main documentation
3. ⭐ [SETUP.md](SETUP.md) - Setup guide
4. ⭐ [CHECKLIST.md](CHECKLIST.md) - Setup checklist
5. 📘 [API.md](API.md) - API documentation
6. 📘 [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
7. 📘 [COMMANDS.md](COMMANDS.md) - Command reference
8. 📘 [INDEX.md](INDEX.md) - This file
9. 📋 [.env.example](.env.example) - Environment template
10. 📊 [supabase/schema.sql](supabase/schema.sql) - Database schema

---

**Happy Building! 🚀**

*Last Updated: February 3, 2026*
