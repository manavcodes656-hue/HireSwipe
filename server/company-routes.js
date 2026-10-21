// Company API, mounted at /api/company behind authenticateToken.
//
// Profiles:
//   GET   /api/company/profile             caller's active company membership + company
//   POST  /api/company/profile             create a company; caller becomes its owner
//   PATCH /api/company/:companyId/profile  update profile fields (company owner/admin)
//
// Jobs:
//   GET   /api/company/jobs                caller's company jobs
//   GET   /api/company/jobs/:jobId         single job details (authorized company only)
//   POST  /api/company/jobs                create a job under caller's company
//   PATCH /api/company/jobs/:jobId         update job fields
//   PATCH /api/company/jobs/:jobId/status  update job status (draft/published/paused/closed)
//
// Applications:
//   GET   /api/company/applications                 caller's company applications
//   GET   /api/company/applications/:applicationId  application details
//   PATCH /api/company/applications/:applicationId/status  update application status
//
// Interviews:
//   GET   /api/company/interviews                 caller's company interviews
//   GET   /api/company/interviews/:interviewId    interview details
//   POST  /api/company/interviews                 schedule an interview on an application
//   PATCH /api/company/interviews/:interviewId    update interview fields
//   PATCH /api/company/interviews/:interviewId/status  update interview status / cancel
//
// Messaging:
//   GET   /api/company/conversations                 the caller's company conversations
//   GET   /api/company/conversations/:conversationId  conversation with its messages
//   POST  /api/company/conversations/:conversationId/messages  send a message
//
// All database access goes through req.supabase (the caller's user-scoped
// client), so RLS policies and triggers apply. The service role is only used
// by requireCompanyMember to check the verified caller's membership.

import express from 'express'
import { authorizeRoles } from './authorizeRoles.js'
import { requireCompanyMember } from './requireCompanyMember.js'
import { sendDbError } from './db-errors.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^[0-9+()\-.\s]+$/

/** Profile columns of public.companies a client may set, with their rules. */
const PROFILE_FIELDS = {
  name: { type: 'text', max: 200, required: true },
  description: { type: 'text', max: 5000 },
  industry: { type: 'text', max: 100 },
  website: { type: 'url', max: 2048 },
  company_size: { type: 'text', max: 100 },
  founded_year: { type: 'year' },
  logo_url: { type: 'url', max: 2048 },
  email: { type: 'email', max: 320 },
  phone: { type: 'phone', max: 50 },
  location: { type: 'text', max: 200 },
  city: { type: 'text', max: 100 },
  state: { type: 'text', max: 100 },
  country: { type: 'text', max: 100 },
}

/** Onboarding progress, set by the owner after creation (PATCH only). */
const ONBOARDING_FIELDS = {
  onboarding_completed: { type: 'boolean' },
  completion_percentage: { type: 'percent' },
}

/** Server- or membership-controlled keys; named explicitly in error messages. */
const PROTECTED_FIELDS = new Set([
  'id', 'created_at', 'updated_at', 'owner', 'owner_id', 'created_by',
  'company_id', 'profile_id', 'role', 'member_role', 'is_active', 'members', 'membership',
])

function checkValue(rule, value) {
  if (rule.type === 'boolean') return typeof value === 'boolean' ? { value } : { error: 'must be true or false' }
  if (rule.type === 'percent') {
    return Number.isInteger(value) && value >= 0 && value <= 100
      ? { value }
      : { error: 'must be an integer from 0 to 100' }
  }
  if (value === null) return rule.required ? { error: 'is required' } : { value: null }
  if (rule.type === 'year') {
    const maxYear = new Date().getUTCFullYear()
    return Number.isInteger(value) && value > 1600 && value <= maxYear
      ? { value }
      : { error: `must be a year from 1601 to ${maxYear}` }
  }
  if (typeof value !== 'string') return { error: 'must be a string' }
  const text = value.trim()
  if (!text) return rule.required ? { error: 'is required' } : { value: null }
  if (text.length > rule.max) return { error: `must be at most ${rule.max} characters` }
  if (rule.type === 'email' && !EMAIL.test(text)) return { error: 'must be a valid email address' }
  if (rule.type === 'phone' && !PHONE.test(text)) return { error: 'must contain only digits, spaces and + ( ) - .' }
  if (rule.type === 'url') {
    let url
    try {
      url = new URL(text)
    } catch {
      return { error: 'must be a valid URL' }
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'must be an http(s) URL' }
  }
  return { value: text }
}

/**
 * Validate a company profile body against an allowlist (no mass assignment).
 * mode 'create': profile fields, name required. mode 'update': profile and
 * onboarding fields, at least one, all optional.
 * @returns {{ values: object } | { errors: Record<string, string> }}
 */
export function validateCompanyProfile(body, mode) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: { body: 'must be a JSON object' } }
  }
  const rules = mode === 'update' ? { ...PROFILE_FIELDS, ...ONBOARDING_FIELDS } : PROFILE_FIELDS
  const errors = Object.create(null)
  const values = {}

  for (const [key, value] of Object.entries(body)) {
    const rule = Object.hasOwn(rules, key) ? rules[key] : undefined
    if (!rule) {
      errors[key] = PROTECTED_FIELDS.has(key) ? 'is managed by the server and cannot be set' : 'is not an allowed field'
      continue
    }
    const checked = checkValue(rule, value)
    if (checked.error) errors[key] = checked.error
    else values[key] = checked.value
  }

  if (mode === 'create' && !Object.hasOwn(body, 'name')) errors.name = 'is required'
  if (mode === 'update' && Object.keys(body).length === 0) errors.body = 'must contain at least one field'

  return Object.keys(errors).length ? { errors: { ...errors } } : { values }
}

// ── Job Validation Rules & Schema ──────────────────────────────────────────

const EMPLOYMENT_TYPES = new Set(['full_time', 'part_time', 'contract', 'internship', 'freelance'])
const REMOTE_TYPES = new Set(['on_site', 'hybrid', 'remote'])
const JOB_STATUSES = new Set(['draft', 'published', 'paused', 'closed'])

const JOB_FIELDS = {
  title: { type: 'text', max: 200, required: true },
  description: { type: 'text', max: 20000, required: true },
  employment_type: { type: 'enum', values: EMPLOYMENT_TYPES, required: true },
  experience_level: { type: 'text', max: 100 },
  experience_min: { type: 'integer', min: 0 },
  experience_max: { type: 'integer', min: 0 },
  salary_min: { type: 'numeric', min: 0 },
  salary_max: { type: 'numeric', min: 0 },
  salary_currency: { type: 'text', max: 10 },
  location: { type: 'text', max: 200 },
  city: { type: 'text', max: 100 },
  state: { type: 'text', max: 100 },
  country: { type: 'text', max: 100 },
  remote_type: { type: 'enum', values: REMOTE_TYPES },
  status: { type: 'enum', values: JOB_STATUSES },
  openings: { type: 'integer', min: 1 },
  application_deadline: { type: 'iso_date' },
  requirements: { type: 'array' },
  benefits: { type: 'array' },
  skills: { type: 'array' },
}

const PROTECTED_JOB_FIELDS = new Set([
  'id', 'company_id', 'created_by', 'created_at', 'updated_at',
])

function checkJobValue(rule, value) {
  if (value === null) return rule.required ? { error: 'is required' } : { value: null }
  if (rule.type === 'integer') {
    const num = Number(value)
    return Number.isInteger(num) && num >= (rule.min ?? 0)
      ? { value: num }
      : { error: `must be an integer >= ${rule.min ?? 0}` }
  }
  if (rule.type === 'numeric') {
    const num = Number(value)
    return !isNaN(num) && num >= (rule.min ?? 0)
      ? { value: num }
      : { error: `must be a number >= ${rule.min ?? 0}` }
  }
  if (rule.type === 'enum') {
    let normalized = value
    if (rule.values === JOB_STATUSES && normalized === 'active') normalized = 'published'
    return rule.values.has(normalized)
      ? { value: normalized }
      : { error: `must be one of: ${[...rule.values].join(', ')}` }
  }
  if (rule.type === 'iso_date') {
    if (typeof value !== 'string') return { error: 'must be a valid date' }
    const date = new Date(value)
    return !isNaN(date.getTime()) ? { value: date.toISOString() } : { error: 'must be a valid date' }
  }
  if (rule.type === 'array') {
    return Array.isArray(value) ? { value } : { error: 'must be an array' }
  }
  if (typeof value !== 'string') return { error: 'must be a string' }
  const text = value.trim()
  if (!text) return rule.required ? { error: 'is required' } : { value: null }
  if (rule.max && text.length > rule.max) return { error: `must be at most ${rule.max} characters` }
  return { value: text }
}

export function validateJobPayload(body, mode) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: { body: 'must be a JSON object' } }
  }
  const errors = Object.create(null)
  const values = {}

  for (const [key, value] of Object.entries(body)) {
    const rule = Object.hasOwn(JOB_FIELDS, key) ? JOB_FIELDS[key] : undefined
    if (!rule) {
      errors[key] = PROTECTED_JOB_FIELDS.has(key)
        ? 'is managed by the server and cannot be set'
        : 'is not an allowed field'
      continue
    }
    const checked = checkJobValue(rule, value)
    if (checked.error) errors[key] = checked.error
    else values[key] = checked.value
  }

  if (mode === 'create') {
    if (!Object.hasOwn(body, 'title')) errors.title = 'is required'
    if (!Object.hasOwn(body, 'description')) errors.description = 'is required'
    if (!Object.hasOwn(body, 'employment_type')) errors.employment_type = 'is required'
  }

  if (mode === 'update' && Object.keys(body).length === 0) {
    errors.body = 'must contain at least one field'
  }

  if (
    values.experience_min !== undefined &&
    values.experience_max !== undefined &&
    values.experience_max < values.experience_min
  ) {
    errors.experience_max = 'cannot be less than experience_min'
  }

  if (
    values.salary_min !== undefined &&
    values.salary_max !== undefined &&
    values.salary_max < values.salary_min
  ) {
    errors.salary_max = 'cannot be less than salary_min'
  }

  return Object.keys(errors).length ? { errors: { ...errors } } : { values }
}

function sendValidationError(res, errors) {
  return res.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', fields: errors },
  })
}

// ── Interview Validation Rules & Schema ─────────────────────────────────────

/** public.interview_status enum (001_initial_hireswipe_schema.sql). */
const INTERVIEW_STATUSES = new Set(['scheduled', 'completed', 'cancelled', 'rescheduled'])

/**
 * Allowed interview status changes.
 * `completed` and `cancelled` are terminal: a finished or cancelled round is
 * never reopened. `rescheduled` may return to `scheduled` once the new slot
 * is stored.
 */
const INTERVIEW_STATUS_TRANSITIONS = {
  scheduled: new Set(['scheduled', 'completed', 'cancelled', 'rescheduled']),
  rescheduled: new Set(['rescheduled', 'scheduled', 'completed', 'cancelled']),
  completed: new Set(['completed']),
  cancelled: new Set(['cancelled']),
}

/**
 * public.interviews columns a client may set, with their rules.
 * The table has no company column: ownership is derived from the application
 * the interview belongs to (see the interview routes below).
 */
const INTERVIEW_FIELDS = {
  application_id: { type: 'uuid', required: true },
  title: { type: 'text', max: 200, required: true },
  description: { type: 'text', max: 5000 },
  scheduled_at: { type: 'timestamp', required: true },
  duration_minutes: { type: 'integer', min: 1, max: 1440 },
  meeting_url: { type: 'url', max: 2048 },
  location: { type: 'text', max: 200 },
  status: { type: 'enum', values: INTERVIEW_STATUSES },
}

/** Server-controlled or immutable interview columns. */
const PROTECTED_INTERVIEW_FIELDS = new Set([
  'id', 'application_id', 'scheduled_by', 'company_id', 'created_at', 'updated_at',
])

function checkInterviewValue(rule, value) {
  if (value === null) return rule.required ? { error: 'is required' } : { value: null }
  if (rule.type === 'uuid') {
    if (typeof value !== 'string') return { error: 'must be a UUID' }
    const text = value.trim()
    return UUID.test(text) ? { value: text } : { error: 'must be a UUID' }
  }
  if (rule.type === 'integer') {
    const num = Number(value)
    return Number.isInteger(num) && num >= rule.min && num <= rule.max
      ? { value: num }
      : { error: `must be an integer from ${rule.min} to ${rule.max}` }
  }
  if (rule.type === 'enum') {
    return rule.values.has(value)
      ? { value }
      : { error: `must be one of: ${[...rule.values].join(', ')}` }
  }
  if (rule.type === 'timestamp') {
    if (typeof value !== 'string') return { error: 'must be a valid date and time' }
    const text = value.trim()
    if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(text)) {
      return { error: 'must be an ISO 8601 date and time' }
    }
    const date = new Date(text)
    return !isNaN(date.getTime())
      ? { value: date.toISOString() }
      : { error: 'must be a valid date and time' }
  }
  if (rule.type === 'url') {
    if (typeof value !== 'string') return { error: 'must be a string' }
    const text = value.trim()
    if (!text) return { value: null }
    let url
    try {
      url = new URL(text)
    } catch {
      return { error: 'must be a valid URL' }
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'must be an http(s) URL' }
    return { value: text }
  }
  if (typeof value !== 'string') return { error: 'must be a string' }
  const text = value.trim()
  if (!text) return rule.required ? { error: 'is required' } : { value: null }
  if (rule.max && text.length > rule.max) return { error: `must be at most ${rule.max} characters` }
  return { value: text }
}

/**
 * Validate an interview body against an allowlist (no mass assignment).
 * mode 'create': application_id, title and scheduled_at are required.
 * mode 'update': mutable fields only, at least one.
 * @returns {{ values: object } | { errors: Record<string, string> }}
 */
export function validateInterviewPayload(body, mode) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: { body: 'must be a JSON object' } }
  }
  const rules = { ...INTERVIEW_FIELDS }
  // An interview always belongs to the application it was created for.
  if (mode !== 'create') delete rules.application_id

  const errors = Object.create(null)
  const values = {}

  for (const [key, value] of Object.entries(body)) {
    const rule = Object.hasOwn(rules, key) ? rules[key] : undefined
    if (!rule) {
      errors[key] = PROTECTED_INTERVIEW_FIELDS.has(key)
        ? 'is managed by the server and cannot be set'
        : 'is not an allowed field'
      continue
    }
    const checked = checkInterviewValue(rule, value)
    if (checked.error) errors[key] = checked.error
    else values[key] = checked.value
  }

  if (mode === 'create') {
    if (!Object.hasOwn(body, 'application_id')) errors.application_id = 'is required'
    if (!Object.hasOwn(body, 'title')) errors.title = 'is required'
    if (!Object.hasOwn(body, 'scheduled_at')) errors.scheduled_at = 'is required'
  }
  if (mode === 'update' && Object.keys(body).length === 0) {
    errors.body = 'must contain at least one field'
  }

  return Object.keys(errors).length ? { errors: { ...errors } } : { values }
}

/** True when an interview may move from `current` to `next`. */
export function canTransitionInterview(current, next) {
  const allowed = INTERVIEW_STATUS_TRANSITIONS[current]
  return Boolean(allowed && allowed.has(next))
}

// ── Message Validation Rules & Schema ───────────────────────────────────────

/**
 * public.message_type enum (001_initial_hireswipe_schema.sql). The 'system'
 * value is reserved for server-generated messages, so a client may only write
 * 'text' or 'file'.
 */
const CLIENT_MESSAGE_TYPES = new Set(['text', 'file'])

/** public.messages columns a client may set, with their rules. */
const MESSAGE_FIELDS = {
  message: { type: 'text', max: 5000, required: true },
  message_type: { type: 'enum', values: CLIENT_MESSAGE_TYPES },
}

/**
 * Server-controlled or immutable message columns. `sender_id` is always the
 * verified caller and `is_read` is not writable (the table has no UPDATE
 * policy, see the messaging routes below).
 */
const PROTECTED_MESSAGE_FIELDS = new Set([
  'id', 'conversation_id', 'sender_id', 'is_read', 'created_at',
])

/**
 * Validate a message body against an allowlist (no mass assignment).
 * @returns {{ values: object } | { errors: Record<string, string> }}
 */
export function validateMessagePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: { body: 'must be a JSON object' } }
  }
  const errors = Object.create(null)
  const values = {}

  for (const [key, value] of Object.entries(body)) {
    const rule = Object.hasOwn(MESSAGE_FIELDS, key) ? MESSAGE_FIELDS[key] : undefined
    if (!rule) {
      errors[key] = PROTECTED_MESSAGE_FIELDS.has(key)
        ? 'is managed by the server and cannot be set'
        : 'is not an allowed field'
      continue
    }

    if (value === null) {
      if (rule.required) errors[key] = 'is required'
      continue
    }

    if (rule.type === 'enum') {
      if (!rule.values.has(value)) {
        errors[key] = `must be one of: ${[...rule.values].join(', ')}`
      } else {
        values[key] = value
      }
      continue
    }

    if (typeof value !== 'string') {
      errors[key] = 'must be a string'
      continue
    }

    const text = value.trim()
    if (!text) {
      if (rule.required) errors[key] = 'is required'
      continue
    }
    if (text.length > rule.max) {
      errors[key] = `must be at most ${rule.max} characters`
      continue
    }
    values[key] = text
  }

  if (!Object.hasOwn(body, 'message')) errors.message = 'is required'

  return Object.keys(errors).length ? { errors: { ...errors } } : { values }
}

function sendCompanyExists(res) {
  return res.status(409).json({
    error: { code: 'COMPANY_EXISTS', message: 'This account already belongs to a company' },
  })
}

/** The caller's active membership (optionally in one company) with its company row. */
function loadMembership(req, companyId) {
  let query = req.supabase
    .from('company_members')
    .select('id, role, company_id, companies(*)')
    .eq('profile_id', req.user.id)
    .eq('is_active', true)
  if (companyId) query = query.eq('company_id', companyId)
  return query.order('created_at', { ascending: true }).limit(1).maybeSingle()
}

function membershipBody(row) {
  return row ? { id: row.id, role: row.role, company_id: row.company_id, company: row.companies ?? null } : null
}

/**
 * Resolve the caller's active company membership for a company-scoped route.
 * A platform admin may pass through without a membership (same rule the
 * profile, job and application routes apply).
 * @returns {{ denied: boolean, membership: object | null }}
 */
async function resolveCompanyScope(req, res, context) {
  const { data: membership, error } = await loadMembership(req)
  if (error) {
    sendDbError(res, error, context)
    return { denied: true, membership: null }
  }
  if (!membership && req.user.role !== 'admin') {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'No active company membership found' },
    })
    return { denied: true, membership: null }
  }
  return { denied: false, membership }
}

function requireCompanyIdParam(req, res, next) {
  if (!UUID.test(req.params.companyId)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'companyId must be a UUID' } })
  }
  next()
}

function requireJobIdParam(req, res, next) {
  if (!UUID.test(req.params.jobId)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'jobId must be a UUID' } })
  }
  next()
}

function requireApplicationIdParam(req, res, next) {
  if (!UUID.test(req.params.applicationId)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'applicationId must be a UUID' } })
  }
  next()
}

function requireInterviewIdParam(req, res, next) {
  if (!UUID.test(req.params.interviewId)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'interviewId must be a UUID' } })
  }
  next()
}

function requireConversationIdParam(req, res, next) {
  if (!UUID.test(req.params.conversationId)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'conversationId must be a UUID' } })
  }
  next()
}

const ALL_APPLICATION_STATUSES = new Set([
  'pending',
  'reviewing',
  'shortlisted',
  'interview',
  'rejected',
  'accepted',
  'withdrawn',
])

const COMPANY_APPLICATION_STATUSES = new Set([
  'pending',
  'reviewing',
  'shortlisted',
  'interview',
  'rejected',
  'accepted',
])

export const companyRouter = express.Router()

// ── Company Profile Routes ─────────────────────────────────────────────────

companyRouter.get('/profile', authorizeRoles('company', 'admin'), async (req, res) => {
  const { data, error } = await loadMembership(req)
  if (error) return sendDbError(res, error, 'GET /api/company/profile')

  res.status(200).json({
    status: 'ok',
    userRole: req.user.role,
    membership: membershipBody(data),
    message: data
      ? 'Company profile accessed'
      : 'Authenticated company user has no active company membership',
  })
})

companyRouter.post('/profile', authorizeRoles('company'), async (req, res) => {
  const checked = validateCompanyProfile(req.body, 'create')
  if (checked.errors) return sendValidationError(res, checked.errors)

  const existing = await loadMembership(req)
  if (existing.error) return sendDbError(res, existing.error, 'POST /api/company/profile (membership check)')
  if (existing.data) return sendCompanyExists(res)

  const { data: companyId, error } = await req.supabase.rpc('create_company_with_owner', {
    p_company: checked.values,
  })
  if (error?.code === '23505') return sendCompanyExists(res)
  if (error) return sendDbError(res, error, 'POST /api/company/profile')

  const created = await loadMembership(req, companyId)
  if (created.error) return sendDbError(res, created.error, 'POST /api/company/profile (reload)')

  res.status(201).json({ status: 'ok', membership: membershipBody(created.data) })
})

companyRouter.patch(
  '/:companyId/profile',
  authorizeRoles('company', 'admin'),
  requireCompanyIdParam,
  requireCompanyMember('owner', 'admin'),
  async (req, res) => {
    const checked = validateCompanyProfile(req.body, 'update')
    if (checked.errors) return sendValidationError(res, checked.errors)

    const { data, error } = await req.supabase
      .from('companies')
      .update(checked.values)
      .eq('id', req.params.companyId)
      .select('*')
      .maybeSingle()
    if (error) return sendDbError(res, error, 'PATCH /api/company/:companyId/profile')
    if (!data) {
      return res.status(404).json({ error: { code: 'COMPANY_NOT_FOUND', message: 'Company not found' } })
    }

    res.status(200).json({ status: 'ok', company: data })
  },
)

// ── Company Jobs Routes ────────────────────────────────────────────────────

/**
 * List all jobs belonging to the caller's active company.
 */
companyRouter.get('/jobs', authorizeRoles('company', 'admin'), async (req, res) => {
  const { data: membership, error: memErr } = await loadMembership(req)
  if (memErr) return sendDbError(res, memErr, 'GET /api/company/jobs (membership check)')
  if (!membership) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'No active company membership found for authenticated user' },
    })
  }

  const { data, error } = await req.supabase
    .from('jobs')
    .select('*, job_skills(*, skills(name)), job_requirements(*), job_benefits(*)')
    .eq('company_id', membership.company_id)
    .order('created_at', { ascending: false })

  if (error) return sendDbError(res, error, 'GET /api/company/jobs')

  res.status(200).json({ status: 'ok', jobs: data ?? [] })
})

/**
 * Retrieve single job details if caller is authorized for this company.
 */
companyRouter.get('/jobs/:jobId', authorizeRoles('company', 'admin'), requireJobIdParam, async (req, res) => {
  const { data: membership, error: memErr } = await loadMembership(req)
  if (memErr) return sendDbError(res, memErr, 'GET /api/company/jobs/:jobId (membership check)')
  if (!membership && req.user.role !== 'admin') {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'No active company membership found' },
    })
  }

  const { data, error } = await req.supabase
    .from('jobs')
    .select('*, companies(name, logo_url, industry, location), job_skills(*, skills(name)), job_requirements(*), job_benefits(*)')
    .eq('id', req.params.jobId)
    .maybeSingle()

  if (error) return sendDbError(res, error, 'GET /api/company/jobs/:jobId')
  if (!data) {
    return res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } })
  }

  // Cross-company access prevention:
  if (req.user.role !== 'admin' && data.company_id !== membership.company_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Job does not belong to your company' } })
  }

  res.status(200).json({ status: 'ok', job: data })
})

/**
 * Create a new job under the caller's active company.
 */
companyRouter.post('/jobs', authorizeRoles('company', 'admin'), async (req, res) => {
  const checked = validateJobPayload(req.body, 'create')
  if (checked.errors) return sendValidationError(res, checked.errors)

  const { data: membership, error: memErr } = await loadMembership(req)
  if (memErr) return sendDbError(res, memErr, 'POST /api/company/jobs (membership check)')
  if (!membership) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Must be an active company member to post jobs' },
    })
  }

  const { requirements, benefits, skills, ...jobValues } = checked.values
  const jobPayload = {
    ...jobValues,
    company_id: membership.company_id,
    created_by: req.user.id,
  }

  const { data: job, error } = await req.supabase
    .from('jobs')
    .insert(jobPayload)
    .select()
    .single()

  if (error) return sendDbError(res, error, 'POST /api/company/jobs')

  // Insert requirements if provided
  if (Array.isArray(requirements) && requirements.length > 0) {
    const reqRows = requirements
      .map((r) => ({
        job_id: job.id,
        requirement: typeof r === 'string' ? r.trim() : (r.requirement || r.requirement_text || '').trim(),
        is_required: true,
      }))
      .filter((r) => r.requirement.length > 0)

    if (reqRows.length > 0) {
      await req.supabase.from('job_requirements').insert(reqRows)
    }
  }

  // Insert benefits if provided
  if (Array.isArray(benefits) && benefits.length > 0) {
    const benRows = benefits
      .map((b) => ({
        job_id: job.id,
        benefit: typeof b === 'string' ? b.trim() : (b.benefit || b.benefit_text || '').trim(),
      }))
      .filter((b) => b.benefit.length > 0)

    if (benRows.length > 0) {
      await req.supabase.from('job_benefits').insert(benRows)
    }
  }

  const { data: fullJob } = await req.supabase
    .from('jobs')
    .select('*, job_skills(*, skills(name)), job_requirements(*), job_benefits(*)')
    .eq('id', job.id)
    .single()

  res.status(201).json({ status: 'ok', job: fullJob ?? job })
})

/**
 * Update job fields (requires active company member on the job's company).
 */
companyRouter.patch('/jobs/:jobId', authorizeRoles('company', 'admin'), requireJobIdParam, async (req, res) => {
  const checked = validateJobPayload(req.body, 'update')
  if (checked.errors) return sendValidationError(res, checked.errors)

  const { data: membership, error: memErr } = await loadMembership(req)
  if (memErr) return sendDbError(res, memErr, 'PATCH /api/company/jobs/:jobId (membership check)')
  if (!membership && req.user.role !== 'admin') {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No active company membership found' } })
  }

  // Verify ownership before updating
  const { data: existingJob, error: findErr } = await req.supabase
    .from('jobs')
    .select('id, company_id')
    .eq('id', req.params.jobId)
    .maybeSingle()

  if (findErr) return sendDbError(res, findErr, 'PATCH /api/company/jobs/:jobId (find)')
  if (!existingJob) {
    return res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } })
  }
  if (req.user.role !== 'admin' && existingJob.company_id !== membership.company_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Job does not belong to your company' } })
  }

  const { requirements, benefits, skills, ...jobValues } = checked.values

  let updatedJob = null
  if (Object.keys(jobValues).length > 0) {
    const { data, error } = await req.supabase
      .from('jobs')
      .update(jobValues)
      .eq('id', req.params.jobId)
      .select('*')
      .maybeSingle()
    if (error) return sendDbError(res, error, 'PATCH /api/company/jobs/:jobId')
    updatedJob = data
  }

  // Update requirements if provided
  if (Array.isArray(requirements)) {
    await req.supabase.from('job_requirements').delete().eq('job_id', req.params.jobId)
    const reqRows = requirements
      .map((r) => ({
        job_id: req.params.jobId,
        requirement: typeof r === 'string' ? r.trim() : (r.requirement || r.requirement_text || '').trim(),
        is_required: true,
      }))
      .filter((r) => r.requirement.length > 0)
    if (reqRows.length > 0) {
      await req.supabase.from('job_requirements').insert(reqRows)
    }
  }

  // Update benefits if provided
  if (Array.isArray(benefits)) {
    await req.supabase.from('job_benefits').delete().eq('job_id', req.params.jobId)
    const benRows = benefits
      .map((b) => ({
        job_id: req.params.jobId,
        benefit: typeof b === 'string' ? b.trim() : (b.benefit || b.benefit_text || '').trim(),
      }))
      .filter((b) => b.benefit.length > 0)
    if (benRows.length > 0) {
      await req.supabase.from('job_benefits').insert(benRows)
    }
  }

  const { data: fullJob } = await req.supabase
    .from('jobs')
    .select('*, job_skills(*, skills(name)), job_requirements(*), job_benefits(*)')
    .eq('id', req.params.jobId)
    .single()

  res.status(200).json({ status: 'ok', job: fullJob ?? updatedJob })
})

/**
 * Update job status (draft, published, paused, closed).
 */
companyRouter.patch('/jobs/:jobId/status', authorizeRoles('company', 'admin'), requireJobIdParam, async (req, res) => {
  let status = req.body?.status
  if (status === 'active') status = 'published'

  if (!status || !JOB_STATUSES.has(status)) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: `status must be one of: ${[...JOB_STATUSES].join(', ')}` },
    })
  }

  const { data: membership, error: memErr } = await loadMembership(req)
  if (memErr) return sendDbError(res, memErr, 'PATCH /api/company/jobs/:jobId/status (membership check)')
  if (!membership && req.user.role !== 'admin') {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No active company membership found' } })
  }

  // Verify ownership
  const { data: existingJob, error: findErr } = await req.supabase
    .from('jobs')
    .select('id, company_id')
    .eq('id', req.params.jobId)
    .maybeSingle()

  if (findErr) return sendDbError(res, findErr, 'PATCH /api/company/jobs/:jobId/status (find)')
  if (!existingJob) {
    return res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } })
  }
  if (req.user.role !== 'admin' && existingJob.company_id !== membership.company_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Job does not belong to your company' } })
  }

  const { data, error } = await req.supabase
    .from('jobs')
    .update({ status })
    .eq('id', req.params.jobId)
    .select('*')
    .maybeSingle()

  if (error) return sendDbError(res, error, 'PATCH /api/company/jobs/:jobId/status')

  res.status(200).json({ status: 'ok', job: data })
})

// ── Company Applications Routes ─────────────────────────────────────────────

/**
 * List applications for the caller's company, optionally filtered by jobId or status.
 */
companyRouter.get('/applications', authorizeRoles('company', 'admin'), async (req, res) => {
  const { data: membership, error: memErr } = await loadMembership(req)
  if (memErr) return sendDbError(res, memErr, 'GET /api/company/applications (membership check)')
  if (!membership) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'No active company membership found for authenticated user' },
    })
  }

  const { jobId, status } = req.query

  // Validate jobId if provided
  if (jobId) {
    if (!UUID.test(jobId)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'jobId must be a UUID' } })
    }
    // Verify job belongs to this company
    const { data: job, error: jobErr } = await req.supabase
      .from('jobs')
      .select('id, company_id')
      .eq('id', jobId)
      .maybeSingle()

    if (jobErr) return sendDbError(res, jobErr, 'GET /api/company/applications (job check)')
    if (!job) {
      return res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } })
    }
    if (req.user.role !== 'admin' && job.company_id !== membership.company_id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Job does not belong to your company' } })
    }
  }

  // Validate status if provided
  if (status && !ALL_APPLICATION_STATUSES.has(status)) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: `status must be one of: ${[...ALL_APPLICATION_STATUSES].join(', ')}` },
    })
  }

  let query = req.supabase
    .from('applications')
    .select('*, jobs(id, title, location, employment_type), job_seeker_profiles(id, profile_id, headline, bio, location, experience_years, profiles(id, full_name, avatar_url, email, phone)), resumes(id, file_name, file_path, file_size, mime_type), application_status_history(id, old_status, new_status, note, created_at)')
    .eq('company_id', membership.company_id)
    .order('applied_at', { ascending: false })

  if (jobId) {
    query = query.eq('job_id', jobId)
  }
  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) return sendDbError(res, error, 'GET /api/company/applications')

  res.status(200).json({ status: 'ok', applications: data ?? [] })
})

/**
 * Retrieve single application details with candidate and resume information.
 */
companyRouter.get('/applications/:applicationId', authorizeRoles('company', 'admin'), requireApplicationIdParam, async (req, res) => {
  const { data: membership, error: memErr } = await loadMembership(req)
  if (memErr) return sendDbError(res, memErr, 'GET /api/company/applications/:applicationId (membership check)')
  if (!membership && req.user.role !== 'admin') {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No active company membership found' } })
  }

  const { data, error } = await req.supabase
    .from('applications')
    .select('*, jobs(id, title, location, employment_type), job_seeker_profiles(id, profile_id, headline, bio, location, experience_years, profiles(id, full_name, avatar_url, email, phone)), resumes(id, file_name, file_path, file_size, mime_type), application_status_history(id, old_status, new_status, note, created_at)')
    .eq('id', req.params.applicationId)
    .maybeSingle()

  if (error) return sendDbError(res, error, 'GET /api/company/applications/:applicationId')
  if (!data) {
    return res.status(404).json({ error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found' } })
  }

  // Cross-company access check
  if (req.user.role !== 'admin' && data.company_id !== membership.company_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Application does not belong to your company' } })
  }

  res.status(200).json({ status: 'ok', application: data })
})

/**
 * Update application status and record review note.
 */
companyRouter.patch('/applications/:applicationId/status', authorizeRoles('company', 'admin'), requireApplicationIdParam, async (req, res) => {
  const status = req.body?.status
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : (typeof req.body?.notes === 'string' ? req.body.notes.trim() : null)

  if (note && note.length > 2000) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'note must be at most 2000 characters' } })
  }

  if (status === 'withdrawn') {
    return res.status(400).json({
      error: { code: 'INVALID_STATUS', message: 'Only candidates can withdraw applications' },
    })
  }

  if (!status || !COMPANY_APPLICATION_STATUSES.has(status)) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: `status must be one of: ${[...COMPANY_APPLICATION_STATUSES].join(', ')}` },
    })
  }

  const { data: membership, error: memErr } = await loadMembership(req)
  if (memErr) return sendDbError(res, memErr, 'PATCH /api/company/applications/:applicationId/status (membership check)')
  if (!membership && req.user.role !== 'admin') {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No active company membership found' } })
  }

  // Verify ownership
  const { data: existingApp, error: findErr } = await req.supabase
    .from('applications')
    .select('id, company_id, status')
    .eq('id', req.params.applicationId)
    .maybeSingle()

  if (findErr) return sendDbError(res, findErr, 'PATCH /api/company/applications/:applicationId/status (find)')
  if (!existingApp) {
    return res.status(404).json({ error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found' } })
  }
  if (req.user.role !== 'admin' && existingApp.company_id !== membership.company_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Application does not belong to your company' } })
  }

  if (existingApp.status === 'withdrawn') {
    return res.status(400).json({
      error: { code: 'INVALID_TRANSITION', message: 'Cannot update status of a withdrawn application' },
    })
  }

  const { error: updateErr } = await req.supabase
    .from('applications')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.applicationId)

  if (updateErr) return sendDbError(res, updateErr, 'PATCH /api/company/applications/:applicationId/status')

  // If note provided, attach note to latest application_status_history row
  if (note) {
    const { data: latestHist } = await req.supabase
      .from('application_status_history')
      .select('id')
      .eq('application_id', req.params.applicationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestHist) {
      await req.supabase
        .from('application_status_history')
        .update({ note })
        .eq('id', latestHist.id)
    }
  }

  const { data: fullApp } = await req.supabase
    .from('applications')
    .select('*, jobs(id, title, location, employment_type), job_seeker_profiles(id, profile_id, headline, bio, location, experience_years, profiles(id, full_name, avatar_url, email, phone)), resumes(id, file_name, file_path, file_size, mime_type), application_status_history(id, old_status, new_status, note, created_at)')
    .eq('id', req.params.applicationId)
    .single()

  res.status(200).json({ status: 'ok', application: fullApp })
})

// ── Company Interviews Routes ───────────────────────────────────────────────

/**
 * public.interviews has no company column: an interview belongs to an
 * application, and the application carries the company. Every interview query
 * therefore reaches the company through the `applications` embed.
 *
 * `profiles(full_name, avatar_url)` resolves the interviewer (scheduled_by).
 */
const INTERVIEW_SELECT =
  '*, profiles(full_name, avatar_url), applications!inner(id, job_id, job_seeker_id, company_id, status, ' +
  'jobs(id, title, location, employment_type), ' +
  'job_seeker_profiles(id, profile_id, headline, location, experience_years, ' +
  'profiles(id, full_name, avatar_url, email, phone)))'

/** Columns needed to decide ownership and status transitions. */
const INTERVIEW_OWNERSHIP_SELECT =
  'id, application_id, status, applications!inner(id, company_id, job_id, status)'

/**
 * Load one interview together with the application it belongs to.
 * The lookup is not filtered by company: the caller checks ownership itself
 * (same rule the application routes follow), and RLS still hides rows the
 * caller may not see.
 */
async function loadInterviewRecord(req, interviewId) {
  return req.supabase
    .from('interviews')
    .select(INTERVIEW_OWNERSHIP_SELECT)
    .eq('id', interviewId)
    .maybeSingle()
}

/**
 * True when the caller may act on an interview that belongs to `companyId`.
 * Platform admins may act on any interview (public.is_admin() in the RLS
 * policies allows it too).
 */
function mayActOnInterview(req, membership, companyId) {
  if (req.user.role === 'admin') return true
  return Boolean(membership) && companyId === membership.company_id
}

/**
 * List the interviews of the caller's company.
 * Optional filters: applicationId, jobId and the interview status.
 */
companyRouter.get('/interviews', authorizeRoles('company', 'admin'), async (req, res) => {
  const { data: membership, error: memErr } = await loadMembership(req)
  if (memErr) return sendDbError(res, memErr, 'GET /api/company/interviews (membership check)')
  if (!membership) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'No active company membership found for authenticated user' },
    })
  }

  const { applicationId, jobId, status } = req.query

  if (applicationId && !UUID.test(applicationId)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'applicationId must be a UUID' } })
  }
  if (jobId && !UUID.test(jobId)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'jobId must be a UUID' } })
  }
  if (status && !INTERVIEW_STATUSES.has(status)) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: `status must be one of: ${[...INTERVIEW_STATUSES].join(', ')}` },
    })
  }

  // A filtered list may only reach records of the caller's own company.
  if (applicationId) {
    const { data: application, error: appErr } = await req.supabase
      .from('applications')
      .select('id, company_id')
      .eq('id', applicationId)
      .maybeSingle()

    if (appErr) return sendDbError(res, appErr, 'GET /api/company/interviews (application check)')
    if (!application) {
      return res.status(404).json({ error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found' } })
    }
    if (application.company_id !== membership.company_id) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Application does not belong to your company' },
      })
    }
  }

  if (jobId) {
    const { data: job, error: jobErr } = await req.supabase
      .from('jobs')
      .select('id, company_id')
      .eq('id', jobId)
      .maybeSingle()

    if (jobErr) return sendDbError(res, jobErr, 'GET /api/company/interviews (job check)')
    if (!job) {
      return res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } })
    }
    if (job.company_id !== membership.company_id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Job does not belong to your company' } })
    }
  }

  let query = req.supabase
    .from('interviews')
    .select(INTERVIEW_SELECT)
    .eq('applications.company_id', membership.company_id)
    .order('scheduled_at', { ascending: true })

  if (applicationId) query = query.eq('application_id', applicationId)
  if (jobId) query = query.eq('applications.job_id', jobId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return sendDbError(res, error, 'GET /api/company/interviews')

  res.status(200).json({ status: 'ok', interviews: data ?? [] })
})

/**
 * Retrieve one interview with its application, candidate and job details.
 */
companyRouter.get('/interviews/:interviewId', authorizeRoles('company', 'admin'), requireInterviewIdParam, async (req, res) => {
  const scope = await resolveCompanyScope(req, res, 'GET /api/company/interviews/:interviewId (membership check)')
  if (scope.denied) return

  const { data, error } = await req.supabase
    .from('interviews')
    .select(INTERVIEW_SELECT)
    .eq('id', req.params.interviewId)
    .maybeSingle()

  if (error) return sendDbError(res, error, 'GET /api/company/interviews/:interviewId')
  if (!data) {
    return res.status(404).json({ error: { code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' } })
  }
  if (!mayActOnInterview(req, scope.membership, data.applications?.company_id)) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Interview does not belong to your company' },
    })
  }

  res.status(200).json({ status: 'ok', interview: data })
})

/**
 * Schedule an interview on one of the caller's company applications.
 */
companyRouter.post('/interviews', authorizeRoles('company', 'admin'), async (req, res) => {
  const checked = validateInterviewPayload(req.body, 'create')
  if (checked.errors) return sendValidationError(res, checked.errors)

  const scope = await resolveCompanyScope(req, res, 'POST /api/company/interviews (membership check)')
  if (scope.denied) return
  const membership = scope.membership
  if (!membership) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Must be an active company member to schedule interviews' },
    })
  }

  // The application must exist and belong to a job owned by the caller's company.
  const { data: application, error: appErr } = await req.supabase
    .from('applications')
    .select('id, job_id, company_id, status, jobs(id, title, company_id)')
    .eq('id', checked.values.application_id)
    .maybeSingle()

  if (appErr) return sendDbError(res, appErr, 'POST /api/company/interviews (application check)')
  if (!application) {
    return res.status(404).json({ error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found' } })
  }
  if (application.company_id !== membership.company_id) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Application does not belong to your company' },
    })
  }
  if (application.jobs && application.jobs.company_id !== membership.company_id) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Job does not belong to your company' },
    })
  }
  if (application.status === 'withdrawn') {
    return res.status(400).json({
      error: {
        code: 'INVALID_TRANSITION',
        message: 'Cannot schedule an interview for a withdrawn application',
      },
    })
  }

  const {
    application_id, title, scheduled_at, description, duration_minutes, meeting_url, location, status,
  } = checked.values

  const { data: interview, error } = await req.supabase
    .from('interviews')
    .insert({
      application_id,
      // The interviewer is the verified caller, never a client-supplied id.
      scheduled_by: req.user.id,
      title,
      description: description ?? null,
      scheduled_at,
      duration_minutes: duration_minutes ?? null,
      meeting_url: meeting_url ?? null,
      location: location ?? null,
      status: status ?? 'scheduled',
    })
    .select('*')
    .single()

  if (error) return sendDbError(res, error, 'POST /api/company/interviews')

  const { data: fullInterview, error: reloadErr } = await req.supabase
    .from('interviews')
    .select(INTERVIEW_SELECT)
    .eq('id', interview.id)
    .maybeSingle()
  if (reloadErr) return sendDbError(res, reloadErr, 'POST /api/company/interviews (reload)')

  res.status(201).json({ status: 'ok', interview: fullInterview ?? interview })
})

/**
 * Update the mutable fields of an interview. The application an interview
 * belongs to (and the interviewer) are immutable.
 */
companyRouter.patch('/interviews/:interviewId', authorizeRoles('company', 'admin'), requireInterviewIdParam, async (req, res) => {
  const checked = validateInterviewPayload(req.body, 'update')
  if (checked.errors) return sendValidationError(res, checked.errors)

  const scope = await resolveCompanyScope(req, res, 'PATCH /api/company/interviews/:interviewId (membership check)')
  if (scope.denied) return

  const { data: existing, error: findErr } = await loadInterviewRecord(req, req.params.interviewId)
  if (findErr) return sendDbError(res, findErr, 'PATCH /api/company/interviews/:interviewId (find)')
  if (!existing) {
    return res.status(404).json({ error: { code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' } })
  }
  if (!mayActOnInterview(req, scope.membership, existing.applications?.company_id)) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Interview does not belong to your company' },
    })
  }

  const update = { ...checked.values }
  if (update.status !== undefined && !canTransitionInterview(existing.status, update.status)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_TRANSITION',
        message: `Cannot change interview status from ${existing.status} to ${update.status}`,
      },
    })
  }

  const { data: updated, error } = await req.supabase
    .from('interviews')
    .update(update)
    .eq('id', req.params.interviewId)
    .select('*')
    .maybeSingle()

  if (error) return sendDbError(res, error, 'PATCH /api/company/interviews/:interviewId')

  const { data: fullInterview } = await req.supabase
    .from('interviews')
    .select(INTERVIEW_SELECT)
    .eq('id', req.params.interviewId)
    .maybeSingle()

  res.status(200).json({ status: 'ok', interview: fullInterview ?? updated })
})

/**
 * Update the status of an interview (scheduled, completed, cancelled,
 * rescheduled) or cancel it.
 */
companyRouter.patch('/interviews/:interviewId/status', authorizeRoles('company', 'admin'), requireInterviewIdParam, async (req, res) => {
  const status = req.body?.status
  if (!status || !INTERVIEW_STATUSES.has(status)) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: `status must be one of: ${[...INTERVIEW_STATUSES].join(', ')}` },
    })
  }

  const scope = await resolveCompanyScope(req, res, 'PATCH /api/company/interviews/:interviewId/status (membership check)')
  if (scope.denied) return

  const { data: existing, error: findErr } = await loadInterviewRecord(req, req.params.interviewId)
  if (findErr) return sendDbError(res, findErr, 'PATCH /api/company/interviews/:interviewId/status (find)')
  if (!existing) {
    return res.status(404).json({ error: { code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' } })
  }
  if (!mayActOnInterview(req, scope.membership, existing.applications?.company_id)) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Interview does not belong to your company' },
    })
  }
  if (!canTransitionInterview(existing.status, status)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_TRANSITION',
        message: `Cannot change interview status from ${existing.status} to ${status}`,
      },
    })
  }

  const { data: updated, error } = await req.supabase
    .from('interviews')
    .update({ status })
    .eq('id', req.params.interviewId)
    .select('*')
    .maybeSingle()

  if (error) return sendDbError(res, error, 'PATCH /api/company/interviews/:interviewId/status')

  const { data: fullInterview } = await req.supabase
    .from('interviews')
    .select(INTERVIEW_SELECT)
    .eq('id', req.params.interviewId)
    .maybeSingle()

  res.status(200).json({ status: 'ok', interview: fullInterview ?? updated })
})

// ── Company Messaging Routes ────────────────────────────────────────────────

/**
 * Conversations have no company column either: a conversation belongs to a
 * match, and the match carries the company. Every conversation query
 * therefore reaches the company through the `matches` embed.
 *
 * `conversation_members` holds the participants: the candidate and the active
 * company members of the match's company (added by the
 * create_conversation_for_match trigger). `matches.job_seeker_profiles`
 * carries the candidate's headline.
 */
const CONVERSATION_SELECT =
  'id, match_id, created_at, updated_at, ' +
  'matches!inner(id, job_id, job_seeker_id, company_id, jobs(id, title, location), ' +
  'job_seeker_profiles(headline)), ' +
  'conversation_members(profile_id, profiles(id, full_name, avatar_url, role))'

/** A message with its sender. */
const MESSAGE_SELECT =
  'id, conversation_id, sender_id, message, message_type, is_read, created_at, ' +
  'profiles(id, full_name, avatar_url, role)'

/**
 * The active company memberships of the verified caller.
 * `companyId` narrows the lookup to a single company.
 *
 * Unlike the single-company routes, messaging does not stop at the first
 * membership: a conversation inbox is shared by every company the caller
 * belongs to.
 */
async function loadActiveMemberships(req, companyId) {
  let query = req.supabase
    .from('company_members')
    .select('id, company_id, role')
    .eq('profile_id', req.user.id)
    .eq('is_active', true)
  if (companyId) query = query.eq('company_id', companyId)

  const { data, error } = await query
  if (error) return { memberships: [], error }
  return { memberships: data ?? [], error: null }
}

/**
 * Load a conversation with its match and participants, and check that the
 * caller may act on it.
 *
 * Two independent conditions are enforced:
 * 1. the caller must be an active member of the conversation's company, and
 * 2. the caller must be a participant of the conversation itself.
 *
 * The second condition mirrors the "Messages insertable by conversation
 * members" RLS policy, which requires a conversation member even for a
 * platform admin. The first condition keeps a member of one company away from
 * the conversations of another.
 *
 * @returns {{ conversation: object | null, companyId: string | null, denied: boolean }}
 */
async function loadAccessibleConversation(req, res, conversationId, context) {
  const { data, error } = await req.supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .eq('id', conversationId)
    .maybeSingle()

  if (error) {
    sendDbError(res, error, context)
    return { conversation: null, companyId: null, denied: true }
  }
  // A conversation the caller may not see is reported as missing, so the API
  // never discloses that an unrelated private conversation exists.
  if (!data) {
    res.status(404).json({ error: { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found' } })
    return { conversation: null, companyId: null, denied: true }
  }

  const companyId = data.matches?.company_id ?? null
  if (!companyId) {
    res.status(404).json({ error: { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found' } })
    return { conversation: null, companyId: null, denied: true }
  }

  const { memberships, error: memErr } = await loadActiveMemberships(req, companyId)
  if (memErr) {
    sendDbError(res, memErr, context)
    return { conversation: null, companyId: null, denied: true }
  }
  if (memberships.length === 0) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Not an active member of this company' },
    })
    return { conversation: null, companyId: null, denied: true }
  }

  const isParticipant = (data.conversation_members ?? []).some(
    (member) => member.profile_id === req.user.id,
  )
  if (!isParticipant) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Not a participant of this conversation' },
    })
    return { conversation: null, companyId: null, denied: true }
  }

  return { conversation: data, companyId, denied: false }
}

/**
 * Shape a conversation for the company inbox: the candidate on the other side,
 * the last message and how many messages the caller has not read.
 */
function buildConversationSummary(conversation, messages, callerId) {
  const members = conversation.conversation_members ?? []
  const candidate = members.find((member) => member.profiles?.role === 'job_seeker') ?? null
  const thread = messages ?? []
  const last = thread.length > 0 ? thread[thread.length - 1] : null
  const unread = thread.filter((message) => message.sender_id !== callerId && !message.is_read).length

  return {
    id: conversation.id,
    match_id: conversation.match_id,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
    company_id: conversation.matches?.company_id ?? null,
    job_seeker_id: conversation.matches?.job_seeker_id ?? null,
    job: conversation.matches?.jobs
      ? {
          id: conversation.matches.jobs.id,
          title: conversation.matches.jobs.title,
          location: conversation.matches.jobs.location ?? null,
        }
      : null,
    candidate: candidate
      ? {
          id: candidate.profile_id,
          full_name: candidate.profiles?.full_name ?? null,
          avatar_url: candidate.profiles?.avatar_url ?? null,
          headline: conversation.matches?.job_seeker_profiles?.headline ?? null,
        }
      : null,
    participant_ids: members.map((member) => member.profile_id),
    last_message: last
      ? {
          id: last.id,
          message: last.message,
          sender_id: last.sender_id,
          created_at: last.created_at,
        }
      : null,
    last_message_at: last?.created_at ?? null,
    unread_count: unread,
  }
}

/**
 * Load the messages of the given conversations, oldest first.
 */
async function loadConversationMessages(req, conversationIds) {
  if (!conversationIds.length) return { messages: [], error: null }

  const { data, error } = await req.supabase
    .from('messages')
    .select('id, conversation_id, sender_id, message, message_type, is_read, created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: true })

  if (error) return { messages: [], error }
  return { messages: data ?? [], error: null }
}

/**
 * List the conversations of the companies the caller belongs to.
 * Optional filters: jobId and candidateId (the candidate's profile id).
 */
companyRouter.get('/conversations', authorizeRoles('company', 'admin'), async (req, res) => {
  const { memberships, error: memErr } = await loadActiveMemberships(req)
  if (memErr) return sendDbError(res, memErr, 'GET /api/company/conversations (membership check)')

  const companyIds = [...new Set(memberships.map((membership) => membership.company_id))]
  if (companyIds.length === 0) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'No active company membership found for authenticated user' },
    })
  }

  const { jobId, candidateId } = req.query

  if (jobId && !UUID.test(jobId)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'jobId must be a UUID' } })
  }
  if (candidateId && !UUID.test(candidateId)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'candidateId must be a UUID' } })
  }

  let query = req.supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .in('matches.company_id', companyIds)
    .order('updated_at', { ascending: false })

  if (jobId) query = query.eq('matches.job_id', jobId)

  const { data, error } = await query
  if (error) return sendDbError(res, error, 'GET /api/company/conversations')

  const conversations = data ?? []
  const { messages, error: msgErr } = await loadConversationMessages(
    req,
    conversations.map((conversation) => conversation.id),
  )
  if (msgErr) return sendDbError(res, msgErr, 'GET /api/company/conversations (messages)')

  const messagesByConversation = new Map()
  for (const message of messages) {
    const thread = messagesByConversation.get(message.conversation_id) ?? []
    thread.push(message)
    messagesByConversation.set(message.conversation_id, thread)
  }

  const summaries = conversations
    .map((conversation) =>
      buildConversationSummary(
        conversation,
        messagesByConversation.get(conversation.id) ?? [],
        req.user.id,
      ),
    )
    // The candidate filter runs over the participants, because the candidate is
    // identified by their profile id. The job seeker profile id of the match
    // is accepted as well, so callers may use either identifier.
    .filter(
      (summary) =>
        !candidateId ||
        summary.candidate?.id === candidateId ||
        summary.job_seeker_id === candidateId,
    )

  res.status(200).json({ status: 'ok', conversations: summaries })
})

/**
 * Retrieve one conversation with its messages.
 */
companyRouter.get('/conversations/:conversationId', authorizeRoles('company', 'admin'), requireConversationIdParam, async (req, res) => {
  const access = await loadAccessibleConversation(
    req,
    res,
    req.params.conversationId,
    'GET /api/company/conversations/:conversationId',
  )
  if (access.denied) return

  const { messages, error } = await loadConversationMessages(req, [req.params.conversationId])
  if (error) return sendDbError(res, error, 'GET /api/company/conversations/:conversationId (messages)')

  res.status(200).json({
    status: 'ok',
    conversation: buildConversationSummary(access.conversation, messages, req.user.id),
    messages,
  })
})

/**
 * Send a message in one of the caller's company conversations.
 * The sender is always the verified caller.
 */
companyRouter.post('/conversations/:conversationId/messages', authorizeRoles('company', 'admin'), requireConversationIdParam, async (req, res) => {
  const checked = validateMessagePayload(req.body)
  if (checked.errors) return sendValidationError(res, checked.errors)

  const access = await loadAccessibleConversation(
    req,
    res,
    req.params.conversationId,
    'POST /api/company/conversations/:conversationId/messages',
  )
  if (access.denied) return

  const { data: message, error } = await req.supabase
    .from('messages')
    .insert({
      conversation_id: req.params.conversationId,
      // The sender is the verified caller, never a client-supplied id.
      sender_id: req.user.id,
      message: checked.values.message,
      message_type: checked.values.message_type ?? 'text',
      is_read: true,
    })
    .select(MESSAGE_SELECT)
    .single()

  if (error) return sendDbError(res, error, 'POST /api/company/conversations/:conversationId/messages')

  res.status(201).json({ status: 'ok', message })
})
