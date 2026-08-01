/**
 * Stand-in for Next's `cookies()` store from `next/headers`.
 *
 * The app reads and writes auth cookies through two different paths:
 *   - `getAccessToken()` / `setAuthCookies()` in lib/auth/jwt.ts use `next/headers`
 *   - `verifyAuth(request)` reads `request.cookies`
 *
 * This jar backs the first path, so tests can both seed a session and assert on the
 * cookies a handler set (name, value and options such as httpOnly/maxAge/sameSite).
 */

export interface CookieOptions {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
  maxAge?: number
  path?: string
  expires?: Date
}

export interface StoredCookie {
  name: string
  value: string
  options: CookieOptions
}

class CookieJar {
  private cookies = new Map<string, StoredCookie>()
  /** Names passed to `delete()` — the app clears auth cookies on logout. */
  public deleted: string[] = []

  get(name: string): { name: string; value: string } | undefined {
    const cookie = this.cookies.get(name)
    return cookie ? { name: cookie.name, value: cookie.value } : undefined
  }

  getAll(): Array<{ name: string; value: string }> {
    return [...this.cookies.values()].map(({ name, value }) => ({ name, value }))
  }

  set(name: string, value: string, options: CookieOptions = {}): void {
    this.cookies.set(name, { name, value, options })
  }

  delete(name: string): void {
    this.cookies.delete(name)
    this.deleted.push(name)
  }

  has(name: string): boolean {
    return this.cookies.has(name)
  }

  /** Full record including the options it was set with — for assertions. */
  inspect(name: string): StoredCookie | undefined {
    return this.cookies.get(name)
  }

  clear(): void {
    this.cookies.clear()
    this.deleted = []
  }
}

export const cookieJar = new CookieJar()
