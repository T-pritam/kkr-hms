/**
 * /api/admin/users — user administration (ADMIN only).
 */

import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'
import { GET as listUsers, POST as createUser } from '@/app/api/admin/users/route'
import {
  PUT as updateUser,
  PATCH as patchUser,
  DELETE as deleteUser,
} from '@/app/api/admin/users/[id]/route'
import { POST as resetToDefault } from '@/app/api/admin/users/[id]/reset-password/route'
import { call } from '../../helpers/request'
import { signInAs, signOut, expiredToken, hashPassword } from '../../helpers/auth'
import { cookieJar } from '../../helpers/cookie-jar'
import { db } from '../../helpers/fake-supabase'
import { aUser } from '../../helpers/seed'
import { NOW } from '../../setup'

const NON_ADMIN_ROLES = ['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const

describe('/api/admin/users — access control', () => {
  const endpoints = [
    { name: 'GET /api/admin/users', run: () => call(listUsers, 'GET', '/api/admin/users') },
    {
      name: 'POST /api/admin/users',
      run: () =>
        call(createUser, 'POST', '/api/admin/users', {
          body: { username: 'x', email: 'x@hms.test', password: 'Password@1', role: 'NURSE' },
        }),
    },
    {
      name: 'PUT /api/admin/users/[id]',
      run: () => call(updateUser, 'PUT', '/api/admin/users/u9', { body: { role: 'NURSE' }, params: { id: 'u9' } }),
    },
    {
      name: 'PATCH /api/admin/users/[id]',
      run: () => call(patchUser, 'PATCH', '/api/admin/users/u9', { body: { status: 'INACTIVE' }, params: { id: 'u9' } }),
    },
    {
      name: 'DELETE /api/admin/users/[id]',
      run: () => call(deleteUser, 'DELETE', '/api/admin/users/u9', { params: { id: 'u9' } }),
    },
    {
      name: 'POST /api/admin/users/[id]/reset-password',
      run: () => call(resetToDefault, 'POST', '/api/admin/users/u9/reset-password', { params: { id: 'u9' } }),
    },
  ]

  it.each(endpoints)('$name rejects an unauthenticated caller', async ({ run }) => {
    signOut()
    const { status, body } = await run()

    expect(status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  it.each(endpoints)('$name rejects an expired token', async ({ run }) => {
    cookieJar.set('accessToken', await expiredToken())
    const { status, body } = await run()

    expect(status).toBe(403)
    expect(body.error).toBe('Forbidden')
  })

  for (const role of NON_ADMIN_ROLES) {
    it.each(endpoints)(`$name rejects ${role}`, async ({ run }) => {
      await signInAs(role)
      const { status, body } = await run()

      expect(status).toBe(403)
      expect(body.error).toBe('Forbidden')
    })
  }
})

describe('GET /api/admin/users', () => {
  it('lists users with pagination metadata', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', username: 'alpha', created_at: '2026-01-01T00:00:00.000Z' })
    aUser({ id: 'u2', username: 'beta', created_at: '2026-02-01T00:00:00.000Z' })

    const { status, body } = await call(listUsers, 'GET', '/api/admin/users')

    expect(status).toBe(200)
    expect(body).toMatchObject({ total: 2, page: 1, pageSize: 10, totalPages: 1 })
    expect(body.users).toHaveLength(2)
  })

  it('never returns password hashes', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', password_hash: 'super-secret-hash' })

    const { body } = await call(listUsers, 'GET', '/api/admin/users')

    expect(body.users[0]).not.toHaveProperty('password_hash')
    expect(Object.keys(body.users[0]).sort()).toEqual(
      ['created_at', 'email', 'id', 'last_login', 'role', 'status', 'username'].sort()
    )
  })

  it('returns the newest users first', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'old', created_at: '2026-01-01T00:00:00.000Z' })
    aUser({ id: 'new', created_at: '2026-03-01T00:00:00.000Z' })

    const { body } = await call(listUsers, 'GET', '/api/admin/users')
    expect(body.users.map((u: any) => u.id)).toEqual(['new', 'old'])
  })

  it('paginates with page and pageSize', async () => {
    await signInAs('ADMIN')
    for (let i = 1; i <= 5; i++) {
      aUser({ id: `u${i}`, created_at: `2026-01-0${i}T00:00:00.000Z` })
    }

    const { body } = await call(listUsers, 'GET', '/api/admin/users', { query: { page: 2, pageSize: 2 } })

    expect(body).toMatchObject({ total: 5, page: 2, pageSize: 2, totalPages: 3 })
    expect(body.users.map((u: any) => u.id)).toEqual(['u3', 'u2'])
  })

  it('returns an empty page past the end of the list', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1' })

    const { body } = await call(listUsers, 'GET', '/api/admin/users', { query: { page: 9 } })
    expect(body.users).toEqual([])
    expect(body.total).toBe(1)
  })

  it('searches across username, email and role', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', username: 'ramesh', email: 'ramesh@hms.test', role: 'NURSE' })
    aUser({ id: 'u2', username: 'suresh', email: 'suresh@hms.test', role: 'RECEPTIONIST' })

    const byUsername = await call(listUsers, 'GET', '/api/admin/users', { query: { search: 'rame' } })
    expect(byUsername.body.users.map((u: any) => u.id)).toEqual(['u1'])

    const byEmail = await call(listUsers, 'GET', '/api/admin/users', { query: { search: 'suresh@' } })
    expect(byEmail.body.users.map((u: any) => u.id)).toEqual(['u2'])

    const byRole = await call(listUsers, 'GET', '/api/admin/users', { query: { search: 'NURSE' } })
    expect(byRole.body.users.map((u: any) => u.id)).toEqual(['u1'])
  })

  it('search is case-insensitive', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', username: 'Ramesh' })

    const { body } = await call(listUsers, 'GET', '/api/admin/users', { query: { search: 'RAMESH' } })
    expect(body.users.map((u: any) => u.id)).toEqual(['u1'])
  })

  it('returns 500 when the query fails', async () => {
    await signInAs('ADMIN')
    db.failNext('users')

    const { status, body } = await call(listUsers, 'GET', '/api/admin/users')
    expect(status).toBe(500)
    expect(body.error).toBe('An error occurred')
  })

  /**
   * Known defect — see BUGS.md #5. `search` is interpolated straight into a PostgREST
   * `.or()` filter, so a comma or parenthesis in the term rewrites the filter expression.
   */
  it.fails('should handle a search term containing a comma', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', username: 'lastname, firstname' })

    const { body } = await call(listUsers, 'GET', '/api/admin/users', { query: { search: 'lastname, firstname' } })
    expect(body.users.map((u: any) => u.id)).toEqual(['u1'])
  })
})

describe('POST /api/admin/users', () => {
  const newUser = {
    username: 'newnurse',
    email: 'nurse@hms.test',
    password: 'Password@123',
    role: 'NURSE',
  }

  const create = (body: unknown) => call(createUser, 'POST', '/api/admin/users', { body })

  it.each([
    ['username', { ...newUser, username: undefined }],
    ['email', { ...newUser, email: undefined }],
    ['password', { ...newUser, password: undefined }],
    ['role', { ...newUser, role: undefined }],
  ])('rejects a missing %s', async (_field, body) => {
    await signInAs('ADMIN')
    const { status, body: response } = await create(body)

    expect(status).toBe(400)
    expect(response.error).toBe('Missing required fields')
  })

  it('refuses to create another ADMIN', async () => {
    await signInAs('ADMIN')
    const { status, body } = await create({ ...newUser, role: 'ADMIN' })

    expect(status).toBe(403)
    expect(body.error).toBe('Admin users can only be created by super admin')
    expect(db.count('users')).toBe(0)
  })

  it('rejects a duplicate email', async () => {
    await signInAs('ADMIN')
    aUser({ email: 'nurse@hms.test' })

    const { status, body } = await create(newUser)
    expect(status).toBe(400)
    expect(body.error).toBe('Email already exists')
    expect(db.count('users')).toBe(1)
  })

  it('creates the user and returns a summary without the hash', async () => {
    await signInAs('ADMIN')
    const { status, body } = await create(newUser)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.user).toEqual({
      id: expect.any(String),
      username: 'newnurse',
      email: 'nurse@hms.test',
      role: 'NURSE',
      status: 'ACTIVE',
    })
    expect(body.user).not.toHaveProperty('password_hash')
  })

  it('stores a bcrypt hash at cost 12, never the plaintext', async () => {
    await signInAs('ADMIN')
    await create(newUser)

    const stored = db.rows('users').find((u) => u.email === 'nurse@hms.test')!
    expect(stored.password_hash).toMatch(/^\$2[aby]?\$12\$/)
    expect(stored.password_hash).not.toContain('Password@123')
    await expect(bcrypt.compare('Password@123', stored.password_hash)).resolves.toBe(true)
  })

  it('forces a password change on first login', async () => {
    await signInAs('ADMIN')
    await create(newUser)

    expect(db.rows('users').find((u) => u.email === 'nurse@hms.test')!.needs_password_change).toBe(true)
  })

  it('defaults status to ACTIVE but honours an explicit value', async () => {
    await signInAs('ADMIN')
    const { body } = await create({ ...newUser, status: 'INACTIVE' })

    expect(body.user.status).toBe('INACTIVE')
  })

  it('returns 500 when the insert fails', async () => {
    await signInAs('ADMIN')
    db.failNext('users') // duplicate-email lookup
    db.failNext('users') // insert

    const { status, body } = await create(newUser)
    expect(status).toBe(500)
    expect(body.error).toBe('An error occurred')
  })
})

describe('PUT /api/admin/users/[id]', () => {
  const update = (id: string, body: unknown) =>
    call(updateUser, 'PUT', `/api/admin/users/${id}`, { body, params: { id } })

  it('updates the editable fields and stamps updated_at', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', username: 'old', email: 'old@hms.test', role: 'NURSE', status: 'ACTIVE' })

    const { status, body } = await update('u1', {
      username: 'new',
      email: 'new@hms.test',
      role: 'RECEPTIONIST',
      status: 'INACTIVE',
    })

    expect(status).toBe(200)
    expect(body.success).toBe(true)

    const stored = db.find('users', (r) => r.id === 'u1')!
    expect(stored).toMatchObject({
      username: 'new',
      email: 'new@hms.test',
      role: 'RECEPTIONIST',
      status: 'INACTIVE',
      updated_at: NOW.toISOString(),
    })
  })

  it('refuses to modify an ADMIN account', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', role: 'ADMIN', username: 'other-admin' })

    const { status, body } = await update('u1', { username: 'hijacked', role: 'NURSE' })

    expect(status).toBe(403)
    expect(body.error).toBe('Cannot modify admin users')
    expect(db.find('users', (r) => r.id === 'u1')!.username).toBe('other-admin')
  })

  it('refuses to promote a user to ADMIN', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', role: 'NURSE' })

    const { status, body } = await update('u1', { username: 'n', email: 'n@hms.test', role: 'ADMIN', status: 'ACTIVE' })

    expect(status).toBe(403)
    expect(body.error).toBe('Cannot change role to admin')
    expect(db.find('users', (r) => r.id === 'u1')!.role).toBe('NURSE')
  })

  it('returns 500 when the target does not exist', async () => {
    await signInAs('ADMIN')
    const { status, body } = await update('missing', { username: 'x', role: 'NURSE' })

    // The update matches no rows, so the trailing .single() raises PGRST116.
    expect(status).toBe(500)
    expect(body.error).toBe('An error occurred')
  })
})

describe('PATCH /api/admin/users/[id]', () => {
  const patch = (id: string, body: unknown) =>
    call(patchUser, 'PATCH', `/api/admin/users/${id}`, { body, params: { id } })

  it('applies a partial update without touching other fields', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', username: 'keepme', status: 'ACTIVE', role: 'NURSE' })

    const { status } = await patch('u1', { status: 'INACTIVE' })

    expect(status).toBe(200)
    const stored = db.find('users', (r) => r.id === 'u1')!
    expect(stored.status).toBe('INACTIVE')
    expect(stored.username).toBe('keepme')
    expect(stored.role).toBe('NURSE')
  })

  it('refuses to modify an ADMIN account', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', role: 'ADMIN' })

    const { status, body } = await patch('u1', { status: 'INACTIVE' })
    expect(status).toBe(403)
    expect(body.error).toBe('Cannot modify admin users')
  })

  /**
   * Known defect — see BUGS.md #6. PATCH spreads the request body straight into the
   * update with no allowlist, and unlike PUT it has no "cannot change role to admin"
   * guard, so any admin can silently promote an account.
   */
  it.fails('should refuse to promote a user to ADMIN', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', role: 'NURSE' })

    await patch('u1', { role: 'ADMIN' })

    expect(db.find('users', (r) => r.id === 'u1')!.role).toBe('NURSE')
  })

  /** Known defect — see BUGS.md #6. The same missing allowlist lets the hash be set directly. */
  it.fails('should refuse to overwrite password_hash directly', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', password_hash: 'original-hash' })

    await patch('u1', { password_hash: 'attacker-controlled-hash' })

    expect(db.find('users', (r) => r.id === 'u1')!.password_hash).toBe('original-hash')
  })
})

describe('DELETE /api/admin/users/[id]', () => {
  const remove = (id: string) => call(deleteUser, 'DELETE', `/api/admin/users/${id}`, { params: { id } })

  it('deletes a non-admin user', async () => {
    await signInAs('ADMIN', { userId: 'admin-1' })
    aUser({ id: 'u1', role: 'NURSE' })

    const { status, body } = await remove('u1')

    expect(status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(db.count('users')).toBe(0)
  })

  it('refuses to delete your own account', async () => {
    await signInAs('ADMIN', { userId: 'admin-1' })
    aUser({ id: 'admin-1', role: 'ADMIN' })

    const { status, body } = await remove('admin-1')

    expect(status).toBe(400)
    expect(body.error).toBe('Cannot delete your own account')
    expect(db.count('users')).toBe(1)
  })

  it('refuses to delete another ADMIN', async () => {
    await signInAs('ADMIN', { userId: 'admin-1' })
    aUser({ id: 'u1', role: 'ADMIN' })

    const { status, body } = await remove('u1')

    expect(status).toBe(403)
    expect(body.error).toBe('Cannot delete admin users')
    expect(db.count('users')).toBe(1)
  })

  it('succeeds for an id that does not exist', async () => {
    await signInAs('ADMIN', { userId: 'admin-1' })

    const { status, body } = await remove('missing')
    expect(status).toBe(200)
    expect(body).toEqual({ success: true })
  })
})

describe('POST /api/admin/users/[id]/reset-password', () => {
  const reset = (id: string) =>
    call(resetToDefault, 'POST', `/api/admin/users/${id}/reset-password`, { params: { id } })

  it('returns 404 for an unknown user', async () => {
    await signInAs('ADMIN')
    const { status, body } = await reset('missing')

    expect(status).toBe(404)
    expect(body.error).toBe('User not found')
  })

  it('sets the password to the configured default and forces a change on next login', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', password_hash: 'old-hash', needs_password_change: false })

    const { status, body } = await reset('u1')

    expect(status).toBe(200)
    expect(body).toEqual({
      success: true,
      message: 'Password reset to default. User must change on next login.',
    })

    const stored = db.find('users', (r) => r.id === 'u1')!
    await expect(bcrypt.compare('Welcome@123', stored.password_hash)).resolves.toBe(true)
    expect(stored.needs_password_change).toBe(true)
    expect(stored.updated_at).toBe(NOW.toISOString())
  })

  it('honours DEFAULT_PASSWORD from the environment', async () => {
    const { vi } = await import('vitest')
    vi.stubEnv('DEFAULT_PASSWORD', 'Custom@Default1')
    await signInAs('ADMIN')
    aUser({ id: 'u1' })

    await reset('u1')

    const stored = db.find('users', (r) => r.id === 'u1')!
    await expect(bcrypt.compare('Custom@Default1', stored.password_hash)).resolves.toBe(true)
  })

  it('will reset an ADMIN account, unlike update and delete', async () => {
    await signInAs('ADMIN')
    aUser({ id: 'u1', role: 'ADMIN' })

    const { status } = await reset('u1')
    expect(status).toBe(200)
  })

  it('does not send an email — the new password must be communicated out of band', async () => {
    const { vi } = await import('vitest')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await signInAs('ADMIN')
    aUser({ id: 'u1' })
    await reset('u1')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('password reset default — cross-check with login', () => {
  it('a reset account can log in with the default password and is asked to change it', async () => {
    const { POST: login } = await import('@/app/api/auth/login/route')

    await signInAs('ADMIN')
    aUser({ id: 'u1', email: 'nurse@hms.test', status: 'ACTIVE', password_hash: await hashPassword('Forgotten@1') })
    await reset('u1')

    signOut()
    const { status, body } = await call(login, 'POST', '/api/auth/login', {
      body: { email: 'nurse@hms.test', password: 'Welcome@123' },
    })

    expect(status).toBe(200)
    expect(body.needsPasswordChange).toBe(true)
  })

  function reset(id: string) {
    return call(resetToDefault, 'POST', `/api/admin/users/${id}/reset-password`, { params: { id } })
  }
})
