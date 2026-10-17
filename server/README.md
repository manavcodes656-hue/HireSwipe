# HireSwipe Backend

Minimal Express API written in **plain JavaScript (ES modules)**. It is a
separate Node.js project from the Angular frontend — it has its own
`package.json` and `node_modules`, so the Angular app is untouched.

## Requirements

- Node.js 20 or newer
- npm 11 or newer

## Install

```bash
cd server
npm install
```

Or from the repository root:

```bash
npm run server:install
```

## Configure

Copy the placeholder file and fill in real values. **Never commit `server/.env`.**

```bash
cp .env.example .env
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port the API listens on |
| `NODE_ENV` | `development` | `development` or `production` |
| `CORS_ORIGIN` | `http://localhost:4200` | Allowed origin(s), comma-separated, or `*` |
| `SUPABASE_URL` | — | Supabase project URL (**required**) |
| `SUPABASE_PUBLISHABLE_KEY` | — | Publishable (anon) key, used with each caller's token so RLS applies (**required**) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Supabase service-role key — **server-side only, never expose** (**required**) |

The three Supabase variables are required: the server exits at startup with
`Missing required environment variable: <NAME>` if one is missing (the value
is never printed).

## Run

```bash
# production-style start
npm start

# development (auto-restarts on file changes)
npm run dev
```

From the repository root:

```bash
npm run server:start
npm run server:dev
```

## Verify

```bash
curl http://localhost:3000/api/health
```

Expected (HTTP `200`):

```json
{
  "status": "ok",
  "service": "hireswipe-api",
  "environment": "development",
  "timestamp": "2026-10-14T00:00:00.000Z",
  "uptimeSeconds": 0
}
```

## API

All `/api` routes except `/api/health` require `Authorization: Bearer <Supabase access token>`.
Errors use one shape: `{ "error": { "code": "...", "message": "..." } }`
(validation errors add `fields`).

| Method & path | Who | Purpose |
| --- | --- | --- |
| `GET /api/health` | public | Health check |
| `GET /api/company/profile` | `company`, `admin` | Caller's active company membership and company (`membership: null` if none) |
| `POST /api/company/profile` | `company` | Create a company; the caller becomes its owner (`create_company_with_owner`). `409 COMPANY_EXISTS` if the caller already has one |
| `PATCH /api/company/:companyId/profile` | company `owner`/`admin` member, platform `admin` | Update profile fields: `name`, `description`, `industry`, `website`, `company_size`, `founded_year`, `logo_url`, `email`, `phone`, `location`, `city`, `state`, `country`, `onboarding_completed`, `completion_percentage`. Any other field is rejected with `400` |

User requests run through a Supabase client built from the caller's token
(`createUserClient`), so database RLS policies and triggers apply. The
service-role client is limited to token verification, role lookup and
membership checks on the verified user. Database errors are mapped in
`db-errors.js` (e.g. RLS denial `403`, unique conflict `409`, rule violation
`422`, unknown field `400`, unexpected `500` with a generic message).

### Database requirements

`supabase/migrations/004_security_hardening.sql` has **not been applied to any
Supabase project**. Review it, apply it to a staging project and re-run the
checks there before production. The statements below come from a local
in-memory PostgreSQL (PGlite) run with stubbed `auth`/`storage` schemas, not
from Supabase.

- `POST /api/company/profile` needs 004: it calls `create_company_with_owner`,
  which 004 introduces. Without it PostgREST reports a missing function
  (`PGRST202`) and the API answers `500 INTERNAL_ERROR`. The function also
  allows one company per account: it re-checks for an active membership under
  a per-account lock, so of two simultaneous requests one gets
  `409 COMPANY_EXISTS` (the lock was not exercised concurrently; PGlite has a
  single connection).
- `GET /api/company/profile` reads `company_members` with its `companies` row.
  The SELECT policies it uses come from 003 and are unchanged by 004, so it
  works with 001–003 alone.
- `PATCH /api/company/:companyId/profile` updates `companies` under its UPDATE
  policy. With 001–003 that policy lets **any** active member update the
  company, so the API's owner/admin check is the only barrier and a recruiter
  can bypass it through the Supabase REST API. 004 restricts the policy to
  active owners/admins and platform admins, matching the API.

## Test

```bash
npm test        # from server/, or `npm run server:test` from the repository root
```

Tests mock Supabase; they do not contact a database.

## Notes

- Unknown routes return `404` JSON; all errors go through one centralized
  error-handling middleware.
- CORS is configured via `CORS_ORIGIN` (defaults to the Angular dev server).
- No matching, notifications, or email logic yet — that is M2+.
