// HTTP tests for the company interviews API: real Express app and middleware
// order, Supabase mocked (no credentials or network). These prove the API's
// own checks and how it calls Supabase; they do not prove PostgreSQL/RLS
// behaviour, which the migration harness covers separately.
//
// Schema facts the assertions rely on (001_initial_hireswipe_schema.sql):
// - public.interviews has no company column; ownership comes from the
//   application the interview belongs to (applications.company_id).
// - status is public.interview_status: scheduled|completed|cancelled|rescheduled.
// - title and scheduled_at are NOT NULL, duration_minutes has a > 0 CHECK.

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
import { validateInterviewPayload, canTransitionInterview } from './company-routes.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-4222-8222-222222222222'
const APPLICATION_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_APPLICATION_ID = '44444444-4444-4444-8444-444444444444'
const INTERVIEW_ID = '55555555-5555-4555-8555-555555555555'
const JOB_ID = '66666666-6666-4666-8666-666666666666'
const OTHER_JOB_ID = '77777777-7777-4777-8777-777777777777'
const CANDIDATE_ID = '88888888-8888-4888-8888-888888888888'

const MEMBERSHIP = { id: 'm-1', role: 'owner', company_id: COMPANY_ID, companies: { id: COMPANY_ID, name: 'Acme' } }

const INTERVIEW = {
  id: INTERVIEW_ID,
  application_id: APPLICATION_ID,
  scheduled_by: 'u-1',
  title: 'Technical Interview',
  description: 'System design and live coding',
  scheduled_at: '2026-10-25T14:00:00.000Z',
  duration_minutes: 45,
  meeting_url: 'https://meet.google.com/abc-defg-hij',
  location: 'Google Meet (Virtual)',
  status: 'scheduled',
  created_at: '2026-10-20T10:00:00.000Z',
  updated_at: '2026-10-20T10:00:00.000Z',
  applications: {
    id: APPLICATION_ID,
    job_id: JOB_ID,
    job_seeker_id: CANDIDATE_ID,
    company_id: COMPANY_ID,
    status: 'shortlisted',
    jobs: { id: JOB_ID, title: 'Senior Frontend Engineer' },
    job_seeker_profiles: {
      id: CANDIDATE_ID,
      profile_id: 'p-1',
      headline: 'Angular expert',
      location: 'Bengaluru, India',
      experience_years: 6,
      profiles: { id: 'p-1', full_name: 'Aarav Patel', avatar_url: 'https://cdn.test/a.png' },
    },
  },
}

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
})

function call(method, path, { body, token = 'tok', rawBody } = {}) {
  const headers = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined || rawBody !== undefined) headers['content-type'] = 'application/json'
  return fetch(baseUrl + path, {
    method,
    headers,
    body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
  })
}

/** Membership query answered with the caller's active membership. */
function withMembership(userDb, membership = MEMBERSHIP) {
  userDb.from.mockReturnValueOnce(query({ data: membership, error: null }))
}

const VALID_CREATE = {
  application_id: APPLICATION_ID,
  title: 'Technical Interview',
  description: 'System design and live coding',
  scheduled_at: '2026-10-25T14:00:00Z',
  duration_minutes: 45,
  meeting_url: 'https://meet.google.com/abc-defg-hij',
  location: 'Google Meet (Virtual)',
}

describe('authentication on company interview routes', () => {
  it('401 without a bearer token', async () => {
    const res = await call('GET', '/api/company/interviews', { token: null })
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('UNAUTHORIZED')
  })

  it('401 with an invalid token', async () => {
    supabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: Object.assign(new Error('invalid JWT'), { status: 401 }),
    })
    const res = await call('GET', '/api/company/interviews', { token: 'bad' })
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('INVALID_TOKEN')
  })

  it('403 PROFILE_REQUIRED when the account has no profile role', async () => {
    signIn(null)
    const res = await call('GET', '/api/company/interviews')
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('PROFILE_REQUIRED')
  })

  it('403 for a job seeker', async () => {
    const userDb = signIn('job_seeker')
    const res = await call('GET', '/api/company/interviews')
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('uses the user-scoped client, never the service role, for interview data', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({ data: [], error: null }))
    await call('GET', '/api/company/interviews')
    expect(supabase.from).toHaveBeenCalledTimes(1) // only the profile role lookup
  })
})

describe('GET /api/company/interviews', () => {
  it('403 when the caller has no active company membership', async () => {
    const userDb = signIn('company')
    withMembership(userDb, null)
    const res = await call('GET', '/api/company/interviews')
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
  })

  it('200: returns the company interviews with candidate and job details', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    const q = query({ data: [INTERVIEW], error: null })
    userDb.from.mockReturnValueOnce(q)

    const res = await call('GET', '/api/company/interviews')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.interviews).toHaveLength(1)
    expect(body.interviews[0].id).toBe(INTERVIEW_ID)
    expect(body.interviews[0].applications.job_seeker_profiles.profiles.full_name).toBe('Aarav Patel')
    expect(body.interviews[0].applications.jobs.title).toBe('Senior Frontend Engineer')
    // the list is scoped to the caller's company through the application
    expect(q.calls).toContainEqual(['eq', 'applications.company_id', COMPANY_ID])
    expect(q.calls).toContainEqual(['order', 'scheduled_at', { ascending: true }])
  })

  it('200: filters by application, job and status', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from
      .mockReturnValueOnce(query({ data: { id: APPLICATION_ID, company_id: COMPANY_ID }, error: null })) // application check
      .mockReturnValueOnce(query({ data: { id: JOB_ID, company_id: COMPANY_ID }, error: null })) // job check
    const q = query({ data: [], error: null })
    userDb.from.mockReturnValueOnce(q)

    const res = await call(
      'GET',
      `/api/company/interviews?applicationId=${APPLICATION_ID}&jobId=${JOB_ID}&status=scheduled`,
    )

    expect(res.status).toBe(200)
    expect(q.calls).toContainEqual(['eq', 'application_id', APPLICATION_ID])
    expect(q.calls).toContainEqual(['eq', 'applications.job_id', JOB_ID])
    expect(q.calls).toContainEqual(['eq', 'status', 'scheduled'])
  })

  it('400 for a non-UUID applicationId', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    const res = await call('GET', '/api/company/interviews?applicationId=nope')
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR')
  })

  it('400 for a non-UUID jobId', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    const res = await call('GET', '/api/company/interviews?jobId=nope')
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR')
  })

  it('400 for an unknown status', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    const res = await call('GET', '/api/company/interviews?status=pending')
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toContain('scheduled')
  })

  it('404 when the filtered application does not exist', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({ data: null, error: null }))
    const res = await call('GET', `/api/company/interviews?applicationId=${APPLICATION_ID}`)
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('APPLICATION_NOT_FOUND')
  })

  it('403 when the filtered application belongs to another company', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({ data: { id: APPLICATION_ID, company_id: OTHER_COMPANY_ID }, error: null }))
    const res = await call('GET', `/api/company/interviews?applicationId=${APPLICATION_ID}`)
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
  })

  it('403 when the filtered job belongs to another company', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({ data: { id: OTHER_JOB_ID, company_id: OTHER_COMPANY_ID }, error: null }))
    const res = await call('GET', `/api/company/interviews?jobId=${OTHER_JOB_ID}`)
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
  })

  it('maps database errors without leaking internals', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({
      data: null,
      error: { code: '42P17', message: 'infinite recursion detected in policy for relation "interviews"' },
    }))
    const res = await call('GET', '/api/company/interviews')
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('interviews')
    expect(text).not.toContain('recursion')
  })
})

describe('GET /api/company/interviews/:interviewId', () => {
  it('400 for an interviewId that is not a UUID (before any lookup)', async () => {
    const userDb = signIn('company')
    const res = await call('GET', '/api/company/interviews/not-a-uuid')
    expect(res.status).toBe(400)
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('404 when the interview does not exist', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({ data: null, error: null }))
    const res = await call('GET', `/api/company/interviews/${INTERVIEW_ID}`)
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('INTERVIEW_NOT_FOUND')
  })

  it('403 when the interview belongs to another company', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({
      data: { ...INTERVIEW, applications: { ...INTERVIEW.applications, company_id: OTHER_COMPANY_ID } },
      error: null,
    }))
    const res = await call('GET', `/api/company/interviews/${INTERVIEW_ID}`)
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
  })

  it('200: returns the interview for an authorized company member', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({ data: INTERVIEW, error: null }))
    const res = await call('GET', `/api/company/interviews/${INTERVIEW_ID}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.interview.id).toBe(INTERVIEW_ID)
    expect(body.interview.applications.job_id).toBe(JOB_ID)
  })
})

describe('POST /api/company/interviews', () => {
  it('400 when application_id, title or scheduled_at is missing', async () => {
    const userDb = signIn('company')
    const res = await call('POST', '/api/company/interviews', { body: { description: 'notes' } })
    expect(res.status).toBe(400)
    const { fields } = (await res.json()).error
    expect(fields.application_id).toBe('is required')
    expect(fields.title).toBe('is required')
    expect(fields.scheduled_at).toBe('is required')
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('400 for a non-object body', async () => {
    signIn('company')
    const res = await call('POST', '/api/company/interviews', { body: [VALID_CREATE] })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.body).toBe('must be a JSON object')
  })

  it('400 for server-controlled fields (no mass assignment)', async () => {
    const userDb = signIn('company')
    const res = await call('POST', '/api/company/interviews', {
      body: { ...VALID_CREATE, id: INTERVIEW_ID, scheduled_by: 'someone-else', created_at: '2020-01-01' },
    })
    expect(res.status).toBe(400)
    const { fields } = (await res.json()).error
    expect(fields.id).toMatch(/managed by the server/)
    expect(fields.scheduled_by).toMatch(/managed by the server/)
    expect(fields.created_at).toMatch(/managed by the server/)
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('400 for an unknown field', async () => {
    const userDb = signIn('company')
    const res = await call('POST', '/api/company/interviews', { body: { ...VALID_CREATE, interview_type: 'panel' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.interview_type).toBe('is not an allowed field')
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('400 for a malformed application id, date, duration or meeting url', async () => {
    const userDb = signIn('company')
    const res = await call('POST', '/api/company/interviews', {
      body: {
        ...VALID_CREATE,
        application_id: 'not-a-uuid',
        scheduled_at: '25/10/2026',
        duration_minutes: 0,
        meeting_url: 'javascript:alert(1)',
      },
    })
    expect(res.status).toBe(400)
    const { fields } = (await res.json()).error
    expect(fields.application_id).toBe('must be a UUID')
    expect(fields.scheduled_at).toMatch(/ISO 8601/)
    expect(fields.duration_minutes).toMatch(/integer from 1 to 1440/)
    expect(fields.meeting_url).toBe('must be an http(s) URL')
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('403 when the caller has no active company membership', async () => {
    const userDb = signIn('company')
    withMembership(userDb, null)
    const res = await call('POST', '/api/company/interviews', { body: VALID_CREATE })
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
  })

  it('404 when the application does not exist', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({ data: null, error: null }))
    const res = await call('POST', '/api/company/interviews', { body: VALID_CREATE })
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('APPLICATION_NOT_FOUND')
  })

  it('403 when the application belongs to another company', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({
      data: { id: OTHER_APPLICATION_ID, company_id: OTHER_COMPANY_ID, job_id: JOB_ID, status: 'pending' },
      error: null,
    }))
    const res = await call('POST', '/api/company/interviews', { body: VALID_CREATE })
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
  })

  it('403 when the application belongs to a job of another company', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({
      data: {
        id: APPLICATION_ID,
        company_id: COMPANY_ID,
        job_id: OTHER_JOB_ID,
        status: 'pending',
        jobs: { id: OTHER_JOB_ID, company_id: OTHER_COMPANY_ID },
      },
      error: null,
    }))
    const res = await call('POST', '/api/company/interviews', { body: VALID_CREATE })
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toBe('Job does not belong to your company')
  })

  it('400 when the application was withdrawn', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({
      data: { id: APPLICATION_ID, company_id: COMPANY_ID, job_id: JOB_ID, status: 'withdrawn', jobs: { id: JOB_ID, company_id: COMPANY_ID } },
      error: null,
    }))
    const res = await call('POST', '/api/company/interviews', { body: VALID_CREATE })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_TRANSITION')
  })

  it('201: creates the interview with the verified caller as interviewer', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from
      .mockReturnValueOnce(query({ data: { id: APPLICATION_ID, company_id: COMPANY_ID, job_id: JOB_ID, status: 'shortlisted', jobs: { id: JOB_ID, company_id: COMPANY_ID } }, error: null }))
      .mockReturnValueOnce(query({ data: INTERVIEW, error: null })) // insert
      .mockReturnValueOnce(query({ data: INTERVIEW, error: null })) // reload

    const res = await call('POST', '/api/company/interviews', { body: VALID_CREATE })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.interview.id).toBe(INTERVIEW_ID)

    const insertQ = userDb.from.mock.results[2].value
    expect(insertQ.calls).toContainEqual([
      'insert',
      {
        application_id: APPLICATION_ID,
        scheduled_by: 'u-1',
        title: 'Technical Interview',
        description: 'System design and live coding',
        scheduled_at: '2026-10-25T14:00:00.000Z',
        duration_minutes: 45,
        meeting_url: 'https://meet.google.com/abc-defg-hij',
        location: 'Google Meet (Virtual)',
        status: 'scheduled',
      },
    ])
  })

  it('never trusts a client-supplied company id', async () => {
    const userDb = signIn('company')
    const res = await call('POST', '/api/company/interviews', {
      body: { ...VALID_CREATE, company_id: OTHER_COMPANY_ID },
    })

    // company_id is not an interview column, so it is rejected outright and
    // nothing is written.
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.company_id).toMatch(/managed by the server/)
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('maps a foreign key violation to 422 without internal details', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from
      .mockReturnValueOnce(query({ data: { id: APPLICATION_ID, company_id: COMPANY_ID, job_id: JOB_ID, status: 'pending', jobs: { id: JOB_ID, company_id: COMPANY_ID } }, error: null }))
      .mockReturnValueOnce(query({ data: null, error: { code: '23503', message: 'insert or update on table "interviews" violates foreign key constraint "interviews_application_id_fkey"' } }))

    const res = await call('POST', '/api/company/interviews', { body: VALID_CREATE })
    expect(res.status).toBe(422)
    const text = await res.text()
    expect(text).not.toContain('interviews_application_id_fkey')
  })
})

describe('PATCH /api/company/interviews/:interviewId', () => {
  it('400 for an empty body', async () => {
    const userDb = signIn('company')
    const res = await call('PATCH', `/api/company/interviews/${INTERVIEW_ID}`, { body: {} })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.body).toBe('must contain at least one field')
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('400 when the immutable application_id is changed', async () => {
    const userDb = signIn('company')
    const res = await call('PATCH', `/api/company/interviews/${INTERVIEW_ID}`, {
      body: { application_id: OTHER_APPLICATION_ID },
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.application_id).toMatch(/managed by the server/)
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('400 when the interviewer is changed', async () => {
    const userDb = signIn('company')
    const res = await call('PATCH', `/api/company/interviews/${INTERVIEW_ID}`, {
      body: { scheduled_by: 'someone-else' },
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.scheduled_by).toMatch(/managed by the server/)
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('404 when the interview does not exist', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({ data: null, error: null }))
    const res = await call('PATCH', `/api/company/interviews/${INTERVIEW_ID}`, { body: { title: 'New title' } })
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('INTERVIEW_NOT_FOUND')
  })

  it('403 when the interview belongs to another company', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({
      data: { id: INTERVIEW_ID, status: 'scheduled', application_id: APPLICATION_ID, applications: { id: APPLICATION_ID, company_id: OTHER_COMPANY_ID } },
      error: null,
    }))
    const res = await call('PATCH', `/api/company/interviews/${INTERVIEW_ID}`, { body: { title: 'Hijack' } })
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
  })

  it('200: updates the permitted fields and returns the stored record', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from
      .mockReturnValueOnce(query({ data: { id: INTERVIEW_ID, status: 'scheduled', application_id: APPLICATION_ID, applications: { id: APPLICATION_ID, company_id: COMPANY_ID } }, error: null }))
      .mockReturnValueOnce(query({ data: { ...INTERVIEW, title: 'Final Round' }, error: null })) // update
      .mockReturnValueOnce(query({ data: { ...INTERVIEW, title: 'Final Round' }, error: null })) // reload

    const res = await call('PATCH', `/api/company/interviews/${INTERVIEW_ID}`, {
      body: { title: '  Final Round  ', scheduled_at: '2026-10-26T09:30:00Z' },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.interview.title).toBe('Final Round')

    const updateQ = userDb.from.mock.results[2].value
    expect(updateQ.calls).toContainEqual([
      'update',
      { title: 'Final Round', scheduled_at: '2026-10-26T09:30:00.000Z' },
    ])
    expect(updateQ.calls).toContainEqual(['eq', 'id', INTERVIEW_ID])
  })

  it('400 when the status change is not a permitted transition', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({
      data: { id: INTERVIEW_ID, status: 'completed', application_id: APPLICATION_ID, applications: { id: APPLICATION_ID, company_id: COMPANY_ID } },
      error: null,
    }))
    const res = await call('PATCH', `/api/company/interviews/${INTERVIEW_ID}`, { body: { status: 'scheduled' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_TRANSITION')
  })
})

describe('PATCH /api/company/interviews/:interviewId/status', () => {
  it('400 for an unknown status', async () => {
    const userDb = signIn('company')
    const res = await call('PATCH', `/api/company/interviews/${INTERVIEW_ID}/status`, { body: { status: 'pending' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR')
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('400 when no status is given', async () => {
    signIn('company')
    const res = await call('PATCH', `/api/company/interviews/${INTERVIEW_ID}/status`, { body: {} })
    expect(res.status).toBe(400)
  })

  it('404 when the interview does not exist', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({ data: null, error: null }))
    const res = await call('PATCH', `/api/company/interviews/${INTERVIEW_ID}/status`, { body: { status: 'completed' } })
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('INTERVIEW_NOT_FOUND')
  })

  it('403 when the interview belongs to another company', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({
      data: { id: INTERVIEW_ID, status: 'scheduled', application_id: APPLICATION_ID, applications: { id: APPLICATION_ID, company_id: OTHER_COMPANY_ID } },
      error: null,
    }))
    const res = await call('PATCH', `/api/company/interviews/${INTERVIEW_ID}/status`, { body: { status: 'cancelled' } })
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
  })

  it('400 when a completed interview is cancelled', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from.mockReturnValueOnce(query({
      data: { id: INTERVIEW_ID, status: 'completed', application_id: APPLICATION_ID, applications: { id: APPLICATION_ID, company_id: COMPANY_ID } },
      error: null,
    }))
    const res = await call('PATCH', `/api/company/interviews/${INTERVIEW_ID}/status`, { body: { status: 'cancelled' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_TRANSITION')
  })

  it('200: completes a scheduled interview', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from
      .mockReturnValueOnce(query({ data: { id: INTERVIEW_ID, status: 'scheduled', application_id: APPLICATION_ID, applications: { id: APPLICATION_ID, company_id: COMPANY_ID } }, error: null }))
      .mockReturnValueOnce(query({ data: { ...INTERVIEW, status: 'completed' }, error: null })) // update
      .mockReturnValueOnce(query({ data: { ...INTERVIEW, status: 'completed' }, error: null })) // reload

    const res = await call('PATCH', `/api/company/interviews/${INTERVIEW_ID}/status`, { body: { status: 'completed' } })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.interview.status).toBe('completed')

    const updateQ = userDb.from.mock.results[2].value
    expect(updateQ.calls).toContainEqual(['update', { status: 'completed' }])
  })

  it('200: cancels a scheduled interview', async () => {
    const userDb = signIn('company')
    withMembership(userDb)
    userDb.from
      .mockReturnValueOnce(query({ data: { id: INTERVIEW_ID, status: 'scheduled', application_id: APPLICATION_ID, applications: { id: APPLICATION_ID, company_id: COMPANY_ID } }, error: null }))
      .mockReturnValueOnce(query({ data: { ...INTERVIEW, status: 'cancelled' }, error: null }))
      .mockReturnValueOnce(query({ data: { ...INTERVIEW, status: 'cancelled' }, error: null }))

    const res = await call('PATCH', `/api/company/interviews/${INTERVIEW_ID}/status`, { body: { status: 'cancelled' } })
    expect(res.status).toBe(200)
    expect((await res.json()).interview.status).toBe('cancelled')
  })
})

describe('validateInterviewPayload', () => {
  it('rejects non-objects', () => {
    expect(validateInterviewPayload(null, 'create').errors).toBeDefined()
    expect(validateInterviewPayload([], 'create').errors).toBeDefined()
    expect(validateInterviewPayload('string', 'create').errors).toBeDefined()
  })

  it('requires application_id, title and scheduled_at on create', () => {
    const { errors } = validateInterviewPayload({}, 'create')
    expect(errors.application_id).toBe('is required')
    expect(errors.title).toBe('is required')
    expect(errors.scheduled_at).toBe('is required')
  })

  it('normalises the timestamp to an ISO string', () => {
    const { values } = validateInterviewPayload({
      application_id: APPLICATION_ID,
      title: 'Interview',
      scheduled_at: '2026-10-25T14:00:00Z',
    }, 'create')
    expect(values.scheduled_at).toBe('2026-10-25T14:00:00.000Z')
  })

  it('rejects an application_id that is not a UUID', () => {
    const { errors } = validateInterviewPayload({
      application_id: 'abc',
      title: 'Interview',
      scheduled_at: '2026-10-25T14:00:00Z',
    }, 'create')
    expect(errors.application_id).toBe('must be a UUID')
  })

  it('allows null for optional fields on update', () => {
    const { values } = validateInterviewPayload({ description: null, meeting_url: null, location: null }, 'update')
    expect(values).toEqual({ description: null, meeting_url: null, location: null })
  })

  it('rejects inherited and unknown property names', () => {
    expect(validateInterviewPayload({ title: 'x', toString: 'x' }, 'update').errors).toEqual({
      toString: 'is not an allowed field',
    })
    expect(Object.getPrototypeOf(validateInterviewPayload(JSON.parse('{"title":"x","__proto__":"y"}'), 'update').errors))
      .toBe(Object.prototype)
  })

  it('rejects a duration outside the supported range', () => {
    expect(validateInterviewPayload({ duration_minutes: 0 }, 'update').errors.duration_minutes).toMatch(/1 to 1440/)
    expect(validateInterviewPayload({ duration_minutes: 1441 }, 'update').errors.duration_minutes).toMatch(/1 to 1440/)
    expect(validateInterviewPayload({ duration_minutes: 60 }, 'update').values.duration_minutes).toBe(60)
  })
})

describe('canTransitionInterview', () => {
  it('allows a scheduled interview to be completed, cancelled or rescheduled', () => {
    expect(canTransitionInterview('scheduled', 'completed')).toBe(true)
    expect(canTransitionInterview('scheduled', 'cancelled')).toBe(true)
    expect(canTransitionInterview('scheduled', 'rescheduled')).toBe(true)
  })

  it('keeps completed and cancelled terminal', () => {
    expect(canTransitionInterview('completed', 'scheduled')).toBe(false)
    expect(canTransitionInterview('completed', 'cancelled')).toBe(false)
    expect(canTransitionInterview('cancelled', 'scheduled')).toBe(false)
    expect(canTransitionInterview('cancelled', 'completed')).toBe(false)
  })

  it('lets a rescheduled interview go back to scheduled', () => {
    expect(canTransitionInterview('rescheduled', 'scheduled')).toBe(true)
    expect(canTransitionInterview('rescheduled', 'completed')).toBe(true)
  })

  it('rejects unknown statuses', () => {
    expect(canTransitionInterview('scheduled', 'pending')).toBe(false)
    expect(canTransitionInterview('unknown', 'scheduled')).toBe(false)
  })
})
