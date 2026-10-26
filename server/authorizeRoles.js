// Role authorization middleware for Express backend.
// Provides reusable middleware for job_seeker, company, and admin roles.
// Uses the verified req.user.role set by authenticateToken (profiles table).
// Returns HTTP 403 for authenticated users without permission.

export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      })
    }

    const userRole = req.user.role

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Insufficient permissions. Required roles: ${allowedRoles.join(', ')}`,
        },
      })
    }

    next()
  }
}
