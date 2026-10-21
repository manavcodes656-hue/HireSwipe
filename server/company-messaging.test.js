// HTTP tests for the company messaging API: real Express app and middleware
// order, Supabase mocked (no credentials or network). These prove the API's
// own checks and how it calls Supabase; they do not prove PostgreSQL/RLS
// behaviour, which the migration harness covers separately.
//
// Schema facts the assertions rely on (001_initial_hireswipe_schema.sql):
// - public.conversations has no company column; a conversation belongs to a
//   match (conversations.match_id -> matches.id) and the match carries the
//   company.
// - public.messages is writable by INSERT only (the RLS policies of 003/004
//   define no UPDATE), and its sender must be the authenticated caller.
// - public.message_type is 'text' | 'file' | 'system'.

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
import { validateMessagePayload } from './company-routes.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-4222-8222-222222222222'
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_CONVERSATION_ID = '44444444-4444-4444-8444-444444444444'
const JOB_ID = '55555555-5555-4555-8555-555555555555'
const MATCH_ID = '66666666-6666-4666-8666-666666666666'
const RECRUITER_ID = '77777777-7777-4777-8777-777777777777'
const CANDIDATE_ID = '88888888-8888-4888-8888-888888888888'

const MEMBERSHIP = { id: 'm-1', company_id: COMPANY_ID, role: 'owner' }

const CONVERSATION = {
  id: CONVERSATION_ID,
  match_id: MATCH_ID,
  created_at: '2026-10-01T09:00:00.000Z',
  updated_at: '2026-10-05T10:30:00.000Z',
  matches: {
    id: MATCH_ID,
    job_id: JOB_ID,
    job_seeker_id: '99999999-9999-4999-8999-999999999999',
    company_id: COMPANY_ID,
    jobs: { id: JOB_ID, title: 'Senior Frontend Engineer', location: 'Bengaluru, India' },
    job_seeker_profiles: { headline: 'Angular expert' },
  },
  conversation_members: [
    { profile_id: RECRUITER_ID, profiles: { id: RECRUITER_ID, full_name: 'Recruiter', avatar_url: null, role: 'company' } },
    { profile_id: CANDIDATE_ID, profiles: { id: CANDIDATE_ID, full_name: 'Aarav Patel', avatar_url: 'https://cdn.test/a.png', role: 'job_seeker' } },
  ],
}

const MESSAGES = [
  {
    id: 'm-1',
    conversation_id: CONVERSATION_ID,
    sender_id: CANDIDATE_ID,
    message: 'Hello, when can we talk?',
    message_type: 'text',
    is_read: false,
    created_at: '2026-10-05T10:00:00.000Z',
  },
  {
    id: 'm-2',
    conversation_id: CONVERSATION_ID,
    sender_id: RECRUITER_ID,
    message: 'Tomorrow at 3pm works for us.',
    message_type: 'text',
    is_read: true,
    created_at: '2026-10-05T10:30:00.000Z',
  },
]

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
function signIn(role, id = RECRUITER_ID) {
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

/** The caller's active membership rows. */
function withMemberships(userDb, memberships = [MEMBERSHIP]) {
  userDb.from.mockReturnValueOnce(query({ data: memberships, error: null }))
}

describe('authentication on company messaging routes', () => {
  it('401 without a bearer token', async () => {
    const res = await call('GET', '/api/company/conversations', { token: null })
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('UNAUTHORIZED')
  })

  it('401 with an invalid token', async () => {
    supabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: Object.assign(new Error('invalid JWT'), { status: 401 }),
    })
    const res = await call('GET', '/api/company/conversations', { token: 'bad' })
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('INVALID_TOKEN')
  })

  it('403 PROFILE_REQUIRED when the account has no profile role', async () => {
    signIn(null)
    const res = await call('GET', '/api/company/conversations')
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('PROFILE_REQUIRED')
  })

  it('403 for a job seeker', async () => {
    const userDb = signIn('job_seeker')
    const res = await call('GET', '/api/company/conversations')
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('uses the user-scoped client for messaging data', async () => {
    const userDb = signIn('company')
    withMemberships(userDb)
    userDb.from.mockReturnValueOnce(query({ data: [], error: null }))
    await call('GET', '/api/company/conversations')
    expect(supabase.from).toHaveBeenCalledTimes(1) // only the profile role lookup
  })
})

describe('GET /api/company/conversations', () => {
  it('403 when the caller has no active company membership', async () => {
    const userDb = signIn('company')
    withMemberships(userDb, [])
    const res = await call('GET', '/api/company/conversations')
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
  })

  it('200: returns the conversations with candidate, last message and unread count', async () => {
    const userDb = signIn('company')
    withMemberships(userDb)
    const listQ = query({ data: [CONVERSATION], error: null })
    userDb.from.mockReturnValueOnce(listQ)
    userDb.from.mockReturnValueOnce(query({ data: MESSAGES, error: null }))

    const res = await call('GET', '/api/company/conversations')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.conversations).toHaveLength(1)

    const conversation = body.conversations[0]
    expect(conversation.id).toBe(CONVERSATION_ID)
    expect(conversation.company_id).toBe(COMPANY_ID)
    expect(conversation.job.title).toBe('Senior Frontend Engineer')
    expect(conversation.candidate).toEqual({
      id: CANDIDATE_ID,
      full_name: 'Aarav Patel',
      avatar_url: 'https://cdn.test/a.png',
      headline: 'Angular expert',
    })
    expect(conversation.last_message.message).toBe('Tomorrow at 3pm works for us.')
    expect(conversation.last_message_at).toBe('2026-10-05T10:30:00.000Z')
    // one unread message, and it was not sent by the caller
    expect(conversation.unread_count).toBe(1)
    expect(conversation.participant_ids).toEqual([RECRUITER_ID, CANDIDATE_ID])

    // scoped to the caller's company through the match
    expect(listQ.calls).toContainEqual(['in', 'matches.company_id', [COMPANY_ID]])
  })

  it('200: unread count ignores the caller\'s own messages', async () => {
    const userDb = signIn('company')
    withMemberships(userDb)
    userDb.from.mockReturnValueOnce(query({ data: [CONVERSATION], error: null }))
    userDb.from.mockReturnValueOnce(query({ data: MESSAGES.map((m) => ({ ...m, is_read: false })), error: null }))

    const res = await call('GET', '/api/company/conversations')
    const body = await res.json()
    expect(body.conversations[0].unread_count).toBe(1)
  })

  it('400 for a non-UUID jobId', async () => {
    const userDb = signIn('company')
    withMemberships(userDb)
    const res = await call('GET', '/api/company/conversations?jobId=nope')
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR')
  })

  it('400 for a non-UUID candidateId', async () => {
    const userDb = signIn('company')
    withMemberships(userDb)
    const res = await call('GET', '/api/company/conversations?candidateId=nope')
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR')
  })

  it('200: filters by jobId', async () => {
    const userDb = signIn('company')
    withMemberships(userDb)
    const listQ = query({ data: [], error: null })
    userDb.from.mockReturnValueOnce(listQ)

    const res = await call('GET', `/api/company/conversations?jobId=${JOB_ID}`)
    expect(res.status).toBe(200)
    expect(listQ.calls).toContainEqual(['eq', 'matches.job_id', JOB_ID])
  })

  it('200: filters by candidateId over the participants', async () => {
    const userDb = signIn('company')
    withMemberships(userDb)
    userDb.from.mockReturnValueOnce(query({ data: [CONVERSATION], error: null }))
    userDb.from.mockReturnValueOnce(query({ data: MESSAGES, error: null }))

    const res = await call('GET', `/api/company/conversations?candidateId=${CANDIDATE_ID}`)
    expect(res.status).toBe(200)
    expect((await res.json()).conversations).toHaveLength(1)
  })

  it('200: a candidateId that is not a participant of the conversation yields no row', async () => {
    const userDb = signIn('company')
    withMemberships(userDb)
    userDb.from.mockReturnValueOnce(query({ data: [CONVERSATION], error: null }))
    userDb.from.mockReturnValueOnce(query({ data: MESSAGES, error: null }))

    const res = await call('GET', `/api/company/conversations?candidateId=${RECRUITER_ID}`)
    expect(res.status).toBe(200)
    expect((await res.json()).conversations).toHaveLength(0)
  })

  it('maps database errors without leaking internals', async () => {
    const userDb = signIn('company')
    withMemberships(userDb)
    userDb.from.mockReturnValueOnce(query({
      data: null,
      error: { code: '42P17', message: 'infinite recursion detected in policy for relation "conversations"' },
    }))
    const res = await call('GET', '/api/company/conversations')
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('conversations')
    expect(text).not.toContain('recursion')
  })
})

describe('GET /api/company/conversations/:conversationId', () => {
  it('400 for a conversationId that is not a UUID (before any lookup)', async () => {
    const userDb = signIn('company')
    const res = await call('GET', '/api/company/conversations/not-a-uuid')
    expect(res.status).toBe(400)
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('404 when the conversation does not exist', async () => {
    const userDb = signIn('company')
    userDb.from.mockReturnValueOnce(query({ data: null, error: null }))
    const res = await call('GET', `/api/company/conversations/${CONVERSATION_ID}`)
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('CONVERSATION_NOT_FOUND')
  })

  it('404 rather than 403 for a conversation of an unrelated company (no disclosure)', async () => {
    const userDb = signIn('company')
    userDb.from.mockReturnValueOnce(query({ data: null, error: null }))
    const res = await call('GET', `/api/company/conversations/${OTHER_CONVERSATION_ID}`)
    expect(res.status).toBe(404)
  })

  it('403 when the caller is not an active member of the conversation\'s company', async () => {
    const userDb = signIn('company')
    userDb.from.mockReturnValueOnce(query({ data: CONVERSATION, error: null }))
    userDb.from.mockReturnValueOnce(query({ data: [], error: null })) // no membership
    const res = await call('GET', `/api/company/conversations/${CONVERSATION_ID}`)
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toBe('Not an active member of this company')
  })

  it('403 when the caller is not a participant of the conversation', async () => {
    const userDb = signIn('company')
    userDb.from.mockReturnValueOnce(query({
      data: {
        ...CONVERSATION,
        conversation_members: CONVERSATION.conversation_members.filter((m) => m.profile_id !== RECRUITER_ID),
      },
      error: null,
    }))
    userDb.from.mockReturnValueOnce(query({ data: [MEMBERSHIP], error: null }))
    const res = await call('GET', `/api/company/conversations/${CONVERSATION_ID}`)
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toBe('Not a participant of this conversation')
  })

  it('200: returns the conversation with its messages', async () => {
    const userDb = signIn('company')
    userDb.from.mockReturnValueOnce(query({ data: CONVERSATION, error: null }))
    userDb.from.mockReturnValueOnce(query({ data: [MEMBERSHIP], error: null }))
    userDb.from.mockReturnValueOnce(query({ data: MESSAGES, error: null }))

    const res = await call('GET', `/api/company/conversations/${CONVERSATION_ID}`)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.conversation.id).toBe(CONVERSATION_ID)
    expect(body.conversation.candidate.full_name).toBe('Aarav Patel')
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0].message).toBe('Hello, when can we talk?')
    expect(body.messages[1].sender_id).toBe(RECRUITER_ID)
  })
})

describe('POST /api/company/conversations/:conversationId/messages', () => {
  it('400 when the message text is missing', async () => {
    const userDb = signIn('company')
    const res = await call('POST', `/api/company/conversations/${CONVERSATION_ID}/messages`, { body: {} })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.message).toBe('is required')
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('400 for a blank message', async () => {
    const userDb = signIn('company')
    const res = await call('POST', `/api/company/conversations/${CONVERSATION_ID}/messages`, { body: { message: '   ' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.message).toBe('is required')
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('400 for a non-object body', async () => {
    signIn('company')
    const res = await call('POST', `/api/company/conversations/${CONVERSATION_ID}/messages`, { body: ['hi'] })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.body).toBe('must be a JSON object')
  })

  it('400 for server-controlled fields (no mass assignment)', async () => {
    const userDb = signIn('company')
    const res = await call('POST', `/api/company/conversations/${CONVERSATION_ID}/messages`, {
      body: { message: 'hi', sender_id: OTHER_COMPANY_ID, conversation_id: OTHER_CONVERSATION_ID, is_read: true, id: 'forged' },
    })
    expect(res.status).toBe(400)
    const { fields } = (await res.json()).error
    expect(fields.sender_id).toMatch(/managed by the server/)
    expect(fields.conversation_id).toMatch(/managed by the server/)
    expect(fields.is_read).toMatch(/managed by the server/)
    expect(fields.id).toMatch(/managed by the server/)
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('400 for an unknown field', async () => {
    const userDb = signIn('company')
    const res = await call('POST', `/api/company/conversations/${CONVERSATION_ID}/messages`, {
      body: { message: 'hi', attachment_url: 'https://x.test/a.pdf' },
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.attachment_url).toBe('is not an allowed field')
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it("400 for the server-only 'system' message type", async () => {
    const userDb = signIn('company')
    const res = await call('POST', `/api/company/conversations/${CONVERSATION_ID}/messages`, {
      body: { message: 'hi', message_type: 'system' },
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.message_type).toContain('text, file')
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('400 for a message that is too long', async () => {
    const userDb = signIn('company')
    const res = await call('POST', `/api/company/conversations/${CONVERSATION_ID}/messages`, {
      body: { message: 'x'.repeat(5001) },
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.message).toMatch(/at most 5000/)
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('404 when the conversation does not exist', async () => {
    const userDb = signIn('company')
    userDb.from.mockReturnValueOnce(query({ data: null, error: null }))
    const res = await call('POST', `/api/company/conversations/${CONVERSATION_ID}/messages`, { body: { message: 'hi' } })
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('CONVERSATION_NOT_FOUND')
  })

  it('403 when the caller is not an active member of the conversation\'s company', async () => {
    const userDb = signIn('company')
    userDb.from.mockReturnValueOnce(query({ data: CONVERSATION, error: null }))
    userDb.from.mockReturnValueOnce(query({ data: [], error: null }))
    const res = await call('POST', `/api/company/conversations/${CONVERSATION_ID}/messages`, { body: { message: 'hi' } })
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
  })

  it('403 when the caller is not a participant of the conversation', async () => {
    const userDb = signIn('company')
    userDb.from.mockReturnValueOnce(query({
      data: {
        ...CONVERSATION,
        conversation_members: CONVERSATION.conversation_members.filter((m) => m.profile_id !== RECRUITER_ID),
      },
      error: null,
    }))
    userDb.from.mockReturnValueOnce(query({ data: [MEMBERSHIP], error: null }))
    const res = await call('POST', `/api/company/conversations/${CONVERSATION_ID}/messages`, { body: { message: 'hi' } })
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
  })

  it('201: sends the message with the verified caller as sender', async () => {
    const userDb = signIn('company')
    userDb.from.mockReturnValueOnce(query({ data: CONVERSATION, error: null }))
    userDb.from.mockReturnValueOnce(query({ data: [MEMBERSHIP], error: null }))
    const insertQ = query({ data: { ...MESSAGES[1], message: 'See you tomorrow!' }, error: null })
    userDb.from.mockReturnValueOnce(insertQ)

    const res = await call('POST', `/api/company/conversations/${CONVERSATION_ID}/messages`, {
      body: { message: '  See you tomorrow!  ' },
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.message.message).toBe('See you tomorrow!')

    expect(insertQ.calls).toContainEqual([
      'insert',
      {
        conversation_id: CONVERSATION_ID,
        sender_id: RECRUITER_ID,
        message: 'See you tomorrow!',
        message_type: 'text',
        is_read: true,
      },
    ])
  })

  it('never accepts a client-supplied sender id', async () => {
    const userDb = signIn('company')
    const res = await call('POST', `/api/company/conversations/${CONVERSATION_ID}/messages`, {
      body: { message: 'hi', sender_id: CANDIDATE_ID },
    })

    // the payload is rejected during validation, so nothing is written
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.sender_id).toMatch(/managed by the server/)
    expect(userDb.from).not.toHaveBeenCalled()
  })

  it('maps an RLS denial to 403 without leaking internals', async () => {
    const userDb = signIn('company')
    userDb.from.mockReturnValueOnce(query({ data: CONVERSATION, error: null }))
    userDb.from.mockReturnValueOnce(query({ data: [MEMBERSHIP], error: null }))
    userDb.from.mockReturnValueOnce(query({
      data: null,
      error: { code: '42501', message: 'new row violates row-level security policy for table "messages"' },
    }))

    const res = await call('POST', `/api/company/conversations/${CONVERSATION_ID}/messages`, { body: { message: 'hi' } })
    expect(res.status).toBe(403)
    const text = await res.text()
    expect(text).not.toContain('messages')
    expect(text).not.toContain('row-level security')
  })
})

describe('validateMessagePayload', () => {
  it('rejects non-objects', () => {
    expect(validateMessagePayload(null).errors).toBeDefined()
    expect(validateMessagePayload([]).errors).toBeDefined()
    expect(validateMessagePayload('string').errors).toBeDefined()
  })

  it('requires a message', () => {
    expect(validateMessagePayload({}).errors.message).toBe('is required')
  })

  it('trims the message and accepts text and file types', () => {
    expect(validateMessagePayload({ message: '  hi  ' }).values).toEqual({ message: 'hi' })
    expect(validateMessagePayload({ message: 'hi', message_type: 'file' }).values).toEqual({
      message: 'hi',
      message_type: 'file',
    })
  })

  it('rejects the server-only system type', () => {
    expect(validateMessagePayload({ message: 'hi', message_type: 'system' }).errors.message_type).toBeDefined()
  })

  it('rejects unknown and inherited property names', () => {
    expect(validateMessagePayload({ message: 'hi', toString: 'x' }).errors).toEqual({
      toString: 'is not an allowed field',
    })
    expect(Object.getPrototypeOf(validateMessagePayload(JSON.parse('{"message":"hi","__proto__":"x"}')).errors))
      .toBe(Object.prototype)
  })
})
