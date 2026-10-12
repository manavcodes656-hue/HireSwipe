# HireSwipe Database Architecture & Schema Specification

This document provides a comprehensive overview of the HireSwipe database foundation, schema relationships, Row Level Security (RLS) model, migrations architecture, and performance optimizations.

---

## 1. System Architecture

HireSwipe utilizes Supabase as its primary backend platform:
- **Angular (v22)**: Modern standalone frontend application with typed services and signals.
- **Supabase Auth**: Dedicated authentication provider (`auth.users`) for credentials and session tokens.
- **PostgreSQL**: Relational database with versioned migrations, check constraints, and relational integrity.
- **Row Level Security (RLS)**: Enforces access control strictly at the PostgreSQL layer. Angular route guards provide client-side navigation flow but are not the security boundary.
- **Supabase Storage**: S3-compatible object storage for file uploads (avatars, resumes, company logos, attachments).

---

## 2. Authentication & Identity Model

- **Credentials Boundary**: Handled exclusively by Supabase Auth (`auth.users`). Passwords and auth tokens are never stored in application tables.
- **Application Identity**: Managed in `public.profiles`, with a 1:1 cascade foreign key to `auth.users(id)`.
- **User Roles (`user_role` ENUM)**:
  - `job_seeker`: Job seekers who build profiles, discover jobs, swipe, and submit applications.
  - `company`: Recruiters, hiring managers, and company owners who manage jobs and evaluate candidates.
  - `admin`: Platform administrators.
- **Signup Sync**: Handled by the trigger function `on_auth_user_created`, which creates/updates `public.profiles` with `role`, `full_name`, `first_name`, `last_name`, and `avatar_url` from auth metadata with safe defaults and `search_path = public, pg_temp`.

---

## 3. Database Schema Overview

The database is organized into cohesive functional domains:

### A. Identity & Profiles Domain
- **`profiles`**: Application profile linked to `auth.users(id)`.
  - Columns: `id`, `email`, `role`, `first_name`, `last_name`, `full_name`, `avatar_url`, `phone`, timestamps.
  - Constraints: Primary key `id REFERENCES auth.users(id) ON DELETE CASCADE`.

### B. Job Seeker Domain
- **`job_seeker_profiles`**: Professional overview, compensation targets, and completion metrics (1:1 with `profiles`).
  - Columns: `id`, `profile_id`, `headline`, `bio`, `phone`, `date_of_birth`, `location`, `city`, `state`, `country`, `experience_years`, `current_job_title`, `current_company`, `expected_salary_min`, `expected_salary_max`, `salary_currency`, `availability`, `resume_url`, `linkedin_url`, `portfolio_url`, `github_url`, `onboarding_completed`, `profile_completion_pct`, timestamps.
- **`resumes`**: Uploaded candidate resumes linked to the `resumes` storage bucket (1:N with `job_seeker_profiles`).
- **`education`**: Academic history with degrees, institutions, and timelines.
- **`experience`**: Professional work history with job titles, companies, and roles.
- **`skills`**: Global catalog of predefined and custom skills.
- **`job_seeker_skills`**: Junction table mapping job seekers to catalog skills with proficiency level and years of experience.
- **`job_seeker_preferences`**: Job preferences (remote vs on-site, target salary range, preferred industries) (1:1 with `job_seeker_profiles`).

### C. Company & Team Domain
- **`companies`**: Company profiles with business details, size, and onboarding metrics.
  - Columns: `id`, `name`, `description`, `industry`, `website`, `company_size`, `founded_year`, `logo_url`, `email`, `phone`, `location`, `city`, `state`, `country`, `onboarding_completed`, `completion_percentage`, timestamps.
- **`company_members`**: Junction table mapping `profiles` to `companies` with role-based access.
  - Roles (`company_member_role`): `owner`, `admin`, `recruiter`, `hiring_manager`.
  - Unique constraint: `(company_id, profile_id)`.

### D. Jobs Domain
- **`jobs`**: Job postings published by companies.
  - Statuses (`job_status`): `draft`, `published`, `paused`, `closed`.
  - Attributes: `title`, `description`, `employment_type`, `experience_level`, `experience_min`, `experience_max`, `salary_min`, `salary_max`, `salary_currency`, `location`, `remote_type`, `openings`, `application_deadline`, timestamps.
- **`job_skills`**: Required and preferred skills for a job.
- **`job_requirements`**: Structured bullet-point requirements.
- **`job_benefits`**: Benefits and perks offered.

### E. Swipe & Application Domain
- **`job_swipes`**: Records a candidate's swipe decision on a job.
  - Directions (`swipe_direction`): `like`, `pass`.
  - Unique constraint: `(job_id, job_seeker_id)`.
- **`matches`**: Record of candidate/job mutual interest and fit score.
  - Columns: `id`, `job_id`, `job_seeker_id`, `company_id`, `match_score`, `status` (`active`, `closed`), `matched_at`, timestamps.
  - Unique constraint: `(job_id, job_seeker_id)`.
- **`applications`**: Formal job applications submitted by candidates.
  - Statuses (`application_status`): `pending`, `reviewing`, `shortlisted`, `interview`, `rejected`, `accepted`, `withdrawn`.
  - Columns: `id`, `job_id`, `job_seeker_id`, `company_id`, `resume_id`, `cover_letter`, `match_score`, `status`, `applied_at`, timestamps.
  - Unique constraint: `(job_id, job_seeker_id)`.
- **`application_status_history`**: Audit trail of application status changes automatically maintained by the `on_application_status_updated` trigger.

### F. Matching & AI Domain
- **`matching_results`**: Structured matching analysis and criteria breakdown between candidate and job.
  - Columns: `id`, `job_id`, `job_seeker_id`, `match_score`, `status` (`pending`, `processing`, `completed`, `failed`), `strengths`, `gaps`, `criteria_analysis` (JSONB), `model_version`, `error_message`, timestamps.
  - Unique constraint: `(job_id, job_seeker_id)`.

### G. Communication & Interviews Domain
- **`conversations`**: Chat thread tied to a match.
- **`conversation_members`**: Participants in the conversation.
- **`messages`**: Messages sent within a conversation.
- **`interviews`**: Scheduled interviews linked to an application.
  - Statuses (`interview_status`): `scheduled`, `completed`, `cancelled`, `rescheduled`.

### H. Notifications & Email Domain
- **`notifications`**: In-app notifications for matches, application updates, interviews, and messages.
- **`saved_jobs`**: Bookmarked jobs for candidates.
- **`email_outbox`**: Durable outbox table for transactional email processing.
  - Columns: `id`, `recipient_email`, `recipient_id`, `event_type`, `payload`, `status` (`queued`, `processing`, `sent`, `failed`), `retry_count`, `max_retries`, `idempotency_key`, `provider_message_id`, `error_message`, `scheduled_for`, `sent_at`, timestamps.

### I. Safety & Audit Domain
- **`blocked_users`**: User-to-user blocking.
- **`reports`**: Safety/abuse reports.
- **`activity_logs`**: System audit log.

---

## 4. Key Relationships & Triggers

1. **`auth.users` -> `profiles`**: Trigger `on_auth_user_created` creates or updates a profile on signup.
2. **`job_swipes` -> `matches`**: Trigger `on_job_swipe_created` creates a match when swipe direction is `'like'`.
3. **`matches` -> `conversations`**: Trigger `on_match_created` automatically provisions a conversation and assigns members.
4. **`applications` -> `application_status_history`**: Trigger `on_application_status_updated` logs status transitions.
5. **`updated_at`**: Trigger `BEFORE UPDATE` keeps `updated_at` timestamps accurate across all entities.

---

## 5. Row Level Security (RLS) Model

All tables have Row Level Security enabled. Key access boundaries:
- **Profiles**: Authenticated users can view public profile details; users can only update their own row.
- **Job Seekers**: Full ownership of their own profile, resumes, education, experience, and preferences. Company members can read applicant/matched candidate data.
- **Companies**: All authenticated users can view company information. Company members manage their company and jobs. Initial creator can insert the first owner membership.
- **Jobs**: Published jobs are readable by all authenticated seekers. Draft, paused, or closed jobs are restricted to company members and admins.
- **Applications**: Seekers view and submit their own applications. Authorized company members view and update status.
- **Communications**: Only participants in `conversation_members` can read or send messages.
- **Storage**: Private buckets (`resumes`, `message-attachments`, `job-attachments`) require verified ownership or membership.

---

## 6. Migration Inventory

1. **`001_initial_hireswipe_schema.sql`** (Applied remotely as `20261008113259`, `20261008113512`, `20261008113648`):
   - Defined core tables, base ENUMs, triggers, and baseline RLS policies.
2. **`002_database_architecture_and_matching.sql`** (Forward-only migration):
   - Adds `full_name` to `public.profiles` and hardens auth signup trigger.
   - Adds `onboarding_completed` and completion metrics to `job_seeker_profiles` and `companies`.
   - Adds `match_score` to `matches` and `applications`.
   - Creates `public.matching_results` and `public.email_outbox` tables with RLS.
   - Implements `public.check_application_eligibility(job_seeker_id, job_id)` function.
   - Adds covering indexes for all 17 unindexed foreign keys identified by the database linter.
   - Hardens function security (`SET search_path = public, pg_temp;` and revokes public RPC execution).
   - Fixes company initial owner insertion policy in `company_members`.

---

## 7. Performance & Optimization

- **Foreign Key Covering Indexes**: All foreign keys across applications, interviews, status histories, conversation members, reports, and logs are covered by explicit indexes to avoid full table scans and lock contention during cascading updates/deletes.
- **RLS InitPlan Optimization**: RLS policies evaluate `(SELECT auth.uid())` to permit PostgreSQL query plan caching across row iterations.
- **Status Lookups**: Filter indexes exist for `jobs(status)`, `applications(status)`, `notifications(is_read)`, and `email_outbox(status, scheduled_for)`.

---

## 8. Unresolved Assumptions & Notes

- **AI Analysis Engine**: The schema supports both pre-computed matching and on-demand asynchronous analysis via `matching_results`. External provider integrations will be implemented in trusted backend functions (Phase 5B).
- **Candidate Swipe vs Mutual Swiping**: Current product behavior treats candidate positive swipes as instant matches (`matches` created on like), while application submissions remain an explicit separate candidate action. Recruiter candidate swiping is also supported on the company side.
