# Quick Reference Commands

## Development Commands

### Start the application
```bash
npm run dev
```
Access at: http://localhost:3000

### Build for production
```bash
npm run build
npm start
```

### Install dependencies
```bash
npm install
```

### Clean install (if issues)
```bash
rm -rf node_modules .next
npm install
npm run dev
```

## Supabase Commands

### Login to Supabase
```bash
supabase login
```

### Link project
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

### Deploy Edge Function
```bash
supabase functions deploy send-reset-email
```

### Set Edge Function secrets
```bash
supabase secrets set BREVO_API_KEY=your_key
supabase secrets set BREVO_SENDER_EMAIL=your_email
supabase secrets set BREVO_SENDER_NAME="KKR Hospital"
```

### List functions
```bash
supabase functions list
```

### View function logs
```bash
supabase functions logs send-reset-email
```

### Serve function locally (testing)
```bash
supabase functions serve send-reset-email
```

## Database Commands

### Run schema (in Supabase SQL Editor)
1. Go to Supabase Dashboard > SQL Editor
2. Copy content from `supabase/schema.sql`
3. Paste and run

### Check tables
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';
```

### View users
```sql
SELECT id, username, email, role, status FROM users;
```

### Reset admin password manually
```sql
UPDATE users 
SET password_hash = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIiIz1z8Ge',
    needs_password_change = true
WHERE email = 'admin@kkrhospital.com';
```
(Password will be: Admin@123)

## Git Commands (Optional)

### Initialize git
```bash
git init
```

### Add files
```bash
git add .
```

### Commit
```bash
git commit -m "Initial commit: KKR HMS"
```

### Push to remote
```bash
git remote add origin YOUR_REPO_URL
git push -u origin main
```

## Environment Variables

### Generate JWT Secret
```bash
# Option 1: OpenSSL
openssl rand -base64 32

# Option 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Check environment variables
```bash
cat .env.local
```

## Testing Commands

### Test API with curl

**Login:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kkrhospital.com","password":"Admin@123"}' \
  -c cookies.txt -v
```

**Get users:**
```bash
curl -X GET http://localhost:3000/api/admin/users \
  -b cookies.txt
```

**Create user:**
```bash
curl -X POST http://localhost:3000/api/admin/users \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "username":"testuser",
    "email":"test@example.com",
    "password":"Test@123",
    "role":"RECEPTIONIST",
    "status":"ACTIVE"
  }'
```

## Troubleshooting Commands

### Clear Next.js cache
```bash
rm -rf .next
npm run dev
```

### Check Node version
```bash
node --version  # Should be 18+
```

### Check npm version
```bash
npm --version
```

### Check Supabase CLI version
```bash
supabase --version
```

### View Next.js errors
Check terminal where `npm run dev` is running

### View browser errors
Press F12 > Console tab

### Clear browser cache
1. Press F12
2. Right-click refresh button
3. Select "Empty Cache and Hard Reload"

### Clear cookies
```javascript
// In browser console:
document.cookie.split(";").forEach(c => {
  document.cookie = c.replace(/^ +/, "")
    .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
});
```

## Production Deployment

### Deploy to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
```

### Update production URL
```env
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## Maintenance Commands

### Update dependencies
```bash
npm update
```

### Check for outdated packages
```bash
npm outdated
```

### Security audit
```bash
npm audit
npm audit fix
```

## Useful Shortcuts

### Default Login
- Email: `admin@kkrhospital.com`
- Password: `Admin@123`

### Local URLs
- App: http://localhost:3000
- Login: http://localhost:3000/login
- Dashboard: http://localhost:3000/dashboard
- Admin: http://localhost:3000/admin

### Important Files
- Environment: `.env.local`
- Schema: `supabase/schema.sql`
- Edge Function: `supabase/functions/send-reset-email/index.ts`
- Middleware: `middleware.ts`

## Quick Checks

### Is the app running?
```bash
curl http://localhost:3000
```

### Is Supabase connected?
Check browser console after login

### Is Edge Function deployed?
```bash
supabase functions list
```

### Are all env vars set?
```bash
grep -v '^#' .env.local | grep '='
```

---

**Keep this file handy for quick reference!**
