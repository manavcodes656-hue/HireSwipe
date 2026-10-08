export type CompanyRole = 'owner' | 'admin' | 'recruiter' | 'hiring_manager';

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance';
export type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'lead' | 'executive';
export type RemoteType = 'on_site' | 'hybrid' | 'remote';

export type JobStatus = 'draft' | 'active' | 'paused' | 'closed';

export type ApplicationStatus =
  | 'pending'
  | 'reviewing'
  | 'shortlisted'
  | 'interview'
  | 'rejected'
  | 'accepted'
  | 'withdrawn';

export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';

export type NotificationType =
  | 'application'
  | 'match'
  | 'message'
  | 'interview'
  | 'job_activity'
  | 'system';

// 1. profiles
export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  avatar_url?: string;
  headline?: string;
  bio?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  skills?: string[];
  experience_years?: number;
  education?: string;
  resume_url?: string;
  created_at: string;
  updated_at: string;
}

// 2. companies
export interface Company {
  id: string;
  name: string;
  industry: string;
  size: string; // e.g. '1-10', '11-50', '51-200', '201-500', '500+'
  founded_year: number;
  website: string;
  email: string;
  phone: string;
  location: string;
  city: string;
  state: string;
  country: string;
  description: string;
  culture: string;
  mission: string;
  values: string[];
  logo_url: string;
  banner_url?: string;
  completion_percentage: number;
  onboarding_completed?: boolean;
  created_at: string;
  updated_at: string;
}

// 3. company_members
export interface CompanyMember {
  id: string;
  company_id: string;
  profile_id: string;
  profile?: Profile;
  role: CompanyRole;
  status: 'active' | 'invited' | 'deactivated';
  invited_at: string;
  joined_at?: string;
}

// 4. jobs
export interface Job {
  id: string;
  company_id: string;
  title: string;
  description: string;
  employment_type: EmploymentType;
  experience_level: ExperienceLevel;
  experience_min: number;
  experience_max: number;
  salary_min: number;
  salary_max: number;
  salary_currency: string;
  location: string;
  city: string;
  state: string;
  country: string;
  remote_type: RemoteType;
  openings: number;
  application_deadline: string;
  status: JobStatus;
  skills?: JobSkill[];
  requirements?: JobRequirement[];
  benefits?: JobBenefit[];
  views_count?: number;
  applications_count?: number;
  matches_count?: number;
  created_at: string;
  updated_at: string;
}

// 5. job_skills
export interface JobSkill {
  id: string;
  job_id: string;
  skill_name: string;
  is_required: boolean;
}

// 6. job_requirements
export interface JobRequirement {
  id: string;
  job_id: string;
  requirement_text: string;
  order_index: number;
}

// 7. job_benefits
export interface JobBenefit {
  id: string;
  job_id: string;
  benefit_text: string;
  category?: string;
}

// 8. job_swipes
export interface JobSwipe {
  id: string;
  job_id: string;
  profile_id: string;
  swipe_direction: 'like' | 'pass' | 'superlike';
  created_at: string;
}

// 9. matches
export interface Match {
  id: string;
  job_id: string;
  job?: Job;
  profile_id: string;
  profile?: Profile;
  match_score: number; // percentage e.g. 96
  status: 'active' | 'archived';
  matched_at: string;
}

// 10. applications
export interface Application {
  id: string;
  job_id: string;
  job?: Job;
  profile_id: string;
  profile?: Profile;
  applied_at: string;
  status: ApplicationStatus;
  resume_url: string;
  cover_letter: string;
  match_score: number;
  status_history: ApplicationStatusHistory[];
}

// 11. application_status_history
export interface ApplicationStatusHistory {
  id: string;
  application_id: string;
  status: ApplicationStatus;
  notes?: string;
  changed_by: string; // profile_id or name
  changed_at: string;
}

// 12. conversations
export interface Conversation {
  id: string;
  job_id?: string;
  job_title?: string;
  candidate_id: string;
  candidate_name: string;
  candidate_avatar?: string;
  candidate_role?: string;
  company_id: string;
  last_message?: string;
  last_message_at?: string;
  unread_count: number;
  created_at: string;
}

// 13. conversation_members
export interface ConversationMember {
  id: string;
  conversation_id: string;
  profile_id: string;
  joined_at: string;
}

// 14. messages
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string; // profile_id or company_id
  sender_type: 'company' | 'candidate';
  sender_name: string;
  content: string;
  attachments?: { name: string; url: string; type: string }[];
  is_read: boolean;
  sent_at: string;
}

// 15. interviews
export interface Interview {
  id: string;
  application_id: string;
  application?: Application;
  job_id: string;
  job_title: string;
  candidate_id: string;
  candidate_name: string;
  candidate_avatar?: string;
  recruiter_name: string;
  date: string;
  time: string;
  duration_minutes: number;
  meeting_link: string;
  location: string;
  notes?: string;
  status: InterviewStatus;
  created_at: string;
}

// 16. notifications
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

// 17. reports
export interface Report {
  id: string;
  reporter_id: string;
  target_type: 'job' | 'profile' | 'application';
  target_id: string;
  reason: string;
  details?: string;
  status: 'open' | 'investigating' | 'resolved';
  created_at: string;
}
