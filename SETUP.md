# SETUP GUIDE - KKR Hospital Management System

Follow these steps carefully to set up and run the application.

## Step 1: Supabase Setup

### 1.1 Create Supabase Project
1. Go to [https://supabase.com](https://supabase.com)
2. Click "Start your project"
3. Create a new organization (if needed)
4. Click "New Project"
5. Fill in:
   - **Name**: KKR HMS (or your choice)
   - **Database Password**: Create a strong password (save it!)
   - **Region**: Choose closest to your location
6. Click "Create new project" and wait 2-3 minutes

### 1.2 Get API Credentials
1. In your Supabase project, go to **Settings** (gear icon) > **API**
2. Copy and save these values:
   - **Project URL** (looks like: https://xxxxx.supabase.co)
   - **anon/public key** (under "Project API keys")
   - **service_role key** (under "Project API keys" - click "Reveal")

### 1.3 Set Up Database
1. Go to **SQL Editor** in the left sidebar
2. Click "+ New query"
3. Open the file `supabase/schema.sql` from this project
4. Copy ALL the SQL content
5. Paste it into the Supabase SQL Editor
6. Click "Run" or press Ctrl+Enter
7. You should see "Success. No rows returned" - this is correct!

✅ **Checkpoint**: You now have a database with a users table and a default admin user

## Step 2: Brevo Email Setup

### 2.1 Create Brevo Account
1. Go to [https://www.brevo.com](https://www.brevo.com)
2. Click "Sign up free"
3. Fill in your details and verify your email
4. Complete the account setup

### 2.2 Get Brevo API Key
1. After login, go to your account menu (top right)
2. Click **SMTP & API** > **API Keys**
3. Click "Generate a new API key"
4. Name it: "KKR HMS Production"
5. Copy the API key immediately (you can't see it again!)
6. Save it securely

### 2.3 Verify Sender Email (Important!)
1. Go to **Senders & IP** > **Senders**
2. Click "Add a sender"
3. Enter an email you own (e.g., admin@yourdomain.com)
4. Brevo will send a verification email
5. Click the link in the email to verify

⚠️ **Note**: Use this verified email as your BREVO_SENDER_EMAIL

## Step 3: Configure Environment Variables

1. Open the file `.env.local` in the project root
2. Replace the placeholder values:

```env
# Supabase - From Step 1.2
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# JWT Secret - Generate a random string
# You can use: openssl rand -base64 32
JWT_SECRET=your_random_32_character_secret_here

# Brevo - From Step 2.2 and 2.3
BREVO_API_KEY=xkeysib-xxxxx
BREVO_SENDER_EMAIL=verified-email@yourdomain.com
BREVO_SENDER_NAME=KKR Hospital

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### How to generate JWT_SECRET:

**Option 1 - Using OpenSSL (Linux/Mac):**
```bash
openssl rand -base64 32
```

**Option 2 - Using Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Option 3 - Online:**
Go to [https://www.random.org/strings/](https://www.random.org/strings/) and generate a 32+ character random string

✅ **Checkpoint**: Your `.env.local` file is now configured

## Step 4: Deploy Supabase Edge Function

This Edge Function sends password reset emails via Brevo.

### 4.1 Install Supabase CLI

**macOS:**
```bash
brew install supabase/tap/supabase
```

**Windows (with Scoop):**
```bash
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Linux:**
```bash
npm install -g supabase
```

**Verify installation:**
```bash
supabase --version
```

### 4.2 Login to Supabase
```bash
supabase login
```
This will open a browser window. Click "Authorize" to continue.

### 4.3 Link Your Project
```bash
cd /home/pritam/kkr-hms
supabase link --project-ref YOUR_PROJECT_REF
```

**To find YOUR_PROJECT_REF:**
- Go to Supabase Dashboard
- Your project URL is: `https://YOUR_PROJECT_REF.supabase.co`
- Copy the `YOUR_PROJECT_REF` part

### 4.4 Deploy the Edge Function
```bash
supabase functions deploy send-reset-email
```

Wait for "Deployed Function send-reset-email" message.

### 4.5 Set Edge Function Secrets
```bash
supabase secrets set BREVO_API_KEY=your_brevo_api_key_here
supabase secrets set BREVO_SENDER_EMAIL=verified-email@yourdomain.com
supabase secrets set BREVO_SENDER_NAME="KKR Hospital"
```

Replace with your actual Brevo values.

✅ **Checkpoint**: Edge Function is deployed and configured

## Step 5: Run the Application

### 5.1 Install Dependencies
```bash
cd /home/pritam/kkr-hms
npm install
```

### 5.2 Start Development Server
```bash
npm run dev
```

You should see:
```
▲ Next.js 14.x.x
- Local:        http://localhost:3000
- Ready in X.Xs
```

### 5.3 Access the Application
Open your browser and go to: **http://localhost:3000**

You should be redirected to the login page.

## Step 6: First Login

### 6.1 Login as Admin
Use the default credentials:
- **Email**: admin@kkrhospital.com
- **Password**: Admin@123

### 6.2 Change Password (Required)
After successful login, you'll be redirected to change your password.
1. Leave "Current Password" empty (it's a reset)
2. Enter a new strong password
3. Confirm the password
4. Click "Change Password"

You'll be redirected to the dashboard.

✅ **Success!** You're now logged in as Admin

## Step 7: Create Your First User

### 7.1 Go to Admin Panel
Click "Admin Panel" in the sidebar

### 7.2 Create a User
1. Click the orange "+ Create User" button
2. Fill in:
   - **Username**: testuser
   - **Email**: testuser@example.com
   - **Password**: Test@123
   - **Role**: Receptionist
   - **Status**: Active
3. Click "Create User"

### 7.3 Test Password Reset (Optional)
1. Click the key icon (🔑) next to the new user
2. Confirm sending reset email
3. Check the email inbox (testuser@example.com)
4. Click the reset link in the email
5. Set a new password

## Troubleshooting

### Problem: "Error fetching users" in Admin Panel
**Solution**: 
- Check that you ran the database schema in Supabase
- Verify Supabase credentials in `.env.local`
- Check browser console for errors

### Problem: "Email not sent" when resetting password
**Solution**:
- Verify Brevo API key is correct
- Check that sender email is verified in Brevo
- Ensure Edge Function is deployed:
  ```bash
  supabase functions list
  ```
- Check Edge Function logs:
  ```bash
  supabase functions logs send-reset-email
  ```

### Problem: "Cannot login" with default credentials
**Solution**:
- Ensure database schema was executed successfully
- Check Supabase SQL Editor for any errors
- Try running the schema again

### Problem: "Invalid token" or automatic logout
**Solution**:
- Clear browser cookies
- Check that JWT_SECRET is set in `.env.local`
- Ensure it's at least 32 characters long

### Problem: Next.js won't start
**Solution**:
- Delete `node_modules` and `.next` folders:
  ```bash
  rm -rf node_modules .next
  npm install
  npm run dev
  ```

## Production Deployment

When deploying to production:

1. **Update NEXT_PUBLIC_APP_URL**:
   ```env
   NEXT_PUBLIC_APP_URL=https://your-domain.com
   ```

2. **Deploy to Vercel** (Recommended):
   ```bash
   npm install -g vercel
   vercel
   ```

3. **Add Environment Variables in Vercel**:
   - Go to Project Settings > Environment Variables
   - Add all variables from `.env.local`

4. **Update Edge Function Secrets** for production Supabase

5. **Enable Database Backups** in Supabase

## Next Steps

Now that your system is running:

1. ✅ Create users with different roles (Doctor, Nurse, Receptionist)
2. ✅ Test role-based access (login as different users)
3. ✅ Explore the dashboard and sections
4. ✅ Implement the placeholder sections (Patients, Doctors, etc.)

## Support

If you encounter any issues:
1. Check the troubleshooting section above
2. Review the README.md file
3. Check browser console for errors
4. Review Supabase logs
5. Check Edge Function logs

## Security Checklist

Before going to production:

- [ ] Changed default admin password
- [ ] Set strong JWT_SECRET (32+ characters)
- [ ] Verified all environment variables
- [ ] Enabled Supabase database backups
- [ ] Set up proper email domain (not using free email)
- [ ] Reviewed Row Level Security policies
- [ ] Tested all user roles
- [ ] Enabled HTTPS in production

---

**Congratulations! Your KKR Hospital Management System is now ready to use! 🎉**
