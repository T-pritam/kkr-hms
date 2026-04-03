import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client with the service role key.
 * ONLY use this in server-side code (API routes, server actions).
 * Never expose this client to the browser.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
