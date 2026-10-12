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
| **Profile Role Self-Elevation** | A malicious job seeker modifies `profiles.role` to `'admin'` or `'company'` via an authorized UPDATE call on their own row. | **Database Trigger `prevent_profile_role_update`**: Blocks any change to `role` unless the acting user is an authenticated administrator (`is_admin()`). |
| **Application State Forgery** | A candidate attempts to change their application status from `pending` to `shortlisted` or `accepted`. | **Database Trigger `validate_application_update`**: Verifies that candidates can only transition status to `'withdrawn'`. Positive status transitions (`reviewing`, `shortlisted`, `interview`, `accepted`, `rejected`) require verified active company membership on the associated job. |
| **Relational Key Tampering** | An attacker updates `job_id`, `job_seeker_id`, or `company_id` on an existing application to reassign candidate records. | **Database Trigger `validate_application_update`**: Raises an exception if `job_id`, `job_seeker_id`, or `company_id` are modified on existing applications. |
| **Company Membership Escalation** | A recruiter or hiring manager attempts to promote themselves or another member to `'owner'`. | **Database Trigger `enforce_company_membership_hierarchy`**: Restricts assigning or updating the `'owner'` role exclusively to existing company owners or platform admins. |
| **Search Path Hijacking** | Malicious users exploit mutable `search_path` in `SECURITY DEFINER` functions to execute arbitrary SQL. | **Function Hardening**: All functions set `SET search_path = public, pg_temp;`. |
| **RPC Endpoint Exposure** | Internal trigger functions called directly via `/rest/v1/rpc/...` by anonymous or authenticated users. | **Permission Revocation**: `REVOKE EXECUTE` applied on trigger functions from `PUBLIC`, `anon`, and `authenticated`. |

---

## 3. Row Level Security (RLS) Policy Matrix

| Entity | Action | Permitted Roles | Policy Enforcement Condition |
|---|---|---|---|
| **`profiles`** | SELECT | Authenticated | Public profile information viewable by logged-in users. |
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
| | INSERT | Authenticated | Register new company during onboarding. |
| | UPDATE | Active Member | `public.is_company_member(id, (SELECT auth.uid()))` OR Admin. |
| **`company_members`** | SELECT | Active Member / Admin | `public.is_company_member(company_id, (SELECT auth.uid()))` OR Admin. |
| | INSERT | Founder / Owner / Admin | Creator adding first owner membership OR existing owner/admin inviting member. |
| | UPDATE | Owner / Admin | Existing owner/admin (role changes guarded by hierarchy trigger). |
| | DELETE | Owner / Admin | Existing owner only or Admin. |
| **`jobs`** | SELECT | Authenticated | Status is `'published'` OR caller is active member of posting company OR Admin. |
| | INSERT/UPDATE | Active Member / Admin | Active company member with recruiting privileges. |
| | DELETE | Owner / Admin | Active company owner/admin. |
| **`job_swipes`** | SELECT / INSERT | Candidate Owner | `job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid()))`. |
| | UPDATE | None | Swipes are immutable business decisions. |
| **`matches`** | SELECT | Candidate / Company | Matching candidate or active member of matched company. |
| | UPDATE | Company / Candidate | Close match status or manage match. |
| **`applications`** | SELECT | Candidate / Company | Applying candidate or active member of target company. |
| | INSERT | Candidate Owner | `job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid()))`. |
| | UPDATE | Company / Candidate | Company updates review status; Candidate can only set `status = 'withdrawn'`. |
| **`matching_results`** | SELECT | Candidate / Company | Candidate views own results; Company views results for company jobs. |
| | ALL | Admin | Service/Admin managed. |
| **`conversations` / `messages`** | SELECT / INSERT | Participants | Caller must be a verified member of `conversation_members`. Messages sender must equal `(SELECT auth.uid())`. |
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
- Conversation folder scoping: `conversation_members.conversation_id = (storage.foldername(name))[1]::uuid`.

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
