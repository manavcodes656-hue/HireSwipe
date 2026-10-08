# HireSwipe Database Architecture

This document provides a comprehensive overview of the HireSwipe database foundation. It defines the tables, columns, relationships, constraints, Row Level Security (RLS) model, and Storage buckets that form the backend of the platform.

## 1. System Architecture
HireSwipe utilizes Supabase as its single backend platform. The stack includes:
- **Angular**: Frontend framework
- **Supabase Auth**: Authentication & user session management
- **PostgreSQL**: Primary relational database
- **Row Level Security (RLS)**: Enforces access control strictly at the database layer
- **Supabase Storage**: Object storage for files (avatars, resumes, logos, attachments)

## 2. Authentication & Identity Model
We rely strictly on **Supabase Auth** (`auth.users`) for credentials. Application-level identity and access roles are managed in the `public.profiles` table.

**Roles (`user_role` ENUM):**
- `job_seeker`
- `company`
- `admin`

When a user signs up via Supabase Auth, a trigger (`on_auth_user_created`) automatically creates a corresponding row in `public.profiles`.

## 3. Database Schema Overview

The schema is divided into logical domains:

### A. Identity
- **`profiles`**: Links `auth.users` to application metadata. Stores `email`, `role`, `first_name`, `last_name`, `avatar_url`.

### B. Job Seeker Domain
- **`job_seeker_profiles`**: Core professional details, expected salary, availability. (1:1 with `profiles`).
- **`resumes`**: Multiple resumes allowed. Linked to Storage bucket.
- **`education`**: Educational history.
- **`experience`**: Professional work experience.
- **`skills`**: Global catalog of predefined/custom skills.
- **`job_seeker_skills`**: Junction table mapping seekers to skills with proficiency levels.
- **`job_seeker_preferences`**: Job preferences (remote vs on-site, salary, industries). (1:1 with `job_seeker_profiles`).

### C. Company Domain
- **`companies`**: Company profiles (name, industry, size, logo).
- **`company_members`**: Junction mapping `profiles` to `companies` with role-based access (`owner`, `admin`, `recruiter`, `hiring_manager`).

### D. Jobs Domain
- **`jobs`**: Job postings published by companies.
- **`job_skills`**: Required/preferred skills for a job.
- **`job_requirements`**: Additional specific requirements.
- **`job_benefits`**: Perks and benefits offered.

### E. Matching Domain
- **`job_swipes`**: Records a job seeker's action (`like` or `pass`) on a job.
- **`matches`**: A successful relationship created automatically (via trigger) when a swipe is a `like` and mutually approved/processed.

### F. Applications Domain
- **`applications`**: Formal job applications bridging job seekers and companies.
- **`application_status_history`**: Audit trail of status changes (e.g., `pending` -> `reviewing` -> `interview`). Automatically logged via trigger.

### G. Communication Domain
- **`conversations`**: Chat sessions created automatically when a `match` occurs.
- **`conversation_members`**: The profiles participating in a conversation.
- **`messages`**: Chat messages within a conversation.

### H. Interviews Domain
- **`interviews`**: Scheduled interviews linked to specific applications.

### I. Notifications & Discovery
- **`saved_jobs`**: Jobs bookmarked by a seeker.
- **`notifications`**: System or user-generated alerts.

### J. Safety & Audit Domain
- **`blocked_users`**: User blocklists.
- **`reports`**: Safety/abuse reports.
- **`activity_logs`**: System audit trails.

## 4. Key Relationships & Triggers
- **`auth.users` -> `profiles`**: Trigger inserts profile on signup.
- **`job_swipes` -> `matches`**: Trigger creates match automatically when swipe direction is `like`.
- **`matches` -> `conversations`**: Trigger automatically initializes a conversation with relevant company members and the job seeker when a match occurs.
- **`applications` -> `application_status_history`**: Trigger logs any `status` UPDATE.
- **`updated_at`**: Trigger runs `BEFORE UPDATE` on all major tables to keep timestamps accurate.

## 5. Row Level Security (RLS) Model
Strict RLS is enabled on all tables. Route guards in Angular are NOT treated as database security.

### General Rules:
- **Admins** have bypass access to most read/manage operations.
- **Job Seekers** can strictly manage their own profile, resumes, education, experience, swipes, and applications. They can read published jobs.
- **Company Members** can manage their own company profile, jobs, requirements, and view applications/candidates that have applied to their jobs or matched with them.
- **Communication** is strictly scoped so that only participants (conversation members) can view or insert messages.

## 6. Storage Architecture
PostgreSQL stores metadata; binary files live in Supabase Storage.

**Buckets & Access:**
- `avatars` (Public): Publicly readable, users can only update their own folder.
- `company-logos` (Public): Publicly readable, company members manage their logos.
- `resumes` (Private): Job seekers manage their own. Companies can read resumes of active applicants/matches.
- `job-attachments` (Private): Managed by company members.
- `message-attachments` (Private): Only accessible by relevant conversation members.

## 7. Performance & Optimization
Indexes have been added to heavily queried foreign keys and common lookup columns:
- Role checks: `profiles(role)`
- Foreign Keys: `company_members(company_id)`, `matches(job_seeker_id)`, `applications(job_id)`, etc.
- Filtering: `jobs(status, location)`, `notifications(is_read)`.

## 8. Development Guidelines
- Always use the predefined ENUMS for status, types, and roles.
- Do NOT insert into `application_status_history` manually; update the `applications.status` column and let the database trigger handle it.
- Trust RLS. Do not implement complex backend authorization logic that duplicates RLS rules.
