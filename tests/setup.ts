/**
 * Global test setup: environment, module mocks, and per-test isolation.
 * Runs before every test file (see vitest.config.ts `setupFiles`).
 */

import { beforeEach, afterEach, vi } from 'vitest'

// Env must be assigned before any app module is imported: lib/auth/jwt.ts reads
// JWT_SECRET at module load time.
process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.DEFAULT_PASSWORD = 'Welcome@123'
process.env.NEXT_PUBLIC_APP_URL = 'https://hms.test'
process.env.R2_ACCOUNT_ID = 'test-account'
process.env.R2_ACCESS_KEY_ID = 'test-access-key'
process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key'
process.env.NEXT_PUBLIC_R2_BUCKET_NAME = 'hms-case-sheets'

// --- Module mocks -----------------------------------------------------------
// Registered here so every test file gets them without repeating the boilerplate.

vi.mock('next/headers', async () => {
  const { cookieJar } = await import('./helpers/cookie-jar')
  return { cookies: async () => cookieJar }
})

vi.mock('@/lib/supabase/server', async () => {
  const { createFakeClient, db } = await import('./helpers/fake-supabase')
  return { createClient: async () => createFakeClient(db) }
})

vi.mock('@/lib/supabase/service', async () => {
  const { createFakeClient, db } = await import('./helpers/fake-supabase')
  return { createServiceClient: () => createFakeClient(db) }
})

// The real one calls supabase.auth.getUser() over the network on every request.
vi.mock('@/lib/supabase/middleware', async () => {
  const { NextResponse } = await import('next/server')
  return {
    updateSession: async (request: any) => ({
      supabaseResponse: NextResponse.next({ request }),
      user: null,
    }),
  }
})

// --- Per-test isolation -----------------------------------------------------

/**
 * A fixed clock. Many handlers default dates with `new Date()`, so freezing time
 * makes those defaults assertable. 2026-03-15T10:30:00Z is mid-month and mid-day,
 * which keeps IST (+05:30) conversions on the same calendar date.
 */
export const NOW = new Date('2026-03-15T10:30:00.000Z')
export const TODAY = '2026-03-15'
export const THIS_MONTH = '2026-03'

beforeEach(async () => {
  const { db } = await import('./helpers/fake-supabase')
  const { cookieJar } = await import('./helpers/cookie-jar')
  db.reset()
  cookieJar.clear()
  // Freeze Date only. setImmediate/nextTick stay real so bcryptjs's async hashing
  // still resolves; faking them would deadlock any handler that hashes a password.
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
