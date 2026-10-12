/**
 * Job-Seeker Feature Models — aligned with the Supabase database schema.
 *
 * Includes canonical database column names alongside template-compatible aliases.
 */

// ── Enums ────────────────────────────────────────────────────────────────────

export type ProficiencyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type ApplicationStatus =
  | 'pending'
  | 'reviewing'
  | 'shortlisted'
  | 'interview'
  | 'rejected'
  | 'accepted'
  | 'withdrawn';

/** DB enum: interview_status ('scheduled' | 'completed' | 'cancelled' | 'rescheduled') + UI alias 'upcoming' */
export type InterviewStatus =
  | 'scheduled'
  | 'upcoming'
  | 'completed'
  | 'cancelled'
  | 'rescheduled';

export type NotificationType =
  | 'match'
  | 'new_match'
  | 'application'
  | 'application_update'
  | 'application_status'
  | 'message'
  | 'new_message'
  | 'interview'
  | 'job'
  | 'job_recommendation'
  | 'system';

// ── 1. profiles (public.profiles) ────────────────────────────────────────────

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  headline?: string | null;
  bio?: string | null;
  role: 'job_seeker' | 'company' | 'admin';
  user_id?: string;
  created_at: string;
  updated_at: string;
}

// ── 2. job_seeker_profiles ───────────────────────────────────────────────────

export interface JobSeekerProfile {
  id: string;
  profile_id: string;
  headline?: string | null;
  bio?: string | null;
  current_job_title?: string | null;
  current_company?: string | null;
  /** DB column: experience_years */
  experience_years?: number | null;
  /** UI alias: years_of_experience */
  years_of_experience?: number | null;
  availability?: string | null;
  location?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  expected_salary_min?: number | null;
  expected_salary_max?: number | null;
  salary_currency: string;
  resume_url?: string | null;
  onboarding_completed: boolean;
  profile_completion_pct: number;
  created_at: string;
  updated_at: string;
}

// ── 3. resumes ───────────────────────────────────────────────────────────────

export interface Resume {
  id: string;
  /** DB column: job_seeker_id */
  job_seeker_id: string;
  job_seeker_profile_id?: string;
  file_name: string;
  /** DB column: file_path (storage path) */
  file_path: string;
  file_size?: number | string | null;
  mime_type?: string | null;
  file_type?: string | null;
  file_url?: string | null;
  is_primary: boolean;
  created_at: string;
  uploaded_at?: string;
  updated_at?: string;
}

// ── 4. education ─────────────────────────────────────────────────────────────

export interface Education {
  id: string;
  job_seeker_id: string;
  job_seeker_profile_id?: string;
  institution: string;
  degree: string;
  field_of_study?: string | null;
  start_date: string;
  end_date?: string | null;
  grade?: string | null;
  description?: string | null;
  created_at: string;
  updated_at?: string;
}

// ── 5. experience ────────────────────────────────────────────────────────────

export interface Experience {
  id: string;
  job_seeker_id: string;
  job_seeker_profile_id?: string;
  /** DB column: company_name */
  company_name: string;
  /** UI alias: company */
  company?: string;
  job_title: string;
  employment_type?: string | null;
  location?: string | null;
  start_date: string;
  end_date?: string | null;
  /** DB column: is_current */
  is_current: boolean;
  /** UI alias: currently_working */
  currently_working?: boolean;
  description?: string | null;
  created_at: string;
  updated_at?: string;
}

// ── 6. skills catalog ────────────────────────────────────────────────────────

export interface Skill {
  id: string;
  name: string;
  category?: string | null;
}

// ── 7. job_seeker_skills ─────────────────────────────────────────────────────

export interface JobSeekerSkill {
  id?: string;
  job_seeker_id: string;
  job_seeker_profile_id?: string;
  skill_id: string;
  skill_name?: string;
  proficiency_level?: ProficiencyLevel | string | null;
  /** DB column: years_experience */
  years_experience?: number | null;
  /** UI alias: years_of_experience */
  years_of_experience?: number | null;
}

// ── 8. job_seeker_preferences ────────────────────────────────────────────────

export interface JobSeekerPreference {
  id: string;
  job_seeker_id: string;
  job_seeker_profile_id?: string;
  preferred_job_title?: string | null;
  preferred_location?: string | null;
  remote_preference?: 'remote' | 'hybrid' | 'on_site' | null;
  employment_type?: 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance' | null;
  minimum_salary?: number | null;
  maximum_salary?: number | null;
  min_salary?: number | null;
  max_salary?: number | null;
  experience_level?: string | null;
  preferred_industries?: string[] | null;
  willing_to_relocate: boolean;
  created_at: string;
  updated_at?: string;
}

// ── 9. job_swipes ────────────────────────────────────────────────────────────

export interface JobSwipe {
  id: string;
  job_seeker_id: string;
  job_id: string;
  direction: 'like' | 'pass';
  created_at: string;
}

// ── 10. matches ──────────────────────────────────────────────────────────────

export interface Match {
  id: string;
  job_seeker_id: string;
  job_seeker_profile_id?: string;
  job_id: string;
  company_id: string;
  matched_at: string;
  match_date?: string;
  status: 'active' | 'closed';
  match_score?: number | string | null;
  company_name?: string;
  company_logo?: string | null;
  job_title?: string;
  job_location?: string | null;
}

// ── 11. applications ─────────────────────────────────────────────────────────

export interface ApplicationStatusHistory {
  id: string;
  application_id: string;
  old_status?: ApplicationStatus | null;
  new_status?: ApplicationStatus;
  status?: ApplicationStatus;
  note?: string | null;
  comment?: string | null;
  changed_by?: string | null;
  created_at?: string;
  changed_at?: string;
}

export interface Application {
  id: string;
  job_seeker_id: string;
  job_seeker_profile_id?: string;
  job_id: string;
  company_id: string;
  company_name?: string;
  company_logo?: string | null;
  job_title?: string;
  job_location?: string | null;
  salary_range?: string;
  employment_type?: string;
  status: ApplicationStatus;
  applied_at: string;
  updated_at: string;
  cover_letter?: string | null;
  resume_id?: string | null;
  match_score?: number | string | null;
  status_history?: ApplicationStatusHistory[];
}

// ── 12. saved_jobs ───────────────────────────────────────────────────────────

export interface SavedJob {
  id: string;
  job_seeker_id: string;
  job_seeker_profile_id?: string;
  job_id: string;
  created_at: string;
  saved_at?: string;
  job_title?: string;
  company_name?: string;
  company_logo?: string | null;
  location?: string | null;
  employment_type?: string;
  salary_range?: string;
}

// ── 13. conversations ────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  match_id: string;
  created_at: string;
  updated_at: string;
  company_name?: string;
  company_logo?: string | null;
  job_title?: string;
  last_message_snippet?: string;
  last_message_at?: string;
  unread_count?: number;
}

// ── 14. messages ─────────────────────────────────────────────────────────────

export interface MessageAttachment {
  name: string;
  url: string;
  type: string;
  size?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name?: string;
  sender_avatar?: string | null;
  is_job_seeker?: boolean;
  message: string;
  text?: string;
  message_type?: 'text' | 'file' | 'system';
  is_read?: boolean;
  read_state?: boolean;
  attachments?: MessageAttachment[];
  created_at: string;
}

// ── 15. interviews ───────────────────────────────────────────────────────────

export interface Interview {
  id: string;
  application_id: string;
  company_name?: string;
  company_logo?: string | null;
  job_title?: string;
  title?: string;
  description?: string | null;
  scheduled_at: string;
  date?: string;
  time?: string;
  duration_minutes?: number | null;
  meeting_url?: string | null;
  meeting_link?: string | null;
  location?: string | null;
  status: InterviewStatus;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

// ── 16. notifications ────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  profile_id?: string;
  user_id?: string;
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  read?: boolean;
  link?: string | null;
  link_route?: string | null;
  created_at: string;
}

// ── 17. Job (for swipe deck / browsing) ─────────────────────────────────────

export interface Job {
  id: string;
  title: string;
  company_id: string;
  company_name?: string;
  company_logo?: string | null;
  company_type?: string;
  location?: string | null;
  employment_type: string;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency: string;
  salary_display?: string;
  experience_level?: string | null;
  remote_type: string;
  remote_option?: string;
  description: string;
  requirements?: string[];
  skills?: string[];
  match_score?: string;
  posted_at?: string;
  status: 'draft' | 'published' | 'paused' | 'closed';
  created_at: string;
  updated_at: string;
}
