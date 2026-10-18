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
