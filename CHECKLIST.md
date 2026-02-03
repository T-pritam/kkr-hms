# Quick Start Checklist ✅

Use this checklist to ensure everything is set up correctly.

## Prerequisites Check
- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] Git installed (optional)

## Supabase Setup
- [ ] Created Supabase account
- [ ] Created new Supabase project
- [ ] Copied Project URL
- [ ] Copied Anon/Public Key
- [ ] Copied Service Role Key
- [ ] Ran database schema in SQL Editor
- [ ] Confirmed "Success" message after schema execution

## Brevo Setup
- [ ] Created Brevo account
- [ ] Generated API key
- [ ] Verified sender email address
- [ ] Saved API key and sender email

## Environment Configuration
- [ ] Opened `.env.local` file
- [ ] Added NEXT_PUBLIC_SUPABASE_URL
- [ ] Added NEXT_PUBLIC_SUPABASE_ANON_KEY
- [ ] Added SUPABASE_SERVICE_ROLE_KEY
- [ ] Generated and added JWT_SECRET (32+ chars)
- [ ] Added BREVO_API_KEY
- [ ] Added BREVO_SENDER_EMAIL (verified email)
- [ ] Added BREVO_SENDER_NAME
- [ ] Set NEXT_PUBLIC_APP_URL

## Edge Function Deployment
- [ ] Installed Supabase CLI
- [ ] Logged in to Supabase (`supabase login`)
- [ ] Linked project (`supabase link`)
- [ ] Deployed function (`supabase functions deploy send-reset-email`)
- [ ] Set BREVO_API_KEY secret
- [ ] Set BREVO_SENDER_EMAIL secret
- [ ] Set BREVO_SENDER_NAME secret
- [ ] Verified deployment (`supabase functions list`)

## Application Setup
- [ ] Installed dependencies (`npm install`)
- [ ] No errors during installation
- [ ] Started dev server (`npm run dev`)
- [ ] Server running on http://localhost:3000

## First Login Test
- [ ] Opened http://localhost:3000
- [ ] Redirected to /login page
- [ ] Logged in with admin@kkrhospital.com / Admin@123
- [ ] Redirected to /change-password page
- [ ] Changed password successfully
- [ ] Redirected to /dashboard

## Admin Panel Test
- [ ] Navigated to Admin Panel
- [ ] Saw "User Management" page
- [ ] Saw admin user in table
- [ ] Created new test user
- [ ] User appeared in table
- [ ] Status toggle works
- [ ] Edit user works
- [ ] Delete user works (on test user only!)

## Email Test (Optional but Recommended)
- [ ] Created test user with real email
- [ ] Clicked reset password button
- [ ] Received email at that address
- [ ] Email has KKR Hospital branding
- [ ] Reset link works
- [ ] Password reset successful

## Navigation Test
- [ ] Clicked Dashboard - page loads
- [ ] Clicked Patients - page loads
- [ ] Clicked Doctors - page loads
- [ ] Clicked Employees > Employee Details - page loads
- [ ] Clicked Employees > Employee Salary - page loads
- [ ] Clicked Finances - page loads
- [ ] Clicked Daily Ledger > Daily Summary - page loads
- [ ] Clicked Daily Ledger > Employee Shift Schedule - page loads
- [ ] Clicked Admin Panel - page loads
- [ ] Sidebar collapses on mobile view

## Security Test
- [ ] Logged out
- [ ] Tried accessing /dashboard without login - redirected to /login
- [ ] Logged in as non-admin user (if created)
- [ ] Cannot access /admin page (redirected to /dashboard)
- [ ] Cannot access /employees (redirected to /dashboard)
- [ ] Cannot access /finances (redirected to /dashboard)

## Clean Up Test Data
- [ ] Deleted any test users created during testing
- [ ] Kept only the admin user (or real users)

## Production Preparation (Before Deploying)
- [ ] Changed default admin password to strong password
- [ ] Generated new strong JWT_SECRET
- [ ] Set up proper domain email (not free email)
- [ ] Updated NEXT_PUBLIC_APP_URL to production URL
- [ ] Enabled Supabase database backups
- [ ] Reviewed Row Level Security policies
- [ ] Tested all features one more time

## Optional Enhancements
- [ ] Set up custom domain
- [ ] Configure SSL certificate
- [ ] Set up database backups
- [ ] Enable Supabase Auth (if needed)
- [ ] Set up monitoring/logging
- [ ] Add analytics

---

## If Something Doesn't Work

### Can't Login
1. Check Supabase credentials in `.env.local`
2. Verify database schema was executed
3. Check browser console for errors
4. Try resetting cookies

### Email Not Sending
1. Verify Brevo API key
2. Check sender email is verified
3. Check Edge Function logs: `supabase functions logs send-reset-email`
4. Verify Edge Function secrets are set

### Token Errors
1. Clear browser cookies
2. Check JWT_SECRET is set
3. Ensure JWT_SECRET is 32+ characters
4. Restart dev server

### Database Errors
1. Re-run schema.sql
2. Check Supabase project is active
3. Verify database password
4. Check Row Level Security policies

### Build Errors
1. Delete node_modules and .next
2. Run `npm install`
3. Run `npm run dev`

---

## Need Help?

1. Check SETUP.md for detailed instructions
2. Check API.md for API documentation
3. Check README.md for overview
4. Review browser console errors
5. Check Supabase logs
6. Check Next.js terminal output

---

**Once all checkboxes are ticked, your system is fully operational! 🎉**

Save this file and re-check items if you set up on a new machine or deploy to production.
