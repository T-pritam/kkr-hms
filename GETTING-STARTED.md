# 🎯 Getting Started - For Absolute Beginners

**Never set up a web application before? No problem! Follow these simple steps.**

## What You'll Need

### 1. A Computer
- Windows, Mac, or Linux - any will work
- At least 4GB RAM
- 2GB free disk space

### 2. Internet Connection
- You'll need to download some software and create accounts

### 3. About 30-45 Minutes
- Most of this is waiting for things to install

## Step-by-Step Guide

### Part 1: Install Node.js (5 minutes)

**What is Node.js?** It's software that lets you run JavaScript code on your computer (not just in a browser).

1. Go to https://nodejs.org
2. Click the big green button that says "Download Node.js (LTS)"
3. Run the downloaded file
4. Click "Next" through all the steps (default settings are fine)
5. When it finishes, restart your computer

**Test if it worked:**
- Open Terminal (Mac/Linux) or Command Prompt (Windows)
- Type: `node --version`
- You should see something like `v18.17.0` or higher
- If you do, great! If not, try restarting your computer again.

### Part 2: Create Accounts (10 minutes)

#### A. Supabase Account (Database)

**What is Supabase?** It's where your data (users, patients, etc.) will be stored.

1. Go to https://supabase.com
2. Click "Start your project"
3. Sign up with your email or GitHub
4. Verify your email
5. **Keep this tab open** - you'll need it soon!

#### B. Brevo Account (Email)

**What is Brevo?** It sends emails (like password reset emails) for you.

1. Go to https://www.brevo.com
2. Click "Sign up free"
3. Fill in the form with your details
4. Verify your email
5. **Keep this tab open** - you'll need it soon!

### Part 3: Set Up the Database (10 minutes)

**Go to your Supabase tab:**

1. Click "New Project"
2. Fill in:
   - **Name**: KKR Hospital (or anything you like)
   - **Database Password**: Create a strong password
   - **Save this password somewhere safe!**
   - **Region**: Pick the closest to you
3. Click "Create new project"
4. **Wait 2-3 minutes** - grab a coffee! ☕

**Once your project is ready:**

5. Click "SQL Editor" in the left sidebar
6. Don't close this - we'll come back to it

**Get your project credentials:**

7. Click the gear icon (⚙️) at the bottom left
8. Click "API" in the settings menu
9. You'll see:
   - **Project URL** - copy this somewhere
   - **anon public** - copy the key below it
   - **service_role** - click "Reveal" and copy that too
10. Keep these somewhere safe - you'll need them soon!

### Part 4: Set Up Email Sending (5 minutes)

**Go to your Brevo tab:**

1. Click your name in the top right
2. Select "SMTP & API"
3. Click "API Keys"
4. Click "Generate a new API key"
5. Give it a name: "KKR HMS"
6. **Copy this key immediately** - you won't see it again!
7. Save it somewhere safe

**Verify your email address:**

8. Go to "Senders & IP" > "Senders"
9. Click "Add a sender"
10. Enter your email address
11. Click the verification link in the email they send you
12. Come back and you should see a green checkmark ✓

### Part 5: Download the Project (2 minutes)

**If you have the code:**
1. Extract the zip file to a folder
2. Remember where you put it!

**If it's on GitHub:**
1. Open Terminal/Command Prompt
2. Type: `git clone YOUR_GITHUB_URL`
3. Press Enter

### Part 6: Set Up Your Configuration (5 minutes)

1. Open the project folder
2. Find the file called `.env.example`
3. **Make a copy** of it and rename the copy to `.env.local`
4. Open `.env.local` with a text editor (Notepad on Windows, TextEdit on Mac)

**Now fill in the blanks:**

Replace the placeholder values with your real values from earlier:

```env
NEXT_PUBLIC_SUPABASE_URL=paste_your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=paste_your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=paste_your_supabase_service_key_here
JWT_SECRET=any_random_text_at_least_32_characters_long_like_this_one
BREVO_API_KEY=paste_your_brevo_api_key_here
BREVO_SENDER_EMAIL=your_verified_email@example.com
BREVO_SENDER_NAME=KKR Hospital
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**For JWT_SECRET:** Just type random letters and numbers, at least 32 characters. Like: `my-super-secret-key-12345678901234567890`

5. **Save the file** (very important!)

### Part 7: Set Up the Database Tables (5 minutes)

1. Go back to your Supabase tab
2. Make sure you're in the "SQL Editor"
3. Click "+ New query"
4. Now, in the project folder, find the file: `supabase/schema.sql`
5. Open it with a text editor
6. **Select all the text** (Ctrl+A on Windows, Cmd+A on Mac)
7. **Copy it** (Ctrl+C or Cmd+C)
8. **Go back to Supabase**
9. **Paste** it in the SQL Editor (Ctrl+V or Cmd+V)
10. Click "Run" or press Ctrl+Enter

**You should see:** "Success. No rows returned"

**If you see an error:** Don't panic! Just click "Run" again. If it still fails, ask for help.

### Part 8: Install Everything (5 minutes)

1. Open Terminal/Command Prompt
2. Navigate to your project folder:
   ```bash
   cd /path/to/kkr-hms
   ```
   (Replace `/path/to/kkr-hms` with where you put the project)

3. Type this command:
   ```bash
   npm install
   ```

4. **Press Enter and wait** - this will take a few minutes
5. You'll see lots of text scrolling - that's normal!
6. When it stops and you can type again, you're done!

### Part 9: Run the Application! (1 minute)

Still in Terminal/Command Prompt:

1. Type:
   ```bash
   npm run dev
   ```

2. Press Enter

3. Wait a few seconds

4. You should see:
   ```
   ▲ Next.js 16.x.x
   - Local:    http://localhost:3000
   ✓ Ready in Xs
   ```

5. **Open your web browser**

6. Go to: **http://localhost:3000**

### Part 10: Login! 🎉

You should see a login page!

**Use these credentials:**
- Email: `admin@kkrhospital.com`
- Password: `Admin@123`

**First time login:**
1. You'll be asked to change your password
2. Enter a new strong password
3. Remember it!
4. Click "Change Password"

**You're in!** 🎊

You should now see the Dashboard!

## What to Do Next

### Explore the System

Click around and check out:
- Dashboard
- Admin Panel (try creating a test user!)
- Patients, Doctors, etc. (these are empty for now)

### Create Your First User

1. Click "Admin Panel" in the sidebar
2. Click the orange "+ Create User" button
3. Fill in:
   - Username: testuser
   - Email: test@example.com (or your real email)
   - Password: Test@123
   - Role: Receptionist
   - Status: Active
4. Click "Create User"

You should see them in the user list!

### Test Password Reset (If you used a real email)

1. Find the user you just created
2. Click the key icon (🔑)
3. Confirm
4. Check your email inbox
5. Click the reset link
6. Set a new password

## Common Problems

### "npm: command not found"
→ Node.js isn't installed properly. Go back to Part 1.

### "Cannot find module"
→ Run `npm install` again

### Can't see the login page
→ Check that `npm run dev` is still running

### "Invalid credentials" when logging in
→ Make sure you're using `admin@kkrhospital.com` and `Admin@123`

### Email not sending
→ Check your Brevo API key in `.env.local`

## Need Help?

1. Check if `npm run dev` is still running
2. Try restarting: Press Ctrl+C, then run `npm run dev` again
3. Check SETUP.md for more detailed help
4. Check CHECKLIST.md to verify everything is set up

## Stopping the Application

When you're done:

1. Go to the Terminal/Command Prompt where it's running
2. Press `Ctrl+C`
3. Close the terminal

**To start again later:**
1. Open Terminal/Command Prompt
2. Navigate to the project: `cd /path/to/kkr-hms`
3. Run: `npm run dev`

---

## You Did It! 🎉

You've successfully set up a professional hospital management system!

**What you learned:**
- ✅ How to set up a database (Supabase)
- ✅ How to configure email services (Brevo)
- ✅ How to run a Next.js application
- ✅ How to manage environment variables
- ✅ Basic terminal/command prompt usage

**Next steps:**
- Play around with the system
- Create users with different roles
- Check out the other documentation to learn more
- Start building the patient and doctor management features!

---

**Welcome to the world of web development! 🚀**
