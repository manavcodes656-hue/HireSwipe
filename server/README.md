# HireSwipe Backend (M1 — Foundation)

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
| `SUPABASE_URL` | — | Supabase project URL (server-side only) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Supabase service-role key — **server-side only, never expose** |

The server also runs fine with no `.env` at all (defaults are used).

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

## Notes

- Unknown routes return `404` JSON; all errors go through one centralized
  error-handling middleware.
- CORS is configured via `CORS_ORIGIN` (defaults to the Angular dev server).
- No matching, notifications, or email logic yet — that is M2+.
