// @ts-nocheck
// This is a Supabase Edge Function running on Deno, not Node.js
// TypeScript errors are expected and can be ignored
// Follow these steps to deploy this Edge Function:

// 1. Install Supabase CLI: https://supabase.com/docs/guides/cli
// 2. Login to Supabase: supabase login
// 3. Link your project: supabase link --project-ref your-project-ref
// 4. Deploy the function: supabase functions deploy send-reset-email
// 5. Set the secrets:
//    supabase secrets set BREVO_API_KEY=your_brevo_api_key
//    supabase secrets set BREVO_SENDER_EMAIL=noreply@yourcompany.com
//    supabase secrets set BREVO_SENDER_NAME="KKR Hospital"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const { email, resetUrl, username } = await req.json()

    if (!email || !resetUrl) {
      return new Response(
        JSON.stringify({ error: 'Email and resetUrl are required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const brevoApiKey = Deno.env.get('BREVO_API_KEY')
    const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL')
    const senderName = Deno.env.get('BREVO_SENDER_NAME')

    if (!brevoApiKey) {
      throw new Error('BREVO_API_KEY not configured')
    }

    const emailData = {
      sender: {
        name: senderName || 'KKR Hospital',
        email: senderEmail || 'noreply@kkrhospital.com',
      },
      to: [
        {
          email: email,
          name: username || email,
        },
      ],
      subject: 'Password Reset Request - KKR Hospital',
      htmlContent: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">KKR Hospital</h1>
            <p style="color: #fed7aa; margin: 10px 0 0 0;">Hospital Management System</p>
          </div>
          
          <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
            <h2 style="color: #1f2937; margin-top: 0;">Password Reset Request</h2>
            
            <p style="color: #4b5563; font-size: 16px;">
              Hello ${username || 'User'},
            </p>
            
            <p style="color: #4b5563; font-size: 16px;">
              We received a request to reset your password for your KKR Hospital Management System account.
            </p>
            
            <p style="color: #4b5563; font-size: 16px;">
              Click the button below to reset your password:
            </p>
            
            <div style="text-align: center; margin: 35px 0;">
              <a href="${resetUrl}" 
                 style="background: #ea580c; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px;">
              Or copy and paste this link into your browser:
            </p>
            
            <p style="color: #ea580c; font-size: 14px; word-break: break-all; background: #fef3c7; padding: 12px; border-radius: 6px; border-left: 4px solid #ea580c;">
              ${resetUrl}
            </p>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              This link will expire in 1 hour for security reasons.
            </p>
            
            <p style="color: #6b7280; font-size: 14px;">
              If you didn't request this password reset, please ignore this email or contact your administrator.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
              This is an automated email from KKR Hospital Management System.<br>
              Please do not reply to this email.
            </p>
          </div>
        </body>
        </html>
      `,
    }

    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(emailData),
    })

    if (!response.ok) {
      const errorData = await response.text()
      console.error('Brevo API error:', errorData)
      throw new Error(`Brevo API error: ${response.status}`)
    }

    const data = await response.json()

    return new Response(JSON.stringify({ success: true, messageId: data.messageId }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'An error occurred' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
})
