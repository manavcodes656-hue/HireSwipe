// HTTP tests for the company profile API: real Express app and middleware
// order, Supabase mocked (no credentials or network). These prove the API's
// own checks and how it calls Supabase; they do not prove PostgreSQL/RLS
// behaviour, which the migration harness covers separately.

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
import { validateCompanyProfile, validateJobPayload } from './company-routes.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-4222-8222-222222222222'
const COMPANY = { id: COMPANY_ID, name: 'Acme', industry: 'Tech', onboarding_completed: false }

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
  // authenticateToken only builds the user client once a role is resolved.
  if (role) createUserClient.mockReturnValueOnce(userDb)
  return userDb
}

/** Service-role membership lookup made by requireCompanyMember. */
function companyMember(role) {
  const q = query({ data: role ? { id: 'm-1', company_id: COMPANY_ID, profile_id: 'u-1', role, is_active: true } : null, error: null })
  supabase.from.mockReturnValueOnce(q)
  return q
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
  // reset (not just clear): drops queued mockReturnValueOnce values between tests
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

const PATCH_PATH = `/api/company/${COMPANY_ID}/profile`

describe('authentication on company routes', () => {
  it('401 without a bearer token', async () => {
    const res = await call('GET', '/api/company/profile', { token: null })
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('UNAUTHORIZED')
  })

  it('401 with an invalid token', async () => {
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: Object.assign(new Error('invalid JWT'), { status: 401 }) })
    const res = await call('POST', '/api/company/profile', { body: { name: 'Acme' }, token: 'bad' })
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('INVALID_TOKEN')
  })

  it('403 PROFILE_REQUIRED when the account has no profile role', async () => {
    signIn(null)
    const res = await call('GET', '/api/company/profile')
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('PROFILE_REQUIRED')
  })

  it('builds the user-scoped client from the caller token', async () => {
    const userDb = signIn('company')
    userDb.from.mockReturnValueOnce(query({ data: null, error: null }))
    await call('GET', '/api/company/profile', { token: 'tok-xyz' })
    expect(createUserClient).toHaveBeenCalledWith('tok-xyz')
  })
})

describe('GET /api/company/profile', () => {
  it('returns the caller membership and full company row', async () => {
    const userDb = signIn('company')
    const q = query({ data: { id: 'm-1', role: 'owner', company_id: COMPANY_ID, companies: COMPANY }, error: null })
    userDb.from.mockReturnValueOnce(q)

    const res = await call('GET', '/api/company/profile')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.membership).toEqual({ id: 'm-1', role: 'owner', company_id: COMPANY_ID, company: COMPANY })
    expect(userDb.from).toHaveBeenCalledWith('company_members')
    expect(q.calls).toContainEqual(['eq', 'profile_id', 'u-1'])
    expect(q.calls).toContainEqual(['eq', 'is_active', true])
  })

  it('returns membership null when the company account has no company yet', async () => {
    const userDb = signIn('company')
    userDb.from.mockReturnValueOnce(query({ data: null, error: null }))
    const res = await call('GET', '/api/company/profile')
    expect(res.status).toBe(200)
    expect((await res.json()).membership).toBeNull()
  })

  it('403 for a job seeker', async () => {
    const userDb = signIn('job_seeker')
    const res = await call('GET', '/api/company/profile')
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('maps database errors without leaking internals', async () => {
    const userDb = signIn('company')
    userDb.from.mockReturnValueOnce(query({ data: null, error: { code: '42P17', message: 'infinite recursion detected in policy for relation "company_members"' } }))
    const res = await call('GET', '/api/company/profile')
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('company_members')
    expect(text).not.toContain('recursion')
  })
})

describe('POST /api/company/profile', () => {
  it('201: creates through create_company_with_owner with sanitized fields only', async () => {
    const userDb = signIn('company')
    userDb.from
      .mockReturnValueOnce(query({ data: null, error: null })) // no existing membership
      .mockReturnValueOnce(query({ data: { id: 'm-9', role: 'owner', company_id: COMPANY_ID, companies: COMPANY }, error: null }))
    userDb.rpc.mockResolvedValueOnce({ data: COMPANY_ID, error: null })

    const res = await call('POST', '/api/company/profile', {
      body: { name: '  Acme  ', industry: 'Tech', website: 'https://acme.test', description: '', founded_year: 2001 },
    })

    expect(res.status).toBe(201)
    expect((await res.json()).membership).toMatchObject({ role: 'owner', company_id: COMPANY_ID })
    expect(userDb.rpc).toHaveBeenCalledWith('create_company_with_owner', {
      p_company: { name: 'Acme', industry: 'Tech', website: 'https://acme.test', description: null, founded_year: 2001 },
    })
  })

  it('400 when name is missing', async () => {
    const userDb = signIn('company')
    const res = await call('POST', '/api/company/profile', { body: { industry: 'Tech' } })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.fields.name).toBe('is required')
    expect(userDb.rpc).not.toHaveBeenCalled()
  })

  it('400 for wrong types and malformed values', async () => {
    signIn('company')
    const res = await call('POST', '/api/company/profile', {
      body: { name: 'Acme', founded_year: '2001', website: 'javascript:alert(1)', email: 'nope' },
    })
    expect(res.status).toBe(400)
    const { fields } = (await res.json()).error
    expect(Object.keys(fields).sort()).toEqual(['email', 'founded_year', 'website'])
  })

  it('400 for server-controlled fields (no mass assignment)', async () => {
    const userDb = signIn('company')
    const res = await call('POST', '/api/company/profile', {
      body: { name: 'Acme', id: COMPANY_ID, owner_id: 'u-2', role: 'owner', onboarding_completed: true },
    })
    expect(res.status).toBe(400)
    const { fields } = (await res.json()).error
    expect(fields.id).toMatch(/managed by the server/)
    expect(fields.owner_id).toMatch(/managed by the server/)
    expect(fields.role).toMatch(/managed by the server/)
    expect(fields.onboarding_completed).toBe('is not an allowed field')
    expect(userDb.rpc).not.toHaveBeenCalled()
  })

  it('400 for a non-object body', async () => {
    signIn('company')
    const res = await call('POST', '/api/company/profile', { body: [{ name: 'Acme' }] })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.body).toBe('must be a JSON object')
  })

  it('400 INVALID_JSON for malformed JSON', async () => {
    const res = await call('POST', '/api/company/profile', { rawBody: '{"name":' })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_JSON')
  })

  it('409 COMPANY_EXISTS when the caller already has a company', async () => {
    const userDb = signIn('company')
    userDb.from.mockReturnValueOnce(query({ data: { id: 'm-1', role: 'owner', company_id: COMPANY_ID, companies: COMPANY }, error: null }))
    const res = await call('POST', '/api/company/profile', { body: { name: 'Second' } })
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('COMPANY_EXISTS')
    expect(userDb.rpc).not.toHaveBeenCalled()
  })

  it('403 for a job seeker', async () => {
    const userDb = signIn('job_seeker')
    const res = await call('POST', '/api/company/profile', { body: { name: 'Acme' } })
    expect(res.status).toBe(403)
    expect(userDb.rpc).not.toHaveBeenCalled()
  })

  it('403 for a platform admin (only company accounts can own a company)', async () => {
    const userDb = signIn('admin')
    const res = await call('POST', '/api/company/profile', { body: { name: 'Acme' } })
    expect(res.status).toBe(403)
    expect(userDb.rpc).not.toHaveBeenCalled()
  })

  it('maps the database role check (42501) to 403 with its message', async () => {
    const userDb = signIn('company')
    userDb.from.mockReturnValueOnce(query({ data: null, error: null }))
    userDb.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Only company accounts can create a company' } })
    const res = await call('POST', '/api/company/profile', { body: { name: 'Acme' } })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toEqual({ code: 'FORBIDDEN', message: 'Only company accounts can create a company' })
  })

  it('maps a CHECK violation to 422 without the constraint name', async () => {
    const userDb = signIn('company')
    userDb.from.mockReturnValueOnce(query({ data: null, error: null }))
    userDb.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23514', message: 'new row for relation "companies" violates check constraint "companies_founded_year_check"' },
    })
    const res = await call('POST', '/api/company/profile', { body: { name: 'Acme', founded_year: 1999 } })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('RULE_VIOLATION')
    expect(JSON.stringify(body)).not.toContain('companies_founded_year_check')
  })

  it('409 COMPANY_EXISTS when the database check rejects a concurrent create (23505)', async () => {
    const userDb = signIn('company')
    userDb.from.mockReturnValueOnce(query({ data: null, error: null })) // API pre-check passed (race)
    userDb.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'This account already belongs to a company' },
    })
    const res = await call('POST', '/api/company/profile', { body: { name: 'Acme' } })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toEqual({ code: 'COMPANY_EXISTS', message: 'This account already belongs to a company' })
    expect(userDb.from).toHaveBeenCalledTimes(1) // no reload after a failed create
  })

  it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf'])('400 for inherited property name %s; nothing is created', async (key) => {
    const userDb = signIn('company')
    const res = await call('POST', '/api/company/profile', { body: { name: 'Acme', [key]: 'x' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields).toEqual({ [key]: 'is not an allowed field' })
    expect(userDb.rpc).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/company/:companyId/profile', () => {
  it('200: owner updates permitted fields only', async () => {
    const userDb = signIn('company')
    const memberQ = companyMember('owner')
    const updated = { ...COMPANY, industry: 'Fintech', onboarding_completed: true }
    const q = query({ data: updated, error: null })
    userDb.from.mockReturnValueOnce(q)

    const res = await call('PATCH', PATCH_PATH, { body: { industry: ' Fintech ', onboarding_completed: true } })

    expect(res.status).toBe(200)
    expect((await res.json()).company).toEqual(updated)
    expect(userDb.from).toHaveBeenCalledWith('companies')
    expect(q.calls).toContainEqual(['update', { industry: 'Fintech', onboarding_completed: true }])
    expect(q.calls).toContainEqual(['eq', 'id', COMPANY_ID])
    expect(memberQ.calls).toContainEqual(['eq', 'profile_id', 'u-1'])
    expect(memberQ.calls).toContainEqual(['eq', 'company_id', COMPANY_ID])
  })

  it('200: company admin member may update', async () => {
    const userDb = signIn('company')
    companyMember('admin')
    userDb.from.mockReturnValueOnce(query({ data: COMPANY, error: null }))
    const res = await call('PATCH', PATCH_PATH, { body: { name: 'Acme Ltd' } })
    expect(res.status).toBe(200)
  })

  it('403 for a recruiter (role beyond permission)', async () => {
    const userDb = signIn('company')
    companyMember('recruiter')
    const res = await call('PATCH', PATCH_PATH, { body: { name: 'Hijack' } })
    expect(res.status).toBe(403)
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('403 for another company (caller is not a member)', async () => {
    const userDb = signIn('company')
    companyMember(null)
    const res = await call('PATCH', `/api/company/${OTHER_COMPANY_ID}/profile`, { body: { name: 'Hijack' } })
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toBe('Not an active member of this company')
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('403 for a job seeker', async () => {
    const userDb = signIn('job_seeker')
    const res = await call('PATCH', PATCH_PATH, { body: { name: 'X' } })
    expect(res.status).toBe(403)
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('400 for protected fields; nothing is written', async () => {
    const userDb = signIn('company')
    companyMember('owner')
    const res = await call('PATCH', PATCH_PATH, {
      body: { name: 'Ok', id: OTHER_COMPANY_ID, created_at: '2020-01-01', company_id: OTHER_COMPANY_ID, is_active: false },
    })
    expect(res.status).toBe(400)
    const { fields } = (await res.json()).error
    expect(Object.keys(fields).sort()).toEqual(['company_id', 'created_at', 'id', 'is_active'])
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf'])('400 for inherited property name %s; nothing is written', async (key) => {
    const userDb = signIn('company')
    companyMember('owner')
    const res = await call('PATCH', PATCH_PATH, { body: { [key]: 'x' } })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.fields).toEqual({ [key]: 'is not an allowed field' })
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('400 for a "__proto__" key; nothing is written', async () => {
    const userDb = signIn('company')
    companyMember('owner')
    const res = await call('PATCH', PATCH_PATH, { rawBody: '{"__proto__":{"name":"x"}}' })
    expect(res.status).toBe(400)
    const { fields } = (await res.json()).error
    expect(Object.keys(fields)).toEqual(['__proto__'])
    expect(Object.getOwnPropertyDescriptor(fields, '__proto__').value).toBe('is not an allowed field')
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('400 for an unknown field next to a valid one; nothing is written', async () => {
    const userDb = signIn('company')
    companyMember('owner')
    const res = await call('PATCH', PATCH_PATH, { body: { name: 'Ok', culture: 'remote-first' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields).toEqual({ culture: 'is not an allowed field' })
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('maps PGRST204 (unknown column) to 400 without the column or table name', async () => {
    const userDb = signIn('company')
    companyMember('owner')
    userDb.from.mockReturnValueOnce(query({
      data: null,
      error: { code: 'PGRST204', message: "Could not find the 'city' column of 'companies' in the schema cache" },
    }))
    const res = await call('PATCH', PATCH_PATH, { body: { city: 'Pune' } })
    expect(res.status).toBe(400)
    const text = await res.text()
    expect(JSON.parse(text).error).toEqual({ code: 'VALIDATION_ERROR', message: 'The request contains an unknown field.' })
    expect(text).not.toMatch(/city|companies|schema/)
  })

  it('400 for an empty body', async () => {
    signIn('company')
    companyMember('owner')
    const res = await call('PATCH', PATCH_PATH, { body: {} })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.body).toBe('must contain at least one field')
  })

  it('400 when name is cleared', async () => {
    signIn('company')
    companyMember('owner')
    const res = await call('PATCH', PATCH_PATH, { body: { name: '   ' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.name).toBe('is required')
  })

  it('400 for a companyId that is not a UUID (before any lookup)', async () => {
    signIn('company')
    const res = await call('PATCH', '/api/company/not-a-uuid/profile', { body: { name: 'X' } })
    expect(res.status).toBe(400)
    expect(supabase.from).toHaveBeenCalledTimes(1) // only the profile role lookup
  })

  it('404 when the company does not exist (platform admin path)', async () => {
    const userDb = signIn('admin')
    userDb.from.mockReturnValueOnce(query({ data: null, error: null }))
    const res = await call('PATCH', `/api/company/${OTHER_COMPANY_ID}/profile`, { body: { name: 'X' } })
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('COMPANY_NOT_FOUND')
  })

  it('maps an RLS denial to 403 with a generic message', async () => {
    const userDb = signIn('company')
    companyMember('owner')
    userDb.from.mockReturnValueOnce(query({ data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "companies"' } }))
    const res = await call('PATCH', PATCH_PATH, { body: { name: 'X' } })
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toBe('You do not have permission to perform this action.')
  })
})

describe('validateCompanyProfile', () => {
  it('accepts null for optional fields and normalises blank strings to null', () => {
    expect(validateCompanyProfile({ name: 'A', city: null, state: '  ' }, 'create')).toEqual({
      values: { name: 'A', city: null, state: null },
    })
  })

  it('enforces the database founded_year range (1601..current year)', () => {
    const next = new Date().getUTCFullYear() + 1
    expect(validateCompanyProfile({ name: 'A', founded_year: 1600 }, 'create').errors.founded_year).toBeDefined()
    expect(validateCompanyProfile({ name: 'A', founded_year: next }, 'create').errors.founded_year).toBeDefined()
    expect(validateCompanyProfile({ name: 'A', founded_year: 1601 }, 'create').values.founded_year).toBe(1601)
  })

  it('limits completion_percentage to integers 0..100 on update', () => {
    expect(validateCompanyProfile({ completion_percentage: 101 }, 'update').errors).toBeDefined()
    expect(validateCompanyProfile({ completion_percentage: 50.5 }, 'update').errors).toBeDefined()
    expect(validateCompanyProfile({ completion_percentage: 100 }, 'update').values).toEqual({ completion_percentage: 100 })
  })

  it('rejects over-long text', () => {
    expect(validateCompanyProfile({ name: 'x'.repeat(201) }, 'create').errors.name).toMatch(/at most 200/)
  })

  describe.each(['create', 'update'])('own allowlist properties only (%s)', (mode) => {
    it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf'])('rejects inherited name %s', (key) => {
      expect(validateCompanyProfile({ name: 'A', [key]: 'x' }, mode)).toEqual({ errors: { [key]: 'is not an allowed field' } })
    })

    it('rejects an own "__proto__" key (as JSON.parse creates it)', () => {
      const { errors } = validateCompanyProfile(JSON.parse('{"name":"A","__proto__":"x"}'), mode)
      expect(Object.keys(errors)).toEqual(['__proto__'])
      expect(Object.getPrototypeOf(errors)).toBe(Object.prototype)
    })

    it('rejects unknown fields', () => {
      expect(validateCompanyProfile({ name: 'A', mission: 'm', banner_url: 'https://x.test' }, mode).errors).toEqual({
        mission: 'is not an allowed field',
        banner_url: 'is not an allowed field',
      })
    })
  })

  it('a create body without an own name still requires name', () => {
    const body = Object.create({ name: 'inherited' })
    expect(validateCompanyProfile(body, 'create').errors.name).toBe('is required')
  })

  it('accepts every allowed profile field', () => {
    const body = {
      name: 'Acme', description: 'd', industry: 'Tech', website: 'https://acme.test', company_size: '11-50',
      founded_year: 2001, logo_url: 'http://cdn.acme.test/logo.png', email: 'hi@acme.test', phone: '+91 (22) 555-0100',
      location: 'Mumbai', city: 'Mumbai', state: 'MH', country: 'India',
    }
    expect(validateCompanyProfile(body, 'create')).toEqual({ values: body })
    expect(validateCompanyProfile({ ...body, onboarding_completed: true, completion_percentage: 80 }, 'update')).toEqual({
      values: { ...body, onboarding_completed: true, completion_percentage: 80 },
    })
  })
})

const JOB_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_JOB_ID = '44444444-4444-4444-8444-444444444444'

describe('validateJobPayload', () => {
  it('rejects non-objects', () => {
    expect(validateJobPayload(null, 'create').errors).toBeDefined()
    expect(validateJobPayload([], 'create').errors).toBeDefined()
    expect(validateJobPayload('string', 'create').errors).toBeDefined()
  })

  it('requires title, description, and employment_type on create', () => {
    const { errors } = validateJobPayload({}, 'create')
    expect(errors.title).toBe('is required')
    expect(errors.description).toBe('is required')
    expect(errors.employment_type).toBe('is required')
  })

  it('rejects invalid employment_type', () => {
    const { errors } = validateJobPayload({
      title: 'Engineer',
      description: 'Building software',
      employment_type: 'invalid_type',
    }, 'create')
    expect(errors.employment_type).toContain('must be one of')
  })

  it('rejects experience_max < experience_min', () => {
    const { errors } = validateJobPayload({
      title: 'Engineer',
      description: 'Building software',
      employment_type: 'full_time',
      experience_min: 5,
      experience_max: 2,
    }, 'create')
    expect(errors.experience_max).toBe('cannot be less than experience_min')
  })

  it('normalizes status active to published', () => {
    const { values } = validateJobPayload({
      title: 'Engineer',
      description: 'Building software',
      employment_type: 'full_time',
      status: 'active',
    }, 'create')
    expect(values.status).toBe('published')
  })
})

describe('Company Jobs API', () => {
  const VALID_JOB_CREATE = {
    title: 'Senior Frontend Engineer',
    description: 'Lead frontend architecture in Angular and TypeScript',
    employment_type: 'full_time',
    experience_level: 'senior',
    salary_min: 100000,
    salary_max: 140000,
    location: 'Remote',
    requirements: ['TypeScript', 'Angular'],
    benefits: ['Health insurance', '401k'],
  }

  describe('GET /api/company/jobs', () => {
    it('returns 401 without token', async () => {
      const res = await call('GET', '/api/company/jobs', { token: '' })
      expect(res.status).toBe(401)
    })

    it('returns 403 when user has no active company membership', async () => {
      const userDb = signIn('company')
      userDb.from.mockReturnValueOnce(query({ data: null, error: null }))

      const res = await call('GET', '/api/company/jobs')
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error.code).toBe('FORBIDDEN')
    })

    it('returns 200 with company jobs when caller is a member', async () => {
      const userDb = signIn('company')
      userDb.from
        .mockReturnValueOnce(query({ data: { id: 'm-1', role: 'owner', company_id: COMPANY_ID, companies: COMPANY }, error: null }))
        .mockReturnValueOnce(query({
          data: [{ id: JOB_ID, company_id: COMPANY_ID, title: 'Engineer', status: 'published' }],
          error: null,
        }))

      const res = await call('GET', '/api/company/jobs')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('ok')
      expect(body.jobs).toHaveLength(1)
      expect(body.jobs[0].title).toBe('Engineer')
    })
  })

  describe('GET /api/company/jobs/:jobId', () => {
    it('returns 400 for non-UUID jobId', async () => {
      signIn('company')
      const res = await call('GET', '/api/company/jobs/not-a-uuid')
      expect(res.status).toBe(400)
    })

    it('returns 404 if job does not exist', async () => {
      const userDb = signIn('company')
      userDb.from
        .mockReturnValueOnce(query({ data: { id: 'm-1', role: 'owner', company_id: COMPANY_ID }, error: null }))
        .mockReturnValueOnce(query({ data: null, error: null }))

      const res = await call('GET', `/api/company/jobs/${JOB_ID}`)
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error.code).toBe('JOB_NOT_FOUND')
    })

    it('returns 403 if job belongs to another company', async () => {
      const userDb = signIn('company')
      userDb.from
        .mockReturnValueOnce(query({ data: { id: 'm-1', role: 'owner', company_id: COMPANY_ID }, error: null }))
        .mockReturnValueOnce(query({ data: { id: OTHER_JOB_ID, company_id: OTHER_COMPANY_ID, title: 'Other Job' }, error: null }))

      const res = await call('GET', `/api/company/jobs/${OTHER_JOB_ID}`)
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error.code).toBe('FORBIDDEN')
    })

    it('returns 200 with job details for authorized company member', async () => {
      const userDb = signIn('company')
      userDb.from
        .mockReturnValueOnce(query({ data: { id: 'm-1', role: 'owner', company_id: COMPANY_ID }, error: null }))
        .mockReturnValueOnce(query({ data: { id: JOB_ID, company_id: COMPANY_ID, title: 'My Job' }, error: null }))

      const res = await call('GET', `/api/company/jobs/${JOB_ID}`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.job.title).toBe('My Job')
    })
  })

  describe('POST /api/company/jobs', () => {
    it('returns 400 on validation error (missing required title)', async () => {
      signIn('company')
      const res = await call('POST', '/api/company/jobs', { body: { description: 'desc', employment_type: 'full_time' } })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.fields.title).toBe('is required')
    })

    it('creates job and returns 201 on success', async () => {
      const userDb = signIn('company')
      userDb.from
        .mockReturnValueOnce(query({ data: { id: 'm-1', role: 'owner', company_id: COMPANY_ID }, error: null }))
        .mockReturnValueOnce(query({ data: { id: JOB_ID, company_id: COMPANY_ID, ...VALID_JOB_CREATE }, error: null }))
        .mockReturnValueOnce(query({ data: [], error: null })) // job_requirements
        .mockReturnValueOnce(query({ data: [], error: null })) // job_benefits
        .mockReturnValueOnce(query({ data: { id: JOB_ID, company_id: COMPANY_ID, ...VALID_JOB_CREATE }, error: null })) // reload

      const res = await call('POST', '/api/company/jobs', { body: VALID_JOB_CREATE })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.status).toBe('ok')
      expect(body.job.id).toBe(JOB_ID)
    })
  })

  describe('PATCH /api/company/jobs/:jobId/status', () => {
    it('returns 400 for invalid status', async () => {
      signIn('company')
      const res = await call('PATCH', `/api/company/jobs/${JOB_ID}/status`, { body: { status: 'invalid_status' } })
      expect(res.status).toBe(400)
    })

    it('updates status and returns 200', async () => {
      const userDb = signIn('company')
      userDb.from
        .mockReturnValueOnce(query({ data: { id: 'm-1', role: 'owner', company_id: COMPANY_ID }, error: null }))
        .mockReturnValueOnce(query({ data: { id: JOB_ID, company_id: COMPANY_ID }, error: null }))
        .mockReturnValueOnce(query({ data: { id: JOB_ID, status: 'paused' }, error: null }))

      const res = await call('PATCH', `/api/company/jobs/${JOB_ID}/status`, { body: { status: 'paused' } })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.job.status).toBe('paused')
    })
  })
})

describe('Company Applications API', () => {
  const APPLICATION_ID = '55555555-5555-4555-8555-555555555555'
  const OTHER_APPLICATION_ID = '66666666-6666-4666-8666-666666666666'

  describe('GET /api/company/applications', () => {
    it('returns 401 without token', async () => {
      const res = await call('GET', '/api/company/applications', { token: '' })
      expect(res.status).toBe(401)
    })

    it('returns 403 when user has no active company membership', async () => {
      const userDb = signIn('company')
      userDb.from.mockReturnValueOnce(query({ data: null, error: null }))

      const res = await call('GET', '/api/company/applications')
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error.code).toBe('FORBIDDEN')
    })

    it('returns 400 for non-UUID jobId query', async () => {
      const userDb = signIn('company')
      userDb.from.mockReturnValueOnce(query({ data: { id: 'm-1', company_id: COMPANY_ID }, error: null }))

      const res = await call('GET', '/api/company/applications?jobId=not-a-uuid')
      expect(res.status).toBe(400)
    })

    it('returns 403 when jobId belongs to another company', async () => {
      const userDb = signIn('company')
      userDb.from
        .mockReturnValueOnce(query({ data: { id: 'm-1', company_id: COMPANY_ID }, error: null }))
        .mockReturnValueOnce(query({ data: { id: OTHER_JOB_ID, company_id: OTHER_COMPANY_ID }, error: null }))

      const res = await call('GET', `/api/company/applications?jobId=${OTHER_JOB_ID}`)
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error.code).toBe('FORBIDDEN')
    })

    it('returns 400 for invalid status query', async () => {
      const userDb = signIn('company')
      userDb.from.mockReturnValueOnce(query({ data: { id: 'm-1', company_id: COMPANY_ID }, error: null }))

      const res = await call('GET', '/api/company/applications?status=invalid_status')
      expect(res.status).toBe(400)
    })

    it('returns 200 with applications list for authorized company member', async () => {
      const userDb = signIn('company')
      userDb.from
        .mockReturnValueOnce(query({ data: { id: 'm-1', company_id: COMPANY_ID }, error: null }))
        .mockReturnValueOnce(query({
          data: [{ id: APPLICATION_ID, company_id: COMPANY_ID, job_id: JOB_ID, status: 'pending' }],
          error: null,
        }))

      const res = await call('GET', '/api/company/applications')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('ok')
      expect(body.applications).toHaveLength(1)
      expect(body.applications[0].id).toBe(APPLICATION_ID)
    })
  })

  describe('GET /api/company/applications/:applicationId', () => {
    it('returns 400 for non-UUID applicationId', async () => {
      signIn('company')
      const res = await call('GET', '/api/company/applications/not-a-uuid')
      expect(res.status).toBe(400)
    })

    it('returns 404 when application does not exist', async () => {
      const userDb = signIn('company')
      userDb.from
        .mockReturnValueOnce(query({ data: { id: 'm-1', company_id: COMPANY_ID }, error: null }))
        .mockReturnValueOnce(query({ data: null, error: null }))

      const res = await call('GET', `/api/company/applications/${APPLICATION_ID}`)
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error.code).toBe('APPLICATION_NOT_FOUND')
    })

    it('returns 403 when application belongs to another company', async () => {
      const userDb = signIn('company')
      userDb.from
        .mockReturnValueOnce(query({ data: { id: 'm-1', company_id: COMPANY_ID }, error: null }))
        .mockReturnValueOnce(query({ data: { id: OTHER_APPLICATION_ID, company_id: OTHER_COMPANY_ID }, error: null }))

      const res = await call('GET', `/api/company/applications/${OTHER_APPLICATION_ID}`)
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error.code).toBe('FORBIDDEN')
    })

    it('returns 200 with application details for authorized company member', async () => {
      const userDb = signIn('company')
      userDb.from
        .mockReturnValueOnce(query({ data: { id: 'm-1', company_id: COMPANY_ID }, error: null }))
        .mockReturnValueOnce(query({ data: { id: APPLICATION_ID, company_id: COMPANY_ID, status: 'pending' }, error: null }))

      const res = await call('GET', `/api/company/applications/${APPLICATION_ID}`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('ok')
      expect(body.application.id).toBe(APPLICATION_ID)
    })
  })

  describe('PATCH /api/company/applications/:applicationId/status', () => {
    it('returns 400 for invalid status', async () => {
      signIn('company')
      const res = await call('PATCH', `/api/company/applications/${APPLICATION_ID}/status`, { body: { status: 'invalid_status' } })
      expect(res.status).toBe(400)
    })

    it('returns 400 when status is withdrawn (only candidates can withdraw)', async () => {
      signIn('company')
      const res = await call('PATCH', `/api/company/applications/${APPLICATION_ID}/status`, { body: { status: 'withdrawn' } })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('INVALID_STATUS')
    })

    it('returns 404 when application does not exist', async () => {
      const userDb = signIn('company')
      userDb.from
        .mockReturnValueOnce(query({ data: { id: 'm-1', company_id: COMPANY_ID }, error: null }))
        .mockReturnValueOnce(query({ data: null, error: null }))

      const res = await call('PATCH', `/api/company/applications/${APPLICATION_ID}/status`, { body: { status: 'reviewing' } })
      expect(res.status).toBe(404)
    })

    it('returns 403 when application belongs to another company', async () => {
      const userDb = signIn('company')
      userDb.from
        .mockReturnValueOnce(query({ data: { id: 'm-1', company_id: COMPANY_ID }, error: null }))
        .mockReturnValueOnce(query({ data: { id: OTHER_APPLICATION_ID, company_id: OTHER_COMPANY_ID, status: 'pending' }, error: null }))

      const res = await call('PATCH', `/api/company/applications/${OTHER_APPLICATION_ID}/status`, { body: { status: 'reviewing' } })
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error.code).toBe('FORBIDDEN')
    })

    it('returns 400 when application is already in withdrawn status', async () => {
      const userDb = signIn('company')
      userDb.from
        .mockReturnValueOnce(query({ data: { id: 'm-1', company_id: COMPANY_ID }, error: null }))
        .mockReturnValueOnce(query({ data: { id: APPLICATION_ID, company_id: COMPANY_ID, status: 'withdrawn' }, error: null }))

      const res = await call('PATCH', `/api/company/applications/${APPLICATION_ID}/status`, { body: { status: 'reviewing' } })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('INVALID_TRANSITION')
    })

    it('updates application status and returns 200 with updated application', async () => {
      const userDb = signIn('company')
      userDb.from
        .mockReturnValueOnce(query({ data: { id: 'm-1', company_id: COMPANY_ID }, error: null }))
        .mockReturnValueOnce(query({ data: { id: APPLICATION_ID, company_id: COMPANY_ID, status: 'pending' }, error: null }))
        .mockReturnValueOnce(query({ data: null, error: null })) // update
        .mockReturnValueOnce(query({ data: { id: 'hist-1' }, error: null })) // latestHist find
        .mockReturnValueOnce(query({ data: null, error: null })) // update note
        .mockReturnValueOnce(query({ data: { id: APPLICATION_ID, company_id: COMPANY_ID, status: 'shortlisted' }, error: null })) // reload

      const res = await call('PATCH', `/api/company/applications/${APPLICATION_ID}/status`, {
        body: { status: 'shortlisted', note: 'Strong candidate background' },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('ok')
      expect(body.application.status).toBe('shortlisted')
    })
  })
})
