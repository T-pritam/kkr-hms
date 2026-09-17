/**
 * A `fetch` for talking to Supabase from this long-running Node process.
 *
 * Node's built-in `fetch` (undici) pools keep-alive connections. Leave this
 * dev/prod server idle for a while and the remote end — Supabase's own edge,
 * or a proxy in front of it — closes its side of a pooled socket without
 * telling this process. The next request that happens to reuse exactly that
 * socket throws `TypeError: fetch failed` (wrapping ECONNRESET / a closed
 * socket), even though the network and Supabase are both fine. This is why it
 * shows up specifically "after a long time", on the very first request back,
 * and on any page — it is not a query, a role or a permission problem.
 *
 * A brand-new connection always succeeds, so the fix is one immediate retry
 * on exactly this error rather than a broader reimplementation of fetch.
 */
export async function resilientFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (error instanceof TypeError && error.message === 'fetch failed') {
      return fetch(input, init)
    }
    throw error
  }
}
