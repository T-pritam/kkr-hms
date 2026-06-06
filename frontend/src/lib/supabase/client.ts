import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Read-only Supabase client used ONLY for realtime change notifications
 * (see use-realtime-refetch). All data reads/writes go through the Spring Boot
 * backend; this never touches Supabase tables directly beyond the realtime stream.
 */
export function createClient() {
  return createSupabaseClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  )
}
