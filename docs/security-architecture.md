# HireSwipe Security Architecture & Authorization Specification

This document details the security architecture, threat model, Row Level Security (RLS) enforcement, Storage permissions, and secret management policies for the HireSwipe platform.

---

## 1. Security Architecture & Threat Model

### 1.1 The Security Boundary
- **Client Boundary**: Angular route guards (`authGuard`, `jobSeekerGuard`, `companyGuard`) improve user navigation and UI responsiveness. **They are not the security boundary**.
- **Enforcement Boundary**: Security and access control are enforced strictly at the PostgreSQL layer via **Row Level Security (RLS)**, database triggers, constraints, and typed schemas.
- **Direct Database Access Resilience**: Any direct query executed against Supabase PostgREST endpoints (`/rest/v1/...`) with a compromised or spoofed client request is constrained by RLS policies evaluated for the authenticated JWT user (`auth.uid()`).

### 1.2 Authentication Identity Model
- User authentication is owned by **Supabase Auth** (`auth.users`).
- Application identity is maintained in `public.profiles` (`id REFERENCES auth.users(id) ON DELETE CASCADE`).
- All relational child tables (`job_seeker_profiles`, `company_members`, `applications`, `resumes`, `notifications`, etc.) verify row ownership against `(SELECT auth.uid())` or verified active company membership.

---

## 2. Privilege Escalation Protections

| Vulnerability Vector | Risk | Mitigation Implemented |
|---|---|---|
| **Profile Role Self-Elevation** | A malicious job seeker modifies `profiles.role` to `'admin'` or `'company'` via an authorized UPDATE call on their own row. | **Database Trigger `prevent_profile_role_update`**: For API clients (`anon`/`authenticated`), blocks any change to `role` unless the acting user is an authenticated administrator (`is_admin()`). Trusted database roles (`postgres`, `service_role`) may provision roles (004). |
| **Signup Role Injection** | A user calls `signUp()` with `options.data.role = 'admin'` (client-controlled `raw_user_meta_data`). | **`handle_new_user` (004)**: Only `job_seeker` and `company` are honoured from metadata; any other value becomes `job_seeker`. |
| **Company Ownership Takeover** | A user creates a company or claims the owner seat of a company they did not create. | **004**: Company INSERT requires a `company`/`admin` profile; the first-owner claim requires a `company` profile and a company with no memberships (checked without RLS). `create_company_with_owner()` creates both rows atomically and refuses an account that already holds an active membership (checked under a per-account lock). Membership changes are serialized per company; only `company` accounts can be active team members; a company always keeps at least one active owner (`prevent_last_owner_removal`): a sole owner's account cannot be deleted until ownership is transferred or the company is deleted. A `company` account cannot change role while it holds an active membership (`prevent_company_role_loss_with_active_memberships`); trusted contexts (service-role key, direct SQL) may only *deactivate* memberships, so an operator can deactivate first and then change the role. |
| **Application / Match Forgery** | Applying to unpublished jobs, forging `company_id`/`status`/`match_score`, attaching another candidate's resume, or repointing a match to another candidate. | **004**: `validate_application_insert` (job, company, eligibility, resume ownership), extended `validate_application_update`, `prevent_match_key_update`; `check_and_create_match` only matches published jobs. |
| **Application State Forgery** | A candidate attempts to change their application status from `pending` to `shortlisted` or `accepted`. | **Database Trigger `validate_application_update`**: Verifies that candidates can only transition status to `'withdrawn'`. Positive status transitions (`reviewing`, `shortlisted`, `interview`, `accepted`, `rejected`) require verified active company membership on the associated job. |
| **Relational Key Tampering** | An attacker updates `job_id`, `job_seeker_id`, or `company_id` on an existing application to reassign candidate records. | **Database Trigger `validate_application_update`**: Raises an exception if `job_id`, `job_seeker_id`, or `company_id` are modified on existing applications. |
| **Company Membership Escalation** | A recruiter or hiring manager attempts to promote themselves or another member to `'owner'`. | **Database Trigger `enforce_company_membership_hierarchy`**: Restricts assigning or updating the `'owner'` role exclusively to existing company owners or platform admins. |
| **Search Path Hijacking** | Malicious users exploit mutable `search_path` in `SECURITY DEFINER` functions to execute arbitrary SQL. | **Function Hardening**: All functions set `SET search_path = public, pg_temp;`. |
| **RPC Endpoint Exposure** | Internal trigger functions called directly via `/rest/v1/rpc/...` by anonymous or authenticated users. | **Permission Revocation**: `REVOKE EXECUTE` applied on trigger functions from `PUBLIC`, `anon`, and `authenticated`. 004 also revokes `is_admin`, `is_company_member` and `get_job_seeker_id_for_user` from `PUBLIC` (002 revoked them from `anon` only, which `PUBLIC` still covered), and makes `check_application_eligibility` internal. |

---

## 3. Row Level Security (RLS) Policy Matrix

| Entity | Action | Permitted Roles | Policy Enforcement Condition |
|---|---|---|---|
| **`profiles`** | SELECT | Self / Related / Admin | `public.can_view_profile(id)` (004): own row, teammates, conversation participants, candidates who applied to or matched with the caller's company, or Admin. Team invites use `find_profile_for_team_invite()` (company owners/admins and platform admins only; returns `id`, `email`, `full_name` of `company` accounts only, so job-seeker accounts look the same as unknown emails). |
| | UPDATE | Profile Owner | `id = (SELECT auth.uid())` (Role alterations blocked by trigger). |
| | DELETE | Admin | `public.is_admin((SELECT auth.uid()))`. |
| **`job_seeker_profiles`** | SELECT | Candidate / Company | Own row (`profile_id = (SELECT auth.uid())`), OR active company member where candidate applied/matched, OR Admin. |
| | INSERT/UPDATE | Candidate Owner | `profile_id = (SELECT auth.uid())`. |
| **`resumes`** | SELECT | Candidate / Company | Own resumes, OR company member where candidate submitted an application with `resume_id = resumes.id`, OR Admin. |
| | INSERT/UPDATE/DELETE | Candidate Owner | `job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid()))`. |
| **`education` / `experience`** | SELECT | Candidate / Company | Own records, OR company member of applied/matched job, OR Admin. |
| | INSERT/UPDATE/DELETE | Candidate Owner | `job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid()))`. |
| **`skills`** | SELECT | Authenticated | View global skills catalog. |
| | INSERT/UPDATE/DELETE | Admin | `public.is_admin((SELECT auth.uid()))`. |
| **`companies`** | SELECT | Authenticated | View company profiles. |
| | INSERT | Company / Admin | `public.has_profile_role(ARRAY['company','admin'])` (004). Prefer `create_company_with_owner()`. |
| | UPDATE | Owner / Admin | `public.has_company_member_role(id, ARRAY['owner','admin'])` OR Admin (004). With 003 alone, any active member. |
| **`company_members`** | SELECT | Active Member / Admin | `public.is_company_member(company_id, (SELECT auth.uid()))` OR Admin. |
| | INSERT | Founder / Owner / Admin | Company-role creator adding the first `owner` membership of a company with no members, OR existing owner/admin (`has_company_member_role`) inviting member. The invited profile must have role `company`. |
| | UPDATE | Owner / Admin | Existing owner/admin (role changes guarded by hierarchy trigger). |
| | DELETE | Owner / Admin | Existing owner only or Admin. The last active owner cannot be removed, deactivated or demoted (004). |
| **`jobs`** | SELECT | Authenticated | Status is `'published'` OR caller is active member of posting company OR Admin. |
| | INSERT/UPDATE | Active Member / Admin | Active company member with recruiting privileges. |
| | DELETE | Owner / Admin | Active company owner/admin. |
| **`job_swipes`** | SELECT / INSERT | Candidate Owner | `job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid()))`. |
| | UPDATE | None | Swipes are immutable business decisions. |
| **`matches`** | SELECT | Candidate / Company | Matching candidate or active member of matched company. |
| | UPDATE | Company / Candidate | Close match status or manage match. |
| **`applications`** | SELECT | Candidate / Company | Applying candidate or active member of target company. |
| | INSERT | Candidate Owner | `job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid()))`; trigger `validate_application_insert` enforces `check_application_eligibility()` (internal only since 004, not callable by clients), job/company consistency and resume ownership. Only trusted contexts (`is_trusted_db_context()`: service-role key or direct SQL without an API request) skip eligibility; platform admins do not. |
| | UPDATE | Company / Candidate | Company updates review status; Candidate can only set `status = 'withdrawn'`. |
| **`matching_results`** | SELECT | Candidate / Company | Candidate views own results; Company views results for company jobs. |
| | ALL | Admin | Service/Admin managed. |
| **`conversations` / `messages`** | SELECT / INSERT | Participants | `public.is_conversation_member(conversation_id)` (004; non-recursive). Messages sender must equal `(SELECT auth.uid())`. |
| **`interviews`** | SELECT | Candidate / Company | Applicant or active member of interviewing company. |
| | ALL | Active Company Member | Managing scheduled interviews. |
| **`notifications`** | SELECT / UPDATE / DELETE | Recipient Owner | `profile_id = (SELECT auth.uid())`. |
| **`email_outbox`** | SELECT | Recipient / Admin | Recipient can view own delivery state; Admins manage queue. |

---

## 4. Storage Security & File Isolation

### 4.1 Storage Buckets Configuration
| Bucket ID | Public/Private | Max Size | Permitted MIME Types | Access Policy |
|---|---|---|---|---|
| **`avatars`** | Public Read | 5 MB | `image/jpeg`, `image/png`, `image/webp`, `image/gif` | Upload/Update restricted to folder `auth.uid()`. |
| **`company-logos`** | Public Read | 5 MB | `image/jpeg`, `image/png`, `image/webp`, `image/svg+xml` | Upload/Update restricted to active members of the company folder UUID. |
| **`resumes`** | **Private** | 10 MB | `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Private owner management (`auth.uid()`). Company members can read resumes of active applicants. |
| **`job-attachments`** | **Private** | 15 MB | Configured per attachment | Company members of the job folder UUID. |
| **`message-attachments`** | **Private** | 15 MB | Configured per attachment | Conversation members of the conversation folder UUID. |

### 4.2 Path Traversal Prevention
Storage object policies enforce strict path prefixes:
- User folder scoping: `(storage.foldername(name))[1] = (SELECT auth.uid())::text`.
- Company folder scoping: `public.is_company_member((storage.foldername(name))[1]::uuid, (SELECT auth.uid()))`.
- Conversation folder scoping: `public.is_conversation_member((storage.foldername(name))[1]::uuid)` (004).

---

## 5. Secrets Management & Privileged Operations

1. **Angular Client Secret Ban**:
   - The Angular application bundle must never contain:
     - `SUPABASE_SERVICE_ROLE_KEY`
     - Database connection strings (`postgresql://...`)
     - AI provider API keys (OpenAI, Gemini, Anthropic)
     - Email/SMTP credentials (SendGrid, Resend, Postmark)
   - Verified: Codebase contains zero references to privileged secrets.
2. **Public Anon Key Scoping**:
   - The publishable `anonKey` (`supabase.anonKey`) in `src/environments` is safe for browser distribution because all database operations are secured by PostgreSQL RLS.
3. **Privileged Operations Boundary**:
   - High-privilege tasks (email dispatching, AI batch analysis, system audit logging) run in trusted server-side execution contexts (Supabase Edge Functions / Backend services) with isolated environment variables.

---

## 6. Security Testing & Verification Checklist

- [x] **Negative Role Escalation Test**: Verified that `prevent_profile_role_update` triggers an exception when a non-admin attempts to modify `profiles.role`.
- [x] **Negative Application Tampering Test**: Verified that `validate_application_update` blocks candidates from forging status to `'shortlisted'`.
- [x] **Application Withdrawal Test**: Verified that candidates can legally update their own application to `'withdrawn'`.
- [x] **Foreign Key Covered Indexing**: 17 foreign key indexes created to eliminate performance bottlenecks and locking during cascade checks.
- [x] **InitPlan RLS Optimization**: 38 policy clauses optimized from `auth.uid()` to `(SELECT auth.uid())` to permit single-plan caching.
- [x] **Storage Policy Verification**: Applicant resume read access granted to authorized company recruiters on private bucket `resumes`.
- [ ] **Migration 004 on Supabase**: 004 was exercised only against a local in-memory PostgreSQL (PGlite) with stubbed `auth`/`storage` schemas. Re-run the negative/positive checks against a Supabase staging project before production.

---

## 7. Express API Authorization Model

- `authenticateToken` verifies the bearer token with Supabase Auth, resolves `profiles.role`, and attaches `req.supabase`: a client built from the publishable key plus the caller's token (`createUserClient`). Every user-initiated query and RPC goes through it, so RLS policies and triggers run with the caller's `auth.uid()`.
- The service-role client is limited to token verification, the role lookup, and membership checks (`requireCompanyMember`) keyed by the verified user id. It is never used to perform a user's write.
- Route middleware (`authorizeRoles`, `requireCompanyMember`) checks the same rules before the database does: for example only company `owner`/`admin` members (and platform admins) may update the company profile. 004 makes the `companies` UPDATE policy match; until 004 is applied, RLS still lets any active member update the company directly through the REST API.
- Database errors are mapped centrally (`server/db-errors.js`): RLS/privilege denial `403`, unique conflict `409`, check/business-rule violation `422`, malformed values and unknown fields (`PGRST204`) `400`, unexpected errors `500` with a generic message. Table, constraint and column names, row data and stack traces are never returned to clients.
