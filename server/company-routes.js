// Company profile API, mounted at /api/company behind authenticateToken.
//
//   GET   /api/company/profile             caller's active company membership + company
//   POST  /api/company/profile             create a company; caller becomes its owner
//   PATCH /api/company/:companyId/profile  update profile fields (company owner/admin)
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
  // No prototype: a body key like "__proto__" must become an error entry,
  // not a prototype assignment that leaves `errors` empty.
  const errors = Object.create(null)
  const values = {}

  for (const [key, value] of Object.entries(body)) {
    // Own properties only: inherited names (constructor, toString, ...) are unknown fields.
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

export const companyRouter = express.Router()

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

  // One active company per account (GET returns a single company). This check
  // gives the usual answer; create_company_with_owner repeats it under a
  // per-account lock, which catches two simultaneous requests.
  const existing = await loadMembership(req)
  if (existing.error) return sendDbError(res, existing.error, 'POST /api/company/profile (membership check)')
  if (existing.data) return sendCompanyExists(res)

  // Creates the company and the caller's owner membership in one transaction.
  const { data: companyId, error } = await req.supabase.rpc('create_company_with_owner', {
    p_company: checked.values,
  })
  // 23505 from this function only means the account already has a company
  // (the new company and its first membership cannot collide with existing rows).
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
