// HTTP tests for POST /api/company/applications/:applicationId/interest: real
// Express app and middleware order, Supabase mocked (no credentials, network or
// company_interest table needed). They prove the API's own checks and how it calls
// Supabase; they do not prove RLS or trigger behaviour in PostgreSQL.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

vi.mock('./supabase-server.js', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
  createUserClient: vi.fn(),
}))

import { supabase, createUserClient } from './supabase-server.js'
import { app } from './server.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-4222-8222-222222222222'
const APPLICATION_ID = '33333333-3333-4333-8333-333333333333'
const JOB_ID = '44444444-4444-4444-8444-444444444444'
const SEEKER_ID = '55555555-5555-4555-8555-555555555555'
const PATH = `/api/company/applications/${APPLICATION_ID}/interest`

const INTEREST = {
  id: '66666666-6666-4666-8666-666666666666',
  application_id: APPLICATION_ID,
  expressed_by: 'u-1',
  created_at: '2026-01-01T00:00:00Z',
}

const applicationRow = (over = {}) => ({
  id: APPLICATION_ID,
  company_id: COMPANY_ID,
  job_id: JOB_ID,
  job_seeker_id: SEEKER_ID,
  status: 'pending',
  jobs: { id: JOB_ID, company_id: COMPANY_ID, status: 'published' },
  ...over,
})

/** Chainable stand-in for a supabase-js query; records calls, resolves to `result`. */
function query(result) {
  const calls = []
  const q = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject)
      if (prop === 'calls') return calls
      return (...args) => {
        calls.push([prop, ...args])
        return q
      }
    },
  })
  return q
}

/** Verified token whose profiles.role is `role`; returns the user-scoped client mock. */
function signIn(role, id = 'u-1') {
  supabase.auth.getUser.mockResolvedValueOnce({ data: { user: { id, email: `${id}@x.test` } }, error: null })
  supabase.from.mockReturnValueOnce(query({ data: role ? { role } : null, error: null }))
  const userDb = { from: vi.fn(), rpc: vi.fn() }
  if (role) createUserClient.mockReturnValueOnce(userDb)
  return userDb
}

/** Service-role membership lookup made by requireCompanyMember (for any company). */
function membership(role, companyId = COMPANY_ID) {
  const q = query({
    data: role ? { id: 'm-1', company_id: companyId, profile_id: 'u-1', role, is_active: true } : null,
    error: null,
  })
  supabase.from.mockReturnValueOnce(q)
  return q
}

/** Queue the user-scoped client's reads/writes in call order. */
function userQueries(userDb, ...results) {
  return results.map((r) => {
    const q = query(r)
    userDb.from.mockReturnValueOnce(q)
    return q
  })
}

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
  vi.resetAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.COMPANY_INTEREST_ENABLED = 'true'
})

afterEach(() => {
  delete process.env.COMPANY_INTEREST_ENABLED
})

function post(path = PATH, { body, token = 'tok' } = {}) {
  const headers = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  return fetch(baseUrl + path, { method: 'POST', headers, body: body !== undefined ? JSON.stringify(body) : undefined })
}

describe('POST /api/company/applications/:applicationId/interest — access control', () => {
  it('401 without a bearer token', async () => {
    const res = await post(PATH, { token: null })
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('UNAUTHORIZED')
  })

  it('403 for a job seeker, without touching the database', async () => {
    const userDb = signIn('job_seeker')
    const res = await post()
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('403 for an admin: interest is a company action', async () => {
    const userDb = signIn('admin')
    const res = await post()
    expect(res.status).toBe(403)
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('400 for an invalid application UUID, without touching the database', async () => {
    const userDb = signIn('company')
    const res = await post('/api/company/applications/not-a-uuid/interest')
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR')
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('503 and no database access while COMPANY_INTEREST_ENABLED is not "true"', async () => {
    delete process.env.COMPANY_INTEREST_ENABLED
    const userDb = signIn('company')
    const res = await post()
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('COMPANY_INTEREST_UNAVAILABLE')
    expect(userDb.from).not.toHaveBeenCalled()
    expect(supabase.from).toHaveBeenCalledTimes(1) // only authenticateToken's role lookup
  })

  it('404 without leaking data when the application is not visible to the caller (another company)', async () => {
    const userDb = signIn('company')
    userQueries(userDb, { data: null, error: null })

    const res = await post()

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('APPLICATION_NOT_FOUND')
    expect(JSON.stringify(body)).not.toContain(OTHER_COMPANY_ID)
    expect(userDb.from).toHaveBeenCalledTimes(1)
    expect(supabase.from).toHaveBeenCalledTimes(1) // no membership lookup, no insert
  })

  it('403 for a company user without an active membership in the application\'s company', async () => {
    const userDb = signIn('company')
    userQueries(userDb, { data: applicationRow({ company_id: OTHER_COMPANY_ID }), error: null })
    const memberQ = membership(null)

    const res = await post()

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('FORBIDDEN')
    // Membership was resolved against the application's own company, not a body or default one.
    expect(memberQ.calls).toContainEqual(['eq', 'company_id', OTHER_COMPANY_ID])
    expect(memberQ.calls).toContainEqual(['eq', 'is_active', true])
    expect(JSON.stringify(body)).not.toContain(SEEKER_ID)
    expect(userDb.from).toHaveBeenCalledTimes(1) // no insert attempted
  })

  it('403 when the caller is a member of a different company than the application\'s', async () => {
    const userDb = signIn('company')
    userQueries(userDb, { data: applicationRow({ company_id: OTHER_COMPANY_ID }), error: null })
    // Membership lookup is keyed by the application's company, so a membership in
    // COMPANY_ID alone yields no row for OTHER_COMPANY_ID.
    const memberQ = membership(null)

    const res = await post()

    expect(res.status).toBe(403)
    expect(memberQ.calls).toContainEqual(['eq', 'company_id', OTHER_COMPANY_ID])
  })

  it('ignores a company id in the body and rejects one that disagrees with the application', async () => {
    const userDb = signIn('company')
    userQueries(userDb, { data: applicationRow(), error: null })
    membership('recruiter')

    const res = await post(PATH, { body: { companyId: OTHER_COMPANY_ID } })

    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR')
    expect(userDb.from).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/company/applications/:applicationId/interest — application rules', () => {
  it('409 for a withdrawn application', async () => {
    const userDb = signIn('company')
    userQueries(userDb, { data: applicationRow({ status: 'withdrawn' }), error: null })
    membership('recruiter')

    const res = await post()

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('APPLICATION_WITHDRAWN')
    expect(userDb.from).toHaveBeenCalledTimes(1)
  })

  it('409 when the job is no longer published', async () => {
    for (const status of ['draft', 'paused', 'closed']) {
      vi.resetAllMocks()
      const userDb = signIn('company')
      userQueries(userDb, { data: applicationRow({ jobs: { id: JOB_ID, company_id: COMPANY_ID, status } }), error: null })
      membership('recruiter')

      const res = await post()

      expect(res.status).toBe(409)
      expect((await res.json()).error.code).toBe('JOB_NOT_PUBLISHED')
      expect(userDb.from).toHaveBeenCalledTimes(1)
    }
  })

  it('409 when the application and its job disagree about the company', async () => {
    const userDb = signIn('company')
    userQueries(userDb, {
      data: applicationRow({ jobs: { id: JOB_ID, company_id: OTHER_COMPANY_ID, status: 'published' } }),
      error: null,
    })
    membership('recruiter')

    const res = await post()

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('APPLICATION_INCONSISTENT')
    expect(userDb.from).toHaveBeenCalledTimes(1)
  })

  it('409 when the job relation is missing', async () => {
    const userDb = signIn('company')
    userQueries(userDb, { data: applicationRow({ jobs: null }), error: null })
    membership('recruiter')

    const res = await post()
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('APPLICATION_INCONSISTENT')
  })
})

describe('POST /api/company/applications/:applicationId/interest — persistence', () => {
  it('201: inserts one row with the application id and the authenticated user as expressed_by', async () => {
    const userDb = signIn('company', 'u-1')
    const [findApp, findInterest, insert] = userQueries(
      userDb,
      { data: applicationRow(), error: null },
      { data: null, error: null },
      { data: INTEREST, error: null },
    )
    membership('hiring_manager')

    const res = await post()

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ status: 'ok', alreadyRecorded: false, interest: INTEREST })
    expect(findApp.calls).toContainEqual(['eq', 'id', APPLICATION_ID])
    expect(findInterest.calls).toContainEqual(['eq', 'application_id', APPLICATION_ID])
    expect(insert.calls).toContainEqual(['insert', { application_id: APPLICATION_ID, expressed_by: 'u-1' }])
  })

  it('takes expressed_by from the token, never from the body', async () => {
    const userDb = signIn('company', 'u-1')
    const queries = userQueries(
      userDb,
      { data: applicationRow(), error: null },
      { data: null, error: null },
      { data: INTEREST, error: null },
    )
    membership('recruiter')

    await post(PATH, { body: { expressed_by: 'attacker', application_id: 'other' } })

    expect(queries[2].calls).toContainEqual(['insert', { application_id: APPLICATION_ID, expressed_by: 'u-1' }])
  })

  it('does not create a match, conversation, notification or application, nor change the status', async () => {
    const userDb = signIn('company')
    userQueries(
      userDb,
      { data: applicationRow(), error: null },
      { data: null, error: null },
      { data: INTEREST, error: null },
    )
    membership('recruiter')

    await post()

    const tables = userDb.from.mock.calls.map(([t]) => t)
    expect(tables).toEqual(['applications', 'company_interest', 'company_interest'])
    expect(userDb.rpc).not.toHaveBeenCalled()
    const appCalls = userDb.from.mock.results[0].value.calls.map(([m]) => m)
    expect(appCalls).not.toContain('update')
    expect(appCalls).not.toContain('insert')
  })

  it('200 alreadyRecorded for a duplicate request, without inserting', async () => {
    const userDb = signIn('company')
    userQueries(userDb, { data: applicationRow(), error: null }, { data: INTEREST, error: null })
    membership('recruiter')

    const res = await post()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', alreadyRecorded: true, interest: INTEREST })
    expect(userDb.from).toHaveBeenCalledTimes(2)
  })

  it('200 alreadyRecorded when a concurrent request wins the unique index', async () => {
    const userDb = signIn('company')
    userQueries(
      userDb,
      { data: applicationRow(), error: null },
      { data: null, error: null },
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "company_interest_application_id_key"' } },
      { data: INTEREST, error: null },
    )
    membership('recruiter')

    const res = await post()

    expect(res.status).toBe(200)
    expect((await res.json()).alreadyRecorded).toBe(true)
  })

  it('409 CONFLICT when a unique violation cannot be confirmed by a re-read', async () => {
    const userDb = signIn('company')
    userQueries(
      userDb,
      { data: applicationRow(), error: null },
      { data: null, error: null },
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: null, error: null },
    )
    membership('recruiter')

    const res = await post()

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('CONFLICT')
  })
})

describe('POST /api/company/applications/:applicationId/interest — database errors', () => {
  it('403 FORBIDDEN with a generic message when RLS rejects the insert', async () => {
    const userDb = signIn('company')
    userQueries(
      userDb,
      { data: applicationRow(), error: null },
      { data: null, error: null },
      { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "company_interest"' } },
    )
    membership('recruiter')

    const res = await post()

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('FORBIDDEN')
    expect(JSON.stringify(body)).not.toMatch(/company_interest|row-level/)
  })

  it('500 INTERNAL_ERROR without internals for an unexpected insert error', async () => {
    const userDb = signIn('company')
    userQueries(
      userDb,
      { data: applicationRow(), error: null },
      { data: null, error: null },
      { data: null, error: { code: 'XX000', message: 'secret internal detail' } },
    )
    membership('recruiter')

    const res = await post()

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(body)).not.toContain('secret')
  })

  it('503 SERVICE_UNAVAILABLE for a network failure loading the application', async () => {
    const userDb = signIn('company')
    userQueries(userDb, { data: null, error: { message: 'fetch failed' } })

    const res = await post()

    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('503 COMPANY_INTEREST_UNAVAILABLE when the company_interest table does not exist', async () => {
    for (const code of ['PGRST205', '42P01']) {
      vi.resetAllMocks()
      const userDb = signIn('company')
      userQueries(userDb, { data: applicationRow(), error: null }, { data: null, error: { code, message: 'relation does not exist' } })
      membership('recruiter')

      const res = await post()

      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.error.code).toBe('COMPANY_INTEREST_UNAVAILABLE')
      expect(JSON.stringify(body)).not.toMatch(/relation/)
      expect(userDb.from).toHaveBeenCalledTimes(2) // no insert after the failed lookup
    }
  })
})
