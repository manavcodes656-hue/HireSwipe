import { describe, it, expect, vi } from 'vitest'
import { authorizeRoles } from './authorizeRoles.js'

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

describe('authorizeRoles', () => {
  it('returns 401 when req.user is missing', () => {
    const { res, statusCode } = makeRes()
    const next = vi.fn()
    authorizeRoles('company')({}, res, next)
    expect(statusCode.value).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 403 for unauthorized role', () => {
    const { res, statusCode, jsonBody } = makeRes()
    const next = vi.fn()
    authorizeRoles('company', 'admin')({ user: { id: '1', role: 'job_seeker' } }, res, next)
    expect(statusCode.value).toBe(403)
    expect(jsonBody.value?.error?.code).toBe('FORBIDDEN')
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next for allowed role', () => {
    const { res, statusCode } = makeRes()
    const next = vi.fn()
    authorizeRoles('company')({ user: { id: '1', role: 'company' } }, res, next)
    expect(statusCode.value).toBeNull()
    expect(next).toHaveBeenCalled()
  })
})
