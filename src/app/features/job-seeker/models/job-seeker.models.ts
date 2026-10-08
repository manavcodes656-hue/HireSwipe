export interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  phone: string;
  role: 'job_seeker';
  created_at: string;
  updated_at: string;
}

export interface JobSeekerProfile {
  id: string;
  profile_id: string;
  headline: string;
  bio: string;
  current_job_title: string;
  current_company: string;
  years_of_experience: number;
  availability: string; // e.g. 'Immediate', '15 Days', '30 Days'
  location: string;
  city: string;
  state: string;
  country: string;
  linkedin_url: string;
  github_url: string;
  portfolio_url: string;
  onboarding_completed: boolean;
  profile_completion_pct: number;
}

export interface Resume {
  id: string;
  job_seeker_profile_id: string;
  file_name: string;
  file_size: string;
  file_type: string;
  file_url: string;
  is_primary: boolean;
  uploaded_at: string;
}

export interface Education {
  id: string;
  job_seeker_profile_id: string;
  institution: string;
  degree: string;
  field_of_study: string;
  start_date: string;
  end_date: string;
  grade: string;
  description: string;
}

export interface Experience {
  id: string;
  job_seeker_profile_id: string;
  company: string;
  job_title: string;
  employment_type: string; // Full-time, Part-time, Contract, Internship
  location: string;
  start_date: string;
  end_date: string;
  currently_working: boolean;
  description: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
}

export type ProficiencyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface JobSeekerSkill {
  id: string;
  job_seeker_profile_id: string;
  skill_id: string;
  skill_name: string;
  proficiency_level: ProficiencyLevel;
  years_of_experience: number;
}

export interface JobSeekerPreference {
  id: string;
  job_seeker_profile_id: string;
  preferred_job_title: string;
  preferred_location: string;
  remote_preference: 'remote' | 'hybrid' | 'on_site' | 'any';
  employment_type: 'full_time' | 'part_time' | 'contract' | 'internship';
  min_salary: number;
  max_salary: number;
  experience_level: 'entry' | 'mid' | 'senior' | 'lead' | 'executive';
  preferred_industries: string[];
  willing_to_relocate: boolean;
}

export interface JobSwipe {
  id: string;
  job_seeker_profile_id: string;
  job_id: string;
  direction: 'like' | 'pass';
  created_at: string;
}

export interface Match {
  id: string;
  job_seeker_profile_id: string;
  job_id: string;
  company_id: string;
  match_date: string;
  status: 'active' | 'archived';
  company_name: string;
  company_logo: string;
  job_title: string;
  job_location: string;
  match_score: string;
}

export type ApplicationStatus =
  | 'pending'
  | 'reviewing'
  | 'shortlisted'
  | 'interview'
  | 'rejected'
  | 'accepted'
  | 'withdrawn';

export interface ApplicationStatusHistory {
  id: string;
  application_id: string;
  status: ApplicationStatus;
  comment: string;
  changed_at: string;
}

export interface Application {
  id: string;
  job_seeker_profile_id: string;
  job_id: string;
  company_id: string;
  company_name: string;
  company_logo: string;
  job_title: string;
  job_location: string;
  salary_range: string;
  status: ApplicationStatus;
  applied_at: string;
  updated_at: string;
  status_history?: ApplicationStatusHistory[];
}

export interface SavedJob {
  id: string;
  job_seeker_profile_id: string;
  job_id: string;
  saved_at: string;
  job_title: string;
  company_name: string;
  company_logo: string;
  location: string;
  salary_range: string;
  employment_type: string;
}

export interface ConversationMember {
  id: string;
  conversation_id: string;
  user_id: string;
  unread_count: number;
}

export interface Conversation {
  id: string;
  match_id: string;
  company_name: string;
  company_logo: string;
  job_title: string;
  created_at: string;
  updated_at: string;
  last_message_snippet: string;
  last_message_at: string;
  unread_count: number;
}

export interface MessageAttachment {
  name: string;
  url: string;
  type: string;
  size: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  is_job_seeker: boolean;
  text: string;
  attachments?: MessageAttachment[];
  read_state: boolean;
  created_at: string;
}

export type InterviewStatus = 'upcoming' | 'completed' | 'cancelled';

export interface Interview {
  id: string;
  application_id: string;
  company_name: string;
  company_logo: string;
  job_title: string;
  date: string;
  time: string;
  duration_minutes: number;
  meeting_link: string;
  location: string;
  status: InterviewStatus;
  notes: string;
}

export type NotificationType =
  | 'new_match'
  | 'application_update'
  | 'new_message'
  | 'interview'
  | 'job_recommendation'
  | 'system';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  created_at: string;
  link_route: string;
}

export interface Job {
  id: string;
  title: string;
  company_id: string;
  company_name: string;
  company_logo: string;
  company_type: string;
  location: string;
  employment_type: string;
  salary_min: number;
  salary_max: number;
  salary_currency: string;
  salary_display: string;
  experience_level: string;
  remote_option: string;
  description: string;
  requirements: string[];
  skills: string[];
  match_score: string;
  posted_at: string;
}
