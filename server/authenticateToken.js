// Authentication middleware for Express backend.
// Reads the Supabase Auth access token from the Authorization: Bearer header,
// verifies it using the server-side Supabase SDK, and attaches the verified
// user identity to the request object.
//
// Security:
// - Never trusts a user ID or role supplied in the request body or JWT metadata.
// - Rejects missing, malformed, expired, or invalid tokens (HTTP 401).
// - Attaches only verified identity information to req.user.
// - Resolves the user's role from the trusted profiles table.
// - Attaches req.supabase: a client scoped to this user (RLS applies), built
//   from the verified token. The token itself is not stored or logged.
//
// Missing-profile policy (M2):
// - Registration/onboarding create auth.users + profiles via DB trigger on the
//   Angular → Supabase path. Express APIs require an established profiles.role.
// - If the profile row or role is missing, reject with 403 PROFILE_REQUIRED.
// - Do not default to job_seeker (that would grant seeker privileges to orphans).

import { supabase, createUserClient } from './supabase-server.js'

// Values of the public.user_role enum (001_initial_hireswipe_schema.sql).
const KNOWN_ROLES = new Set(['job_seeker', 'company', 'admin'])

/**
 * Extract the Bearer token from the Authorization header.
 * Returns the token string or null if not found/malformed.
 */
function extractToken(req) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    return null
  }
  const token = authHeader.substring('Bearer '.length).trim()
  if (!token) {
    return null
  }
  return token
}

/**
 * True when Supabase Auth could not be reached or failed on its side
 * (network error or 5xx), as opposed to rejecting the token.
 */
function isAuthServiceUnavailable(error) {
  return error?.name === 'AuthRetryableFetchError' || Number(error?.status) >= 500
}

/**
 * Verify the Supabase Auth access token and return user data.
 * Returns { user, error } from supabase.auth.getUser(token).
 */
async function verifyToken(token) {
  const { data, error } = await supabase.auth.getUser(token)
  return { user: data?.user, error }
}

/**
 * Resolve the user's role from the profiles table.
 * Only returns the role from the trusted database profile — never from request body.
 * Returns { role, error }: error is set when the lookup itself failed (DB/network),
 * role is null when no profile row or no recognised role exists.
 */
async function resolveUserRole(userId) {
  if (!userId) return { role: null, error: null }

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (error) return { role: null, error }
  if (!data?.role || !KNOWN_ROLES.has(data.role)) return { role: null, error: null }
  return { role: data.role, error: null }
}

/**
 * Authentication middleware.
 * - Reads the access token from Authorization: Bearer header
 * - Verifies the token with Supabase Auth
 * - Attaches verified user context to req.user
 * - Returns HTTP 401 for authentication failures
 * - Returns HTTP 403 PROFILE_REQUIRED when profile/role cannot be established
 *
 * Usage: mount on protected routes (keep /api/health public).
 */
export async function authenticateToken(req, res, next) {
  try {
    const token = extractToken(req)
    if (!token) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or malformed Authorization header. Expected: Authorization: Bearer <token>',
        },
      })
      return
    }

    const { user, error: verifyError } = await verifyToken(token)
    if (verifyError && isAuthServiceUnavailable(verifyError)) {
      console.error('[authenticateToken] auth service unavailable:', verifyError.message ?? verifyError)
      res.status(503).json({
        error: {
          code: 'AUTH_UNAVAILABLE',
          message: 'Authentication service is temporarily unavailable.',
        },
      })
      return
    }
    if (verifyError || !user) {
      res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired Supabase Auth token.',
        },
      })
      return
    }

    const { role, error: roleError } = await resolveUserRole(user.id)
    if (roleError) {
      // Fail closed, but report a server fault rather than blaming the account.
      console.error('[authenticateToken] profile lookup failed:', roleError.message ?? roleError)
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to resolve account role',
        },
      })
      return
    }
    if (!role) {
      res.status(403).json({
        error: {
          code: 'PROFILE_REQUIRED',
          message:
            'No profile or role is provisioned for this account. Complete registration before accessing protected APIs.',
        },
      })
      return
    }

    // Verified identity only — never forward raw_user_meta_data or request body roles.
    req.user = {
      id: user.id,
      email: user.email,
      role,
    }
    req.supabase = createUserClient(token)

    next()
  } catch (err) {
    console.error('[authenticateToken] unexpected error:', err)
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication service error',
      },
    })
  }
}
