import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { resilientFetch } from './resilient-fetch'

/**
 * The server's database client, used by every API route.
 *
 * It uses the server-only service-role key, not the anon key (BUGS #68). The
 * anon key ships to every browser, so the database grants it nothing but the
 * data-free `change_signals` feed that live refresh listens to
 * (hooks/use-realtime-refetch.ts). Every rule — who may read or change what —
 * is enforced by these routes, which is why only the server may reach the data.
 *
 * No cookies: the app signs people in with its own JWT (lib/auth), never with
 * Supabase Auth, so there is no Supabase session to forward — and forwarding
 * one would replace the service key with a user token the database refuses.
 *
 * If the service key were missing the anon key is used instead, loudly: that
 * keeps the app up on a misconfigured deploy while the database still allowed
 * it, and fails visibly (not silently) once the anon key's rights are gone.
 */
export async function createClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.error('[supabase] SUPABASE_SERVICE_ROLE_KEY is not set; falling back to the anon key, which the database refuses')
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: { fetch: resilientFetch },
    }
  )
}
