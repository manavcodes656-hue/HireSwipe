// Unit tests for database error mapping. Error shapes mirror what supabase-js
// returns from PostgREST; messages are the real ones from PostgreSQL or from
// HireSwipe's migrations (RAISE EXCEPTION).

import { describe, it, expect, vi, afterEach } from 'vitest'
import { mapDbError, sendDbError } from './db-errors.js'

const cases = [
  // [description, error, status, code, expected message (or matcher)]
  ['RLS denial on insert',
    { code: '42501', message: 'new row violates row-level security policy for table "companies"' },
    403, 'FORBIDDEN', 'You do not have permission to perform this action.'],
  ['missing grant',
    { code: '42501', message: 'permission denied for function check_application_eligibility' },
    403, 'FORBIDDEN', 'You do not have permission to perform this action.'],
  ['004 RAISE with 42501',
    { code: '42501', message: 'Only company accounts can create a company' },
    403, 'FORBIDDEN', 'Only company accounts can create a company'],
  ['unique violation',
    { code: '23505', message: 'duplicate key value violates unique constraint "company_members_company_id_profile_id_key"', details: 'Key (company_id, profile_id)=(a, b) already exists.' },
    409, 'CONFLICT', 'A record with these details already exists.'],
  ['foreign key violation',
    { code: '23503', message: 'insert or update on table "jobs" violates foreign key constraint "jobs_company_id_fkey"' },
    422, 'INVALID_REFERENCE', 'A referenced record does not exist.'],
  ['004 RAISE with 23503',
    { code: '23503', message: 'Job not found' },
    422, 'INVALID_REFERENCE', 'Job not found'],
  ['CHECK constraint',
    { code: '23514', message: 'new row for relation "companies" violates check constraint "companies_founded_year_check"', details: 'Failing row contains (...)' },
    422, 'RULE_VIOLATION', 'The request violates a data rule.'],
  ['004 last-owner rule',
    { code: '23514', message: 'A company must keep at least one active owner' },
    422, 'RULE_VIOLATION', 'A company must keep at least one active owner'],
  ['004 create_company_with_owner input check',
    { code: '22023', message: 'Company name is required' },
    422, 'RULE_VIOLATION', 'Company name is required'],
  ['003 hierarchy trigger (P0001, Unauthorized)',
    { code: 'P0001', message: 'Unauthorized: Only company owners and admins can manage team members' },
    403, 'FORBIDDEN', 'Unauthorized: Only company owners and admins can manage team members'],
  ['003 application trigger (P0001, rule)',
    { code: 'P0001', message: 'Cannot modify job_id of an existing application' },
    422, 'RULE_VIOLATION', 'Cannot modify job_id of an existing application'],
  ['not-null violation',
    { code: '23502', message: 'null value in column "name" of relation "companies" violates not-null constraint' },
    400, 'VALIDATION_ERROR', 'A required value is missing.'],
  ['invalid uuid text',
    { code: '22P02', message: 'invalid input syntax for type uuid: "abc"' },
    400, 'VALIDATION_ERROR', 'A value has an invalid format.'],
  ['value too long',
    { code: '22001', message: 'value too long for type character varying(10)' },
    400, 'VALIDATION_ERROR', 'A value is too long.'],
  ['no row for .single()',
    { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    404, 'NOT_FOUND', 'Resource not found.'],
  ['unknown column in request body',
    { code: 'PGRST204', message: "Could not find the 'constructor' column of 'companies' in the schema cache" },
    400, 'VALIDATION_ERROR', 'The request contains an unknown field.'],
  ['JWT expired at PostgREST',
    { code: 'PGRST301', message: 'JWT expired' },
    401, 'INVALID_TOKEN', 'Invalid or expired Supabase Auth token.'],
  ['policy recursion',
    { code: '42P17', message: 'infinite recursion detected in policy for relation "conversation_members"' },
    500, 'INTERNAL_ERROR', 'Internal server error'],
  ['function missing (migration not applied)',
    { code: 'PGRST202', message: 'Could not find the function public.create_company_with_owner(p_company) in the schema cache' },
    500, 'INTERNAL_ERROR', 'Internal server error'],
  ['network failure',
    { code: '', message: 'TypeError: fetch failed' },
    503, 'SERVICE_UNAVAILABLE', 'The database is temporarily unavailable.'],
  ['unknown error',
    { code: 'XX000', message: 'internal error' },
    500, 'INTERNAL_ERROR', 'Internal server error'],
  ['no error object',
    undefined,
    500, 'INTERNAL_ERROR', 'Internal server error'],
]

describe('mapDbError', () => {
  it.each(cases)('%s', (_name, error, status, code, message) => {
    expect(mapDbError(error)).toEqual({ status, code, message })
  })

  it('never exposes table, constraint or column names', () => {
    for (const [, error] of cases) {
      const { message } = mapDbError(error)
      expect(message).not.toMatch(/relation "|constraint "|column "|row-level security/)
    }
  })
})

describe('sendDbError', () => {
  afterEach(() => vi.restoreAllMocks())

  function makeRes() {
    const out = {}
    const res = {
      status: (s) => ((out.status = s), res),
      json: (b) => ((out.body = b), res),
    }
    return { res, out }
  }

  it('sends only code and message; logs code and message without details', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { res, out } = makeRes()
    const error = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "x"',
      details: 'Key (email)=(secret@example.com) already exists.',
      hint: 'h',
    }

    sendDbError(res, error, 'TEST')

    expect(out.status).toBe(409)
    expect(out.body).toEqual({ error: { code: 'CONFLICT', message: 'A record with these details already exists.' } })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('23505')
    expect(warn.mock.calls[0][0]).not.toContain('secret@example.com')
  })

  it('PGRST204: 400 without the column or table name; the log keeps them', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { res, out } = makeRes()
    const error = {
      code: 'PGRST204',
      message: "Could not find the 'constructor' column of 'companies' in the schema cache",
      details: null,
      hint: null,
    }

    sendDbError(res, error, 'TEST')

    expect(out.status).toBe(400)
    expect(out.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'The request contains an unknown field.' } })
    expect(JSON.stringify(out.body)).not.toMatch(/constructor|companies|schema/)
    expect(warn.mock.calls[0][0]).toContain('PGRST204')
  })

  it('other unknown PostgREST codes stay 500', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { res, out } = makeRes()

    sendDbError(res, { code: 'PGRST205', message: "Could not find the table 'public.x' in the schema cache" }, 'TEST')

    expect(out.status).toBe(500)
    expect(out.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  })

  it('logs 5xx as errors', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { res, out } = makeRes()

    sendDbError(res, { code: '42P17', message: 'infinite recursion detected in policy for relation "x"' }, 'TEST')

    expect(out.status).toBe(500)
    expect(out.body.error.message).toBe('Internal server error')
    expect(err).toHaveBeenCalledTimes(1)
  })
})
