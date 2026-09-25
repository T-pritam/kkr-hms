import { createServiceClient } from '@/lib/supabase/service'
import type { TokenPayload } from './jwt'

/**
 * Is this session still one the user would recognise? (BUGS.md #3)
 *
 * Checked at every renewal — at most ten minutes apart — rather than on every
 * request, so it costs one small read per session per ten minutes. A session
 * stops renewing when:
 *   * the account is gone, or no longer ACTIVE — deactivating someone used to
 *     leave their 7-day session running;
 *   * the password has changed since the token was issued (`token_version`).
 *
 * Tokens from before versions existed carry no `tv` and read as 0, which is the
 * column's default, so the deploy signs nobody out.
 *
 * **If the check itself cannot run** — no service key, the column not migrated
 * yet, the database unreachable — the session is kept, exactly as it was before
 * this existed. Failing closed there would sign every user out on a blip, and
 * nothing a caller sends can cause those failures.
 */
export async function isSessionCurrent(payload: Pick<TokenPayload, 'userId' | 'tv'>): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return true

  try {
    const { data, error } = await createServiceClient()
      .from('users')
      .select('status, token_version')
      .eq('id', payload.userId)
      .maybeSingle()

    if (error) return true
    if (!data) return false
    if (data.status !== 'ACTIVE') return false
    return (payload.tv ?? 0) === (Number(data.token_version) || 0)
  } catch {
    return true
  }
}
