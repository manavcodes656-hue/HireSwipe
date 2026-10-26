import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase-server.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from './supabase-server.js'
import { requireCompanyMember, resolveCompanyMembership } from './requireCompanyMember.js'

function mockMemberQuery(result) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq3 = vi.fn(() => ({ maybeSingle }))
  const eq2 = vi.fn(() => ({ eq: eq3 }))
  const eq1 = vi.fn(() => ({ eq: eq2 }))
  const select = vi.fn(() => ({ eq: eq1 }))
  supabase.from.mockReturnValueOnce({ select })
  return { select, maybeSingle }
}

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

describe('requireCompanyMember', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 without req.user', async () => {
    const { res, statusCode } = makeRes()
    const next = vi.fn()
    await requireCompanyMember()({}, res, next)
    expect(statusCode.value).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('allows admin without membership lookup', async () => {
    const { res } = makeRes()
    const next = vi.fn()
    await requireCompanyMember()(
      { user: { id: 'admin-1', role: 'admin' }, params: { companyId: 'co-1' } },
      res,
      next
    )
    expect(next).toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns 403 when membership is missing (cross-company isolation)', async () => {
    mockMemberQuery({ data: null, error: null })
    const { res, statusCode, jsonBody } = makeRes()
    const next = vi.fn()
    await requireCompanyMember()(
      { user: { id: 'u-1', role: 'company' }, params: { companyId: 'other-co' } },
      res,
      next
    )
    expect(statusCode.value).toBe(403)
    expect(jsonBody.value?.error?.code).toBe('FORBIDDEN')
    expect(next).not.toHaveBeenCalled()
  })

  it('attaches membership and calls next for active member', async () => {
    const membership = {
      id: 'm-1',
      company_id: 'co-1',
      profile_id: 'u-1',
      role: 'owner',
      is_active: true,
    }
    mockMemberQuery({ data: membership, error: null })
    const { res } = makeRes()
    const next = vi.fn()
    const req = { user: { id: 'u-1', role: 'company' }, params: { companyId: 'co-1' } }
    await requireCompanyMember('owner', 'admin')(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(req.companyMembership).toEqual(membership)
  })

  it('returns 403 when member role is insufficient', async () => {
    mockMemberQuery({
      data: {
        id: 'm-1',
        company_id: 'co-1',
        profile_id: 'u-1',
        role: 'recruiter',
        is_active: true,
      },
      error: null,
    })
    const { res, statusCode } = makeRes()
    const next = vi.fn()
    await requireCompanyMember('owner', 'admin')(
      { user: { id: 'u-1', role: 'company' }, params: { companyId: 'co-1' } },
      res,
      next
    )
    expect(statusCode.value).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })
})

describe('resolveCompanyMembership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null membership for invalid args without querying', async () => {
    const result = await resolveCompanyMembership(null, 'co-1')
    expect(result.membership).toBeNull()
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
