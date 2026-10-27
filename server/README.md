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

Copy the placeholder file from the **repo root** (the server loads the root `.env`) and fill in real values. **Never commit `.env`.**

```bash
cp ../.env.example ../.env
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
| `GET /api/company/jobs` | `company`, `admin` | The caller's company jobs |
| `GET /api/company/jobs/:jobId` | `company`, `admin` | One job of the caller's company |
| `POST /api/company/jobs` | `company`, `admin` | Create a job under the caller's company |
| `PATCH /api/company/jobs/:jobId` | `company`, `admin` | Update job fields |
| `PATCH /api/company/jobs/:jobId/status` | `company`, `admin` | Update job status (`draft`/`published`/`paused`/`closed`) |
| `GET /api/company/applications` | `company`, `admin` | The caller's company applications; optional `?jobId=` and `?status=` filters |
| `GET /api/company/applications/:applicationId` | `company`, `admin` | One application with candidate, job, resume and status history |
| `PATCH /api/company/applications/:applicationId/status` | `company`, `admin` | Update the application status and its review note |
| `GET /api/company/interviews` | `company`, `admin` | The caller's company interviews; optional `?applicationId=`, `?jobId=` and `?status=` filters |
| `GET /api/company/interviews/:interviewId` | `company`, `admin` | One interview with its application, candidate and job |
| `POST /api/company/interviews` | `company`, `admin` | Schedule an interview on one of the caller's company applications |
| `PATCH /api/company/interviews/:interviewId` | `company`, `admin` | Update interview fields: `title`, `description`, `scheduled_at`, `duration_minutes`, `meeting_url`, `location`, `status` |
| `PATCH /api/company/interviews/:interviewId/status` | `company`, `admin` | Update the interview status (`scheduled`/`completed`/`cancelled`/`rescheduled`), which is also how an interview is cancelled |

| `GET /api/company/conversations` | `company`, `admin` | The conversations of the companies the caller belongs to; optional `?jobId=` and `?candidateId=` filters |
| `GET /api/company/conversations/:conversationId` | `company`, `admin` | One conversation with its messages |
| `POST /api/company/conversations/:conversationId/messages` | `company`, `admin` | Send a message in one of the caller's conversations |

User requests run through a Supabase client built from the caller's token
(`createUserClient`), so database RLS policies and triggers apply. The
service-role client is limited to token verification, role lookup and
membership checks on the verified user. Database errors are mapped in
`db-errors.js` (e.g. RLS denial `403`, unique conflict `409`, rule violation
`422`, unknown field `400`, unexpected `500` with a generic message).

### Company interviews

`public.interviews` has **no company column**. An interview belongs to an
application, and the application carries the company, so every interview query
reaches the company through the `applications` embed. The API never trusts a
company id from the client: the company is derived from the caller's verified
active membership.

| Database column | API field | Notes |
| --- | --- | --- |
| `application_id` | `application_id` | Required on create, immutable afterwards |
| `title` | `title` | Required |
| `scheduled_at` | `scheduled_at` | Required. A single timestamp, not a date plus a time: ISO 8601 is accepted and stored as UTC |
| `description` | `description` | The agenda / preparation notes (the table has no separate notes column) |
| `duration_minutes` | `duration_minutes` | 1–1440, matching the `> 0` check constraint |
| `meeting_url` | `meeting_url` | Must be an `http(s)` URL |
| `location` | `location` | The mode or place of the round |
| `status` | `status` | `public.interview_status` |
| `scheduled_by` | — | Server-controlled: always the verified caller |

Status transitions are enforced by the API. `completed` and `cancelled` are
terminal; a `scheduled` interview may be completed, cancelled or rescheduled,
and a `rescheduled` one may go back to `scheduled`. An invalid transition
answers `400 INVALID_TRANSITION`.

Scheduling on a **withdrawn** application is rejected with
`400 INVALID_TRANSITION`, matching the rule the applications endpoint already
applies to withdrawn applications.

**Date and time.** The table stores one `scheduled_at` timestamp, so the API
takes one ISO 8601 value. The Angular service builds it from the `date` and
`time` inputs of the schedule form (`date` + `T` + `time` + `:00Z`) and the
value is stored and returned in UTC; the view renders it in the browser's
local time zone.

**Not implemented:** scheduling an interview does **not** create a
notification row for the candidate. The `notifications` table only lets a
profile manage its own notifications (`profile_id = auth.uid()`), so the
company API cannot insert one for the candidate without bypassing RLS. Email
and in-app candidate notifications are a separate phase.

### Company messaging

`public.conversations` has **no company column** either. A conversation
belongs to a match (`conversations.match_id` → `matches.id`) and the match
carries the company, so every conversation query reaches the company through
the `matches` embed. The API never trusts a company id from the client: the
company is derived from the caller's verified active memberships.

| Database column | API field | Notes |
| --- | --- | --- |
| `messages.conversation_id` | — | Taken from the path, never from the body |
| `messages.sender_id` | — | Server-controlled: always the verified caller |
| `messages.message` | `message` | Required, at most 5000 characters |
| `messages.message_type` | `message_type` | `text` or `file`. `system` is reserved for server-generated messages |
| `messages.is_read` | — | Server-controlled. Not writable: the table has no UPDATE policy |

Access to a single conversation requires **both** conditions:

1. the caller is an active member of the conversation's company, and
2. the caller is a participant of the conversation itself.

The second condition mirrors the "Messages insertable by conversation
members" RLS policy, which requires a conversation member even for a platform
admin. A conversation the caller cannot see is reported as `404`, so the API
never discloses that an unrelated private conversation exists.

**Not implemented (blocked by the current schema):**

- **Starting a conversation.** `public.conversations`, `conversation_members`
  and `public.matches` have no INSERT policy, so the API cannot create a
  conversation, add a participant, or create the match it would need. A
  conversation is created by the `on_match_created` trigger when a match
  appears, and a match is created by the `check_and_create_match` trigger when
  a candidate swipes *like* on one of the company's **published** jobs. The
  API can therefore only *look a conversation up* (`GET
  /api/company/conversations?candidateId=…`); it reports "not found" when
  there is none.
- **Read / unread state.** `public.messages` has **no UPDATE policy** in any
  migration, so `is_read` cannot be changed through the user-scoped client and
  the service role must not be used to bypass that. The flag is also a single
  column on the message rather than a per-recipient table, so it cannot
  represent "read by the candidate but not by the recruiter". The unread
  count in the inbox is therefore derived from the stored messages.
- **Editing or deleting messages.** `public.messages` has no `updated_at` or
  `deleted_at` column and no UPDATE or DELETE policy.

**Attachments** are not a table: the file goes to the Supabase Storage bucket
`message-attachments` under `<conversation_id>/<file>` (the bucket policy
scopes it to the conversation members) and the message row stores the public
URL with `message_type = 'file'`. The upload therefore stays on the Supabase
client; the message row itself is created by the API.

**Realtime** does not travel through Express. The Angular app keeps its
`postgres_changes` subscription on the Supabase client, using the caller's
session, so the RLS policies decide which rows are delivered. The channel is
removed again when the conversation changes or the component is destroyed. To
receive live messages the `messages` table has to be part of the
`supabase_realtime` publication, which is a **manual Supabase configuration**
(Dashboard → Database → Publications) and is not part of the migrations.

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
