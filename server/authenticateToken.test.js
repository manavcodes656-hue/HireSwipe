// Vitest tests for the Supabase Auth token middleware
// Mocks external Supabase calls — does not require production credentials.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase-server.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
  createUserClient: vi.fn((token) => ({ userScopedFor: token })),
}))

import { supabase, createUserClient } from './supabase-server.js'
import { authenticateToken } from './authenticateToken.js'

/** Configure supabase.from('profiles').select().eq().maybeSingle() for one call. */
function mockProfileQuery(result) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  supabase.from.mockReturnValueOnce({ select })
  return { select, eq, maybeSingle }
}

describe('authenticateToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeRes() {
    const statusCode = { value: null }
    const jsonBody = { value: null }
    const res = {
      status: (code) => {
        statusCode.value = code
        return res
      },
      json: (body) => {
        jsonBody.value = body
        return res
      },
    }
    return { res, statusCode, jsonBody }
  }

  it('returns 401 when Authorization header is missing', async () => {
    const { res, statusCode } = makeRes()
    const req = { headers: {} }
    const next = vi.fn()

    await authenticateToken(req, res, next)

    expect(statusCode.value).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when Authorization header has wrong format', async () => {
    const { res, statusCode } = makeRes()
    const req = { headers: { authorization: 'WrongFormat' } }
    const next = vi.fn()

    await authenticateToken(req, res, next)

    expect(statusCode.value).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when token is expired', async () => {
    const { res, statusCode } = makeRes()
    const req = { headers: { authorization: 'Bearer expired-token-12345' } }
    const next = vi.fn()

    supabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error('JWT expired'),
    })

    await authenticateToken(req, res, next)

    expect(statusCode.value).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when token is invalid', async () => {
    const { res, statusCode } = makeRes()
    const req = { headers: { authorization: 'Bearer invalid-token' } }
    const next = vi.fn()

    supabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error('Invalid JWT signature'),
    })

    await authenticateToken(req, res, next)

    expect(statusCode.value).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('propagates Supabase auth error as HTTP 500', async () => {
    const { res, statusCode } = makeRes()
    const req = { headers: { authorization: 'Bearer bad-token' } }
    const next = vi.fn()

    supabase.auth.getUser.mockRejectedValueOnce(new Error('Network error'))

    await authenticateToken(req, res, next)

    expect(statusCode.value).toBe(500)
    expect(next).not.toHaveBeenCalled()
  })

  it('attaches verified user context on valid token', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' }

    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null })
    mockProfileQuery({ data: { role: 'job_seeker' }, error: null })

    const { res } = makeRes()
    const req = { headers: { authorization: 'Bearer valid-token-12345' } }
    const next = vi.fn()

    await authenticateToken(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(req.user).toEqual({
      id: mockUser.id,
      email: mockUser.email,
      role: 'job_seeker',
    })
    expect(supabase.auth.getUser).toHaveBeenCalledWith('valid-token-12345')
  })

  it('resolves user role from profiles table (job_seeker)', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' }
    const mockRole = 'job_seeker'

    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null })
    mockProfileQuery({ data: { role: mockRole }, error: null })

    const { res } = makeRes()
    const req = { headers: { authorization: 'Bearer valid-token-12345' } }
    const next = vi.fn()

    await authenticateToken(req, res, next)

    expect(req.user.role).toBe(mockRole)
  })

  it('resolves user role from profiles table (company)', async () => {
    const mockUser = { id: 'user-456', email: 'company@example.com' }
    const mockRole = 'company'

    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null })
    mockProfileQuery({ data: { role: mockRole }, error: null })

    const { res } = makeRes()
    const req = { headers: { authorization: 'Bearer valid-token-12345' } }
    const next = vi.fn()

    await authenticateToken(req, res, next)

    expect(req.user.role).toBe(mockRole)
  })

  it('resolves user role from profiles table (admin)', async () => {
    const mockUser = { id: 'user-789', email: 'admin@example.com' }
    const mockRole = 'admin'

    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null })
    mockProfileQuery({ data: { role: mockRole }, error: null })

    const { res } = makeRes()
    const req = { headers: { authorization: 'Bearer valid-token-12345' } }
    const next = vi.fn()

    await authenticateToken(req, res, next)

    expect(req.user.role).toBe(mockRole)
  })

  it('rejects when profiles table has no row for user (PROFILE_REQUIRED)', async () => {
    const mockUser = { id: 'user-999', email: 'orphan@example.com' }

    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null })
    // maybeSingle() resolves with data: null (no error) when no row matches.
    mockProfileQuery({ data: null, error: null })

    const { res, statusCode, jsonBody } = makeRes()
    const req = { headers: { authorization: 'Bearer valid-token-12345' } }
    const next = vi.fn()

    await authenticateToken(req, res, next)

    expect(statusCode.value).toBe(403)
    expect(jsonBody.value?.error?.code).toBe('PROFILE_REQUIRED')
    expect(next).not.toHaveBeenCalled()
    expect(req.user).toBeUndefined()
  })

  it('rejects a profile whose role is not a known user_role (PROFILE_REQUIRED)', async () => {
    supabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-1', email: 'x@example.com' } },
      error: null,
    })
    mockProfileQuery({ data: { role: 'superuser' }, error: null })

    const { res, statusCode, jsonBody } = makeRes()
    const req = { headers: { authorization: 'Bearer valid-token-12345' } }
    const next = vi.fn()

    await authenticateToken(req, res, next)

    expect(statusCode.value).toBe(403)
    expect(jsonBody.value?.error?.code).toBe('PROFILE_REQUIRED')
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 500 (fail closed) when the profile lookup errors', async () => {
    supabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-1', email: 'x@example.com' } },
      error: null,
    })
    mockProfileQuery({ data: null, error: { code: '08006', message: 'connection failure' } })

    const { res, statusCode, jsonBody } = makeRes()
    const req = { headers: { authorization: 'Bearer valid-token-12345' } }
    const next = vi.fn()

    await authenticateToken(req, res, next)

    expect(statusCode.value).toBe(500)
    expect(jsonBody.value?.error?.code).toBe('INTERNAL_ERROR')
    expect(next).not.toHaveBeenCalled()
    expect(req.user).toBeUndefined()
  })

  it('ignores role claims in the body, query and user_metadata', async () => {
    supabase.auth.getUser.mockResolvedValueOnce({
      data: {
        user: { id: 'user-1', email: 'x@example.com', user_metadata: { role: 'admin' } },
      },
      error: null,
    })
    const { eq } = mockProfileQuery({ data: { role: 'job_seeker' }, error: null })

    const { res } = makeRes()
    const req = {
      headers: { authorization: 'Bearer valid-token-12345' },
      body: { role: 'admin', id: 'someone-else' },
      query: { role: 'admin' },
    }
    const next = vi.fn()

    await authenticateToken(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(req.user).toEqual({ id: 'user-1', email: 'x@example.com', role: 'job_seeker' })
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
  })
})

describe('authenticateToken — user-scoped client and auth outages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeRes() {
    const out = { status: null, body: null }
    const res = {
      status: (code) => ((out.status = code), res),
      json: (body) => ((out.body = body), res),
    }
    return { res, out }
  }

  it('attaches a client scoped to the verified token', async () => {
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'u-1', email: 'a@x.test' } }, error: null })
    mockProfileQuery({ data: { role: 'company' }, error: null })
    const req = { headers: { authorization: 'Bearer tok-abc' } }
    const next = vi.fn()

    await authenticateToken(req, makeRes().res, next)

    expect(next).toHaveBeenCalled()
    expect(createUserClient).toHaveBeenCalledWith('tok-abc')
    expect(req.supabase).toEqual({ userScopedFor: 'tok-abc' })
  })

  it('does not build a user client when the token is rejected', async () => {
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: Object.assign(new Error('bad jwt'), { status: 401 }) })
    const req = { headers: { authorization: 'Bearer bad' } }
    const { res, out } = makeRes()

    await authenticateToken(req, res, vi.fn())

    expect(out.status).toBe(401)
    expect(createUserClient).not.toHaveBeenCalled()
    expect(req.supabase).toBeUndefined()
  })

  it('does not build a user client when the profile is missing', async () => {
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'u-1' } }, error: null })
    mockProfileQuery({ data: null, error: null })
    const req = { headers: { authorization: 'Bearer tok' } }
    const { res, out } = makeRes()

    await authenticateToken(req, res, vi.fn())

    expect(out.status).toBe(403)
    expect(out.body.error.code).toBe('PROFILE_REQUIRED')
    expect(createUserClient).not.toHaveBeenCalled()
  })

  it('returns 503 (not 401) when Supabase Auth cannot be reached', async () => {
    const outage = Object.assign(new Error('fetch failed'), { name: 'AuthRetryableFetchError', status: 0 })
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: outage })
    const { res, out } = makeRes()
    const next = vi.fn()

    await authenticateToken({ headers: { authorization: 'Bearer tok' } }, res, next)

    expect(out.status).toBe(503)
    expect(out.body.error.code).toBe('AUTH_UNAVAILABLE')
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 503 when Supabase Auth answers with a 5xx', async () => {
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: Object.assign(new Error('Bad Gateway'), { status: 502 }) })
    const { res, out } = makeRes()

    await authenticateToken({ headers: { authorization: 'Bearer tok' } }, res, vi.fn())

    expect(out.status).toBe(503)
  })
})
