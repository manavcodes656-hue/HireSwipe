// HireSwipe backend entry point — JavaScript (ES modules), Node.js + Express.
// Load env before any module that creates the Supabase client.
import './load-env.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import { authenticateToken } from './authenticateToken.js'
import { authorizeRoles } from './authorizeRoles.js'
import { companyRouter } from './company-routes.js'

const PORT = Number(process.env.PORT) || 3000
const NODE_ENV = process.env.NODE_ENV || 'development'

const rawCorsOrigin = (process.env.CORS_ORIGIN || 'http://localhost:4200').trim()
const ALLOW_ALL_ORIGINS = rawCorsOrigin === '*'
const ALLOWED_ORIGINS = ALLOW_ALL_ORIGINS
  ? '*'
  : rawCorsOrigin
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)

const app = express()

app.disable('x-powered-by')
app.use(express.json())
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: !ALLOW_ALL_ORIGINS,
  }),
)

// --- Public routes (intentionally unauthenticated) ------------------------

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'hireswipe-api',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  })
})

// --- Protected API (Bearer token + profiles.role) -------------------------
// Mount auth only under /api after health so /api/health stays public.
// Do not invent a second Express app or auth stack.

const api = express.Router()
api.use(authenticateToken)

api.get('/job-seeker/profile', authorizeRoles('job_seeker'), (req, res) => {
  res.status(200).json({
    status: 'ok',
    userRole: req.user.role,
    message: 'Job seeker profile accessed',
  })
})

api.use('/company', companyRouter)

api.get('/admin/dashboard', authorizeRoles('admin'), (req, res) => {
  res.status(200).json({
    status: 'ok',
    userRole: req.user.role,
    message: 'Admin dashboard accessed',
  })
})

app.use('/api', api)

// --- 404 (unknown routes) --------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`,
    },
  })
})

// --- Centralized error handling (must keep 4 params) ------------------------

app.use((err, req, res, next) => {
  const status = Number(err.status || err.statusCode) || 500

  let code = 'ERROR'
  if (err.type === 'entity.parse.failed') code = 'INVALID_JSON'
  else if (status === 404) code = 'NOT_FOUND'
  else if (status >= 500) code = 'INTERNAL_ERROR'

  // Full error (with stack) stays in the server log; clients never get a stack
  // trace, and 5xx messages are generic in every environment.
  console.error(`[error] ${req.method} ${req.originalUrl} -> ${status}`, err)

  res.status(status).json({
    error: {
      code,
      message: status >= 500 ? 'Internal server error' : err.message,
    },
  })
})

// --- Start -----------------------------------------------------------------
// Listen only when run directly (npm start / npm run dev); tests import `app`.

export { app }

const isEntryPoint =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntryPoint) {
  const server = app.listen(PORT, () => {
    console.log(`HireSwipe API listening on http://localhost:${PORT} (${NODE_ENV})`)
    console.log(`Health check: GET http://localhost:${PORT}/api/health`)
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Set PORT in the root .env to change it.`)
    } else {
      console.error('Failed to start server:', err)
    }
    process.exit(1)
  })
}
