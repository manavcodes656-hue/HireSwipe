/**
 * Company Feature Models — aligned with the Supabase database schema.
 *
 * These types mirror the DB schema defined in database.types.ts with template aliases.
 */

// ── Enums ────────────────────────────────────────────────────────────────────

export type CompanyRole = 'owner' | 'admin' | 'recruiter' | 'hiring_manager';

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance';
export type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'lead' | 'executive';
export type RemoteType = 'on_site' | 'hybrid' | 'remote';

/** Matches DB enum: job_status ('published' | 'draft' | 'paused' | 'closed') + UI alias 'active' */
export type JobStatus = 'draft' | 'published' | 'paused' | 'closed' | 'active';

/** Matches DB enum: application_status */
export type ApplicationStatus =
  | 'pending'
  | 'reviewing'
  | 'shortlisted'
  | 'interview'
  | 'rejected'
  | 'accepted'
  | 'withdrawn';

/** Matches DB enum: interview_status */
export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled' | 'rescheduled' | 'upcoming';

export type NotificationType =
  | 'application'
  | 'match'
  | 'message'
  | 'interview'
  | 'job_activity'
  | 'system';

// ── 1. profiles ──────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  experience_years?: number | null;
  skills?: string[];
  education?: string;
  role?: string | null;
  resume_url?: string | null;
  created_at: string;
  updated_at: string;
}

// ── 2. companies ─────────────────────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  industry?: string | null;
  /** DB column: company_size */
  company_size?: string | null;
  size?: string | null;
  founded_year?: number | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  description?: string | null;
  logo_url?: string | null;
  completion_percentage: number;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
  // UI-only extras (not in DB):
  culture?: string;
  mission?: string;
  values?: string[];
  banner_url?: string;
}

// ── 3. company_members ───────────────────────────────────────────────────────

export interface CompanyMember {
  id: string;
  company_id: string;
  profile_id: string;
  profile?: Profile;
  role: CompanyRole;
  /** DB column: is_active (boolean) */
  is_active: boolean;
  status?: string;
  invited_at?: string;
  joined_at?: string;
  created_at: string;
  updated_at: string;
}

// ── 4. jobs ──────────────────────────────────────────────────────────────────

export interface Job {
  id: string;
  company_id: string;
  created_by?: string | null;
  title: string;
  description: string;
  employment_type: EmploymentType;
  experience_level?: string | null;
  experience_min?: number | null;
  experience_max?: number | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency: string;
  location?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  remote_type: RemoteType;
  openings: number;
  application_deadline?: string | null;
  status: JobStatus;
  skills?: JobSkill[];
  requirements?: JobRequirement[];
  benefits?: JobBenefit[];
  views_count?: number;
  applications_count?: number;
  matches_count?: number;
  created_at: string;
  updated_at: string;
  // Joined company data (optional, from nested select):
  companies?: { name: string; logo_url?: string | null } | null;
}

// ── 5. job_skills ────────────────────────────────────────────────────────────

export interface JobSkill {
  job_id: string;
  skill_id: string;
  is_required: boolean;
  minimum_proficiency?: string | null;
  /** Joined from skills table */
  skill_name?: string;
}

// ── 6. job_requirements ──────────────────────────────────────────────────────

export interface JobRequirement {
  id?: string;
  job_id?: string;
  /** DB column: requirement */
  requirement: string;
  requirement_text?: string;
  is_required?: boolean;
  created_at?: string;
}

// ── 7. job_benefits ──────────────────────────────────────────────────────────

export interface JobBenefit {
  id?: string;
  job_id?: string;
  /** DB column: benefit */
  benefit: string;
  benefit_text?: string;
  created_at?: string;
}

// ── 8. job_swipes ────────────────────────────────────────────────────────────

export interface JobSwipe {
  id: string;
  job_id: string;
  job_seeker_id: string;
  direction: 'like' | 'pass';
  created_at: string;
}

// ── 9. matches ───────────────────────────────────────────────────────────────

export interface Match {
  id: string;
  job_id: string;
  job?: Job;
  /** DB column: job_seeker_id (references job_seeker_profiles.id) */
  job_seeker_id?: string;
  job_seeker_profile?: JobSeekerProfile;
  profile_id?: string;
  profile?: Profile;
  company_id?: string;
  match_score?: number | null;
  /** DB enum: 'active' | 'closed' */
  status: 'active' | 'closed';
  matched_at: string;
}

// ── 10. applications ─────────────────────────────────────────────────────────

export interface Application {
  id: string;
  job_id: string;
  job?: Job;
  /** DB column: job_seeker_id (references job_seeker_profiles.id) */
  job_seeker_id: string;
  job_seeker_profile?: JobSeekerProfile;
  profile_id?: string;
  profile?: Profile;
  company_id: string;
  applied_at: string;
  updated_at: string;
  status: ApplicationStatus;
  resume_id?: string | null;
  cover_letter?: string | null;
  match_score?: number | null;
  status_history?: ApplicationStatusHistory[];
}

// ── 11. application_status_history ───────────────────────────────────────────

export interface ApplicationStatusHistory {
  id: string;
  application_id: string;
  old_status?: ApplicationStatus | null;
  new_status?: ApplicationStatus;
  status?: ApplicationStatus;
  note?: string | null;
  notes?: string | null;
  changed_by?: string | null;
  created_at?: string;
  changed_at?: string;
}

// ── 12. conversations ────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  match_id?: string;
  job_id?: string;
  candidate_id?: string;
  company_id?: string;
  created_at: string;
  updated_at: string;
  // Joined/derived:
  job_title?: string;
  candidate_name?: string;
  candidate_avatar?: string | null;
  candidate_role?: string | null;
  unread_count?: number;
  last_message?: string;
  last_message_at?: string;
}

// ── 13. messages ─────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type?: 'company' | 'job_seeker';
  sender_name?: string;
  content?: string;
  message?: string;
  message_type?: 'text' | 'file' | 'system';
  attachments?: any[];
  is_read?: boolean;
  sent_at?: string;
  created_at?: string;
}

// ── 14. interviews ───────────────────────────────────────────────────────────

export interface Interview {
  id: string;
  application_id: string;
  application?: Application;
  job_id?: string;
  candidate_id?: string;
  candidate_name?: string;
  candidate_avatar?: string | null;
  recruiter_name?: string;
  job_title?: string;
  title: string;
  description?: string | null;
  scheduled_at?: string;
  date?: string;
  time?: string;
  duration_minutes?: number | null;
  meeting_url?: string | null;
  meeting_link?: string | null;
  location?: string | null;
  notes?: string;
  scheduled_by?: string | null;
  status: InterviewStatus;
  created_at: string;
  updated_at?: string;
}

// ── 15. notifications ────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  profile_id?: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

// ── 16. Additional view models ───────────────────────────────────────────────

/** Lightweight job-seeker profile summary for company views */
export interface JobSeekerProfile {
  id: string;
  profile_id: string;
  headline?: string | null;
  location?: string | null;
  experience_years?: number | null;
  current_job_title?: string | null;
  current_company?: string | null;
  profile?: Profile;
}
