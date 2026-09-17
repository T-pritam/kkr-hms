/**
 * lib/supabase/resilient-fetch.ts
 *
 * Node's fetch throws `TypeError: fetch failed` when a pooled keep-alive
 * connection turns out to have been closed by the remote end — which is what
 * happens to a long-idle server process talking to Supabase. A fresh
 * connection on retry always succeeds, so this retries exactly once on
 * exactly that error and lets everything else through unchanged.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { resilientFetch } from '@/lib/supabase/resilient-fetch'

const fetchFailed = () => new TypeError('fetch failed')

describe('resilientFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the response on a normal, successful call', async () => {
    const response = new Response('ok')
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)

    const result = await resilientFetch('https://example.test')

    expect(result).toBe(response)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries once, and succeeds, after a stale-connection "fetch failed"', async () => {
    const response = new Response('ok')
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(fetchFailed())
      .mockResolvedValueOnce(response)
    vi.stubGlobal('fetch', fetchMock)

    const result = await resilientFetch('https://example.test')

    expect(result).toBe(response)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after the retry also fails with "fetch failed"', async () => {
    const fetchMock = vi.fn().mockRejectedValue(fetchFailed())
    vi.stubGlobal('fetch', fetchMock)

    await expect(resilientFetch('https://example.test')).rejects.toThrow('fetch failed')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a different error — only the exact stale-connection failure', async () => {
    const dnsError = new TypeError('fetch failed: getaddrinfo ENOTFOUND')
    const fetchMock = vi.fn().mockRejectedValue(dnsError)
    vi.stubGlobal('fetch', fetchMock)

    await expect(resilientFetch('https://example.test')).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry an application error the query itself raised', async () => {
    const queryError = new Error('permission denied for table patients')
    const fetchMock = vi.fn().mockRejectedValue(queryError)
    vi.stubGlobal('fetch', fetchMock)

    await expect(resilientFetch('https://example.test')).rejects.toBe(queryError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('passes the input and init through unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)

    const init = { method: 'POST', headers: { 'x-test': '1' } }
    await resilientFetch('https://example.test/rest', init)

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/rest', init)
  })
})
