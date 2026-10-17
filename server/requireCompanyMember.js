// Company membership authorization for Express routes.
// Resolves membership from company_members (trusted DB), never from the body.
// Use after authenticateToken + authorizeRoles('company'|'admin').

import { supabase } from './supabase-server.js'

/**
 * Load active membership for a profile in a company.
 * @returns {{ membership: object | null, error: object | null }}
 */
export async function resolveCompanyMembership(profileId, companyId) {
  if (!profileId || !companyId) {
    return { membership: null, error: { code: 'INVALID_ARGS' } }
  }

  const { data, error } = await supabase
    .from('company_members')
    .select('id, company_id, profile_id, role, is_active')
    .eq('company_id', companyId)
    .eq('profile_id', profileId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) return { membership: null, error }
  return { membership: data ?? null, error: null }
}

/**
 * Middleware factory: require active membership in req.params.companyId
 * (or req.companyId if already set). Optional member-role allow-list
 * (owner | admin | recruiter | hiring_manager).
 *
 * Attaches req.companyMembership on success.
 */
export function requireCompanyMember(...allowedMemberRoles) {
  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        })
      }

      // Admins may bypass membership for support tooling.
      if (req.user.role === 'admin') {
        return next()
      }

      const companyId = req.params.companyId || req.companyId
      if (!companyId) {
        return res.status(400).json({
          error: { code: 'BAD_REQUEST', message: 'companyId is required' },
        })
      }

      const { membership, error } = await resolveCompanyMembership(req.user.id, companyId)
      if (error) {
        return res.status(500).json({
          error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve company membership' },
        })
      }

      if (!membership) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Not an active member of this company',
          },
        })
      }

      if (
        allowedMemberRoles.length > 0 &&
        !allowedMemberRoles.includes(membership.role)
      ) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: `Insufficient company role. Required: ${allowedMemberRoles.join(', ')}`,
          },
        })
      }

      req.companyMembership = membership
      next()
    } catch (err) {
      console.error('[requireCompanyMember] unexpected error:', err)
      return res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Company authorization error' },
      })
    }
  }
}
