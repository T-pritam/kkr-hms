/**
 * Central API client. Every former `fetch('/api/...')` call goes through here so
 * there is one place that owns the backend base URL, credentialed (cookie) auth,
 * and transparent access-token refresh.
 *
 * The original app served its API under `/api/*`; the Spring Boot backend serves
 * the same routes at the root, so we strip the `/api` prefix when rewriting.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

function toUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  const stripped = path.startsWith('/api') ? path.slice(4) : path
  return BASE_URL + (stripped.startsWith('/') ? stripped : '/' + stripped)
}

// Single-flight refresh so concurrent 401s trigger only one /auth/refresh.
let refreshing: Promise<boolean> | null = null

function refreshTokens(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(toUrl('/auth/refresh'), { method: 'POST', credentials: 'include' })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

const NO_REFRESH = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/reset-password']

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const options: RequestInit = { ...init, credentials: 'include' }
  const response = await fetch(toUrl(path), options)

  const isAuthFlow = NO_REFRESH.some((p) => path.includes(p))
  if (response.status === 401 && !isAuthFlow) {
    const ok = await refreshTokens()
    if (ok) {
      return fetch(toUrl(path), options)
    }
  }
  return response
}
