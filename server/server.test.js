// Route-level tests for the Express app: real middleware ordering over HTTP,
// with the Supabase server client mocked (no credentials or network needed).

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

vi.mock('./supabase-server.js', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
  createUserClient: vi.fn(),
}))

import { supabase, createUserClient } from './supabase-server.js'
import { app } from './server.js'

let server
let baseUrl

beforeAll(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

beforeEach(() => {
  vi.clearAllMocks()
})

/** Verified token for `user` whose profiles.role is `role`. */
function signIn(user, role) {
  supabase.auth.getUser.mockResolvedValueOnce({ data: { user }, error: null })
  const maybeSingle = vi.fn().mockResolvedValue({ data: role ? { role } : null, error: null })
  supabase.from.mockReturnValueOnce({ select: () => ({ eq: () => ({ maybeSingle }) }) })
}

/** company_members lookup used by GET /api/company/profile (runs on the user-scoped client). */
function mockMembership(result) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eqActive = vi.fn(() => ({ order: () => ({ limit: () => ({ maybeSingle }) }) }))
  const eqProfile = vi.fn(() => ({ eq: eqActive }))
  createUserClient.mockReturnValueOnce({ from: () => ({ select: () => ({ eq: eqProfile }) }) })
  return { eqProfile }
}

function get(path, token) {
  return fetch(baseUrl + path, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

describe('public routes', () => {
  it('GET /api/health is public', async () => {
    const res = await get('/api/health')
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('ok')
    expect(supabase.auth.getUser).not.toHaveBeenCalled()
  })

  it('unknown routes return JSON 404', async () => {
    const res = await get('/nope')
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('NOT_FOUND')
  })
})

describe('protected /api routes', () => {
  it('rejects a missing token with 401', async () => {
    const res = await get('/api/company/profile')
    expect(res.status).toBe(401)
  })

  it('rejects an invalid token with 401', async () => {
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('bad jwt') })
    const res = await get('/api/company/profile', 'bad')
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('INVALID_TOKEN')
  })

  it('rejects a verified user without a profile with 403 PROFILE_REQUIRED', async () => {
    signIn({ id: 'u-1', email: 'a@example.com' }, null)
    const res = await get('/api/job-seeker/profile', 'tok')
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('PROFILE_REQUIRED')
  })

  it('forbids a job seeker from company routes (403)', async () => {
    signIn({ id: 'u-1', email: 'a@example.com' }, 'job_seeker')
    const res = await get('/api/company/profile', 'tok')
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
  })

  it('forbids a company user from admin routes (403)', async () => {
    signIn({ id: 'u-2', email: 'c@example.com' }, 'company')
    const res = await get('/api/admin/dashboard', 'tok')
    expect(res.status).toBe(403)
  })

  it('allows a job seeker on job-seeker routes', async () => {
    signIn({ id: 'u-1', email: 'a@example.com' }, 'job_seeker')
    const res = await get('/api/job-seeker/profile', 'tok')
    expect(res.status).toBe(200)
    expect((await res.json()).userRole).toBe('job_seeker')
  })

  it("company profile only queries the caller's own membership", async () => {
    signIn({ id: 'u-2', email: 'c@example.com' }, 'company')
    const { eqProfile } = mockMembership({
      data: { id: 'm-1', role: 'owner', company_id: 'co-1', companies: { id: 'co-1', name: 'Acme', onboarding_completed: true } },
      error: null,
    })
    const res = await fetch(baseUrl + '/api/company/profile?profile_id=someone-else', {
      headers: { authorization: 'Bearer tok' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.membership.company_id).toBe('co-1')
    // Identity comes from the verified token, never from the query string.
    expect(eqProfile).toHaveBeenCalledWith('profile_id', 'u-2')
  })

  it('company profile reports no membership for a company user without one', async () => {
    signIn({ id: 'u-3', email: 'n@example.com' }, 'company')
    mockMembership({ data: null, error: null })
    const res = await get('/api/company/profile', 'tok')
    expect(res.status).toBe(200)
    expect((await res.json()).membership).toBeNull()
  })
})
