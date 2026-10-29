/**
 * JobSeekerService — Backend-wired service for the job-seeker feature.
 *
 * ARCHITECTURE:
 * Keeps the identical Angular Signal-based API (signal<Profile>, signal<Job[]>,
 * computed signals, and synchronous action signatures) so all existing
 * job-seeker components continue to function seamlessly.
 *
 * Backend integration:
 * - Subscribes to AuthService to automatically load live data from Supabase
 *   when authenticated.
 * - Action methods persist mutations to Supabase tables via core services
 *   (JobSeekerProfileService, MatchingService, ApplicationsService, JobsService,
 *   NotificationsService, MessagesService, ProfileService).
 * - Falls back cleanly to local state when unauthenticated or during offline usage.
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import {
  Profile,
  JobSeekerProfile,
  Resume,
  Education,
  Experience,
  JobSeekerSkill,
  JobSeekerPreference,
  Match,
  Application,
  SavedJob,
  Conversation,
  Message,
  Interview,
  Notification,
  Job,
  Skill,
  ProficiencyLevel,
  InterviewStatus,
} from '../models/job-seeker.models';

import { AuthService } from '../../../core/services/auth.service';
import { ProfileService } from '../../../core/services/profile.service';
import { JobSeekerProfileService } from '../../../core/services/job-seeker-profile.service';
import { JobsService } from '../../../core/services/jobs.service';
import { ApplicationsService } from '../../../core/services/applications.service';
import { MatchingService } from '../../../core/services/matching.service';
import { InterviewsService } from '../../../core/services/interviews.service';
import { NotificationsService } from '../../../core/services/notifications.service';
import { MessagesService } from '../../../core/services/messages.service';

/**
 * Normalizes UI employment type strings to Postgres enum values.
 */
function mapEmploymentTypeToDb(type?: string | null): 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance' | null {
  if (!type) return null;
  const t = type.toLowerCase().replace(/[\s-]/g, '_');
  if (t === 'full_time' || t === 'part_time' || t === 'contract' || t === 'internship' || t === 'freelance') {
    return t;
  }
  return 'full_time';
}

function formatSalary(min?: number | null, max?: number | null, currency?: string | null): string {
  if (min == null && max == null) return 'Not disclosed';
  const fmt = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const range = min != null && max != null ? `${fmt(min)}–${fmt(max)}` : fmt((min ?? max) as number);
  return `${currency ?? ''} ${range}`.trim();
}

/** Maps a published jobs row (with embedded relations) to the swipe-card Job model. No invented fields. */
export function mapPublishedJob(j: any): Job {
  return {
    id: j.id,
    title: j.title,
    company_id: j.company_id,
    company_name: j.companies?.name,
    company_logo: j.companies?.logo_url ?? null,
    company_type: j.companies?.industry ?? undefined,
    location: j.location,
    employment_type: String(j.employment_type ?? '').replace(/_/g, ' '),
    salary_min: j.salary_min,
    salary_max: j.salary_max,
    salary_currency: j.salary_currency,
    salary_display: formatSalary(j.salary_min, j.salary_max, j.salary_currency),
    experience_level: j.experience_level,
    remote_type: j.remote_type,
    remote_option: j.remote_type,
    description: j.description,
    requirements: (j.job_requirements ?? []).map((r: any) => r.requirement),
    skills: (j.job_skills ?? []).map((s: any) => s.skills?.name).filter(Boolean),
    posted_at: j.created_at,
    status: j.status,
    created_at: j.created_at,
    updated_at: j.updated_at,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SwipeOutcome {
  ok: boolean;
  error?: string;
}

function swipeErrorMessage(err: any): string {
  switch (err?.code) {
    case 'SWIPE_CONFLICT':
      return 'You already responded to this job differently.';
    case '42501':
      return 'You do not have permission to swipe on this job.';
    case '23503':
      return 'This job is no longer available.';
    default:
      return 'Could not save your swipe. Check your connection and try again.';
  }
}

/** Maps an `applications` row (with embedded job and company) to the candidate Application model. */
function mapApplicationRow(a: any): Application {
  return {
    id: a.id,
    job_seeker_id: a.job_seeker_id,
    job_id: a.job_id,
    company_id: a.company_id,
    company_name: a.companies?.name,
    company_logo: a.companies?.logo_url,
    job_title: a.jobs?.title,
    job_location: a.jobs?.location,
    salary_range: a.jobs?.salary_min ? `₹${a.jobs.salary_min / 100000}–${a.jobs.salary_max / 100000} LPA` : undefined,
    employment_type: a.jobs?.employment_type,
    status: a.status,
    applied_at: a.applied_at,
    updated_at: a.updated_at,
    cover_letter: a.cover_letter,
    resume_id: a.resume_id,
    match_score: a.match_score,
  };
}

/** User-facing text for a failed application insert (codes from the 004 insert trigger). */
function applicationErrorMessage(code?: string | null, message?: string | null): string {
  const reason = (message ?? '').replace(/^Application not allowed:\s*/i, '');
  if (/Missing mandatory profile fields/i.test(reason)) {
    return `Complete your profile before applying. ${reason.replace(/^Missing mandatory profile fields:\s*/i, 'Missing: ')}.`;
  }
  if (/deadline/i.test(reason)) return 'The application deadline for this job has passed.';
  if (/not currently accepting/i.test(reason)) return 'This job is no longer accepting applications.';
  if (code === '23503' || /Job not found/i.test(reason)) return 'This job is no longer available.';
  if (code === '42501') return 'You do not have permission to apply to this job.';
  return 'Could not create your application. Check your connection and try again.';
}
@Injectable({
  providedIn: 'root',
})
export class JobSeekerService {
  // ── Core Service Dependencies ───────────────────────────────────────────
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly jspService = inject(JobSeekerProfileService);
  private readonly jobsService = inject(JobsService);
  private readonly applicationsService = inject(ApplicationsService);
  private readonly matchingService = inject(MatchingService);
  private readonly interviewsService = inject(InterviewsService);
  private readonly notificationsService = inject(NotificationsService);
  private readonly messagesService = inject(MessagesService);

  private readonly swipesInFlight = new Map<string, Promise<SwipeOutcome>>();

  // ── Loading and Error Signals ───────────────────────────────────────────
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  private _loadedProfileId: string | null = null;

  // ── 1. Profile State ────────────────────────────────────────────────────
  readonly profile = signal<Profile>({
    id: 'p-101',
    user_id: 'u-101',
    email: 'krish.developer@hireswipe.io',
    full_name: 'Krish Sharma',
    avatar_url: '',
    phone: '+91 98765 43210',
    role: 'job_seeker',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  readonly jobSeekerProfile = signal<JobSeekerProfile>({
    id: 'jsp-101',
    profile_id: 'p-101',
    headline: 'Senior Full Stack Engineer | Angular, TypeScript, Node.js',
    bio: 'Passionate software engineer with 5+ years of building high-concurrency web apps, scalable microservices, and user-first web applications. Seeking impact-driven tech startup or enterprise roles.',
    current_job_title: 'Senior Frontend Developer',
    current_company: 'TechFlow Systems',
    experience_years: 5,
    years_of_experience: 5,
    availability: '15 Days',
    location: 'Bengaluru, Karnataka, India',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    linkedin_url: 'https://linkedin.com/in/krish-sharma-dev',
    github_url: 'https://github.com/krish-sharma-dev',
    portfolio_url: 'https://krishsharma.dev',
    salary_currency: 'INR',
    onboarding_completed: false,
    profile_completion_pct: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // ── 2. Resumes State ─────────────────────────────────────────────────────
  readonly resumes = signal<Resume[]>([
    {
      id: 'res-1',
      job_seeker_id: 'jsp-101',
      job_seeker_profile_id: 'jsp-101',
      file_name: 'Krish_Sharma_Senior_FullStack_Resume_2026.pdf',
      file_path: 'resumes/krish_resume_2026.pdf',
      file_size: '2.4 MB',
      file_type: 'application/pdf',
      file_url: '#',
      is_primary: true,
      created_at: '2026-09-28T10:30:00Z',
      uploaded_at: '2026-09-28T10:30:00Z',
    },
    {
      id: 'res-2',
      job_seeker_id: 'jsp-101',
      job_seeker_profile_id: 'jsp-101',
      file_name: 'Krish_Sharma_Frontend_Architect_CV.pdf',
      file_path: 'resumes/krish_cv_2026.pdf',
      file_size: '1.8 MB',
      file_type: 'application/pdf',
      file_url: '#',
      is_primary: false,
      created_at: '2026-08-15T14:20:00Z',
      uploaded_at: '2026-08-15T14:20:00Z',
    },
  ]);

  // ── 3. Education State ───────────────────────────────────────────────────
  readonly educationList = signal<Education[]>([
    {
      id: 'edu-1',
      job_seeker_id: 'jsp-101',
      job_seeker_profile_id: 'jsp-101',
      institution: 'Indian Institute of Technology (IIT), Madras',
      degree: 'Bachelor of Technology (B.Tech)',
      field_of_study: 'Computer Science and Engineering',
      start_date: '2017-08-01',
      end_date: '2021-05-30',
      grade: '8.9 CGPA',
      description: 'Specialized in Algorithms, Distributed Systems, and Web Engineering. Led the ACM Student Chapter.',
      created_at: '2021-06-01T00:00:00Z',
    },
  ]);

  // ── 4. Experience State ──────────────────────────────────────────────────
  readonly experienceList = signal<Experience[]>([
    {
      id: 'exp-1',
      job_seeker_id: 'jsp-101',
      job_seeker_profile_id: 'jsp-101',
      company_name: 'TechFlow Systems',
      company: 'TechFlow Systems',
      job_title: 'Senior Frontend Engineer',
      employment_type: 'Full-time',
      location: 'Bengaluru, India (Hybrid)',
      start_date: '2023-03-01',
      end_date: 'Present',
      is_current: true,
      currently_working: true,
      description: 'Architected high-performance enterprise dashboards serving 500k daily active users. Reduced initial load time by 42% through lazy loading and modern state architecture.',
      created_at: '2023-03-01T00:00:00Z',
    },
    {
      id: 'exp-2',
      job_seeker_id: 'jsp-101',
      job_seeker_profile_id: 'jsp-101',
      company_name: 'Innovate Labs',
      company: 'Innovate Labs',
      job_title: 'Full Stack Software Engineer',
      employment_type: 'Full-time',
      location: 'Hyderabad, India',
      start_date: '2021-06-01',
      end_date: '2023-02-28',
      is_current: false,
      currently_working: false,
      description: 'Developed RESTful microservices in Node.js & PostgreSQL, paired with Angular frontend integrations. Implemented automated CI/CD pipelines.',
      created_at: '2021-06-01T00:00:00Z',
    },
  ]);

  // ── 5. Skills State ──────────────────────────────────────────────────────
  readonly catalogSkills = signal<Skill[]>([
    { id: 'sk-1', name: 'Angular', category: 'Frontend' },
    { id: 'sk-2', name: 'TypeScript', category: 'Programming Languages' },
    { id: 'sk-3', name: 'RxJS', category: 'Frontend' },
    { id: 'sk-4', name: 'Node.js', category: 'Backend' },
    { id: 'sk-5', name: 'PostgreSQL', category: 'Database' },
    { id: 'sk-6', name: 'System Design', category: 'Architecture' },
    { id: 'sk-7', name: 'REST APIs', category: 'Backend' },
    { id: 'sk-8', name: 'TailwindCSS', category: 'Frontend' },
    { id: 'sk-9', name: 'Docker', category: 'DevOps' },
    { id: 'sk-10', name: 'GraphQL', category: 'Backend' },
    { id: 'sk-11', name: 'React', category: 'Frontend' },
    { id: 'sk-12', name: 'Python', category: 'Programming Languages' },
    { id: 'sk-13', name: 'Vue.js', category: 'Frontend' },
    { id: 'sk-14', name: 'Next.js', category: 'Frontend' },
    { id: 'sk-15', name: 'JavaScript', category: 'Programming Languages' },
    { id: 'sk-16', name: 'HTML5 & CSS3', category: 'Frontend' },
    { id: 'sk-17', name: 'Express.js', category: 'Backend' },
    { id: 'sk-18', name: 'Java', category: 'Programming Languages' },
    { id: 'sk-19', name: 'Spring Boot', category: 'Backend' },
    { id: 'sk-20', name: 'Django', category: 'Backend' },
  ]);

  readonly userSkills = signal<JobSeekerSkill[]>([
    { id: 'jsk-1', job_seeker_id: 'jsp-101', job_seeker_profile_id: 'jsp-101', skill_id: 'sk-1', skill_name: 'Angular', proficiency_level: 'expert', years_experience: 5, years_of_experience: 5 },
    { id: 'jsk-2', job_seeker_id: 'jsp-101', job_seeker_profile_id: 'jsp-101', skill_id: 'sk-2', skill_name: 'TypeScript', proficiency_level: 'expert', years_experience: 5, years_of_experience: 5 },
    { id: 'jsk-3', job_seeker_id: 'jsp-101', job_seeker_profile_id: 'jsp-101', skill_id: 'sk-3', skill_name: 'RxJS', proficiency_level: 'advanced', years_experience: 4, years_of_experience: 4 },
    { id: 'jsk-4', job_seeker_id: 'jsp-101', job_seeker_profile_id: 'jsp-101', skill_id: 'sk-4', skill_name: 'Node.js', proficiency_level: 'advanced', years_experience: 4, years_of_experience: 4 },
    { id: 'jsk-5', job_seeker_id: 'jsp-101', job_seeker_profile_id: 'jsp-101', skill_id: 'sk-5', skill_name: 'PostgreSQL', proficiency_level: 'intermediate', years_experience: 3, years_of_experience: 3 },
    { id: 'jsk-6', job_seeker_id: 'jsp-101', job_seeker_profile_id: 'jsp-101', skill_id: 'sk-6', skill_name: 'System Design', proficiency_level: 'advanced', years_experience: 3, years_of_experience: 3 },
  ]);

  // ── 6. Preferences State ─────────────────────────────────────────────────
  readonly preferences = signal<JobSeekerPreference>({
    id: 'jspref-101',
    job_seeker_id: 'jsp-101',
    job_seeker_profile_id: 'jsp-101',
    preferred_job_title: 'Senior Full Stack / Lead Frontend Engineer',
    preferred_location: 'Bengaluru, India',
    remote_preference: 'hybrid',
    employment_type: 'full_time',
    minimum_salary: 2800000,
    maximum_salary: 4500000,
    min_salary: 2800000,
    max_salary: 4500000,
    experience_level: 'senior',
    preferred_industries: ['FinTech', 'SaaS', 'E-commerce', 'AI/ML'],
    willing_to_relocate: true,
    created_at: new Date().toISOString(),
  });

  // ── 7. Discovery / Swipe Deck State ──────────────────────────────────────
  // Populated only from Supabase by loadJobFeed(); never seeded with fake jobs.
  readonly jobs = signal<Job[]>([]);
  readonly feedLoading = signal<boolean>(false);
  readonly feedError = signal<string | null>(null);

  readonly swipedJobIds = signal<Set<string>>(new Set());

  // ── 8. Matches State ─────────────────────────────────────────────────────
  readonly matches = signal<Match[]>([
    {
      id: 'match-1',
      job_seeker_id: 'jsp-101',
      job_seeker_profile_id: 'jsp-101',
      job_id: 'job-101',
      company_id: 'comp-101',
      matched_at: '2026-10-04T14:30:00Z',
      match_date: '2026-10-04T14:30:00Z',
      status: 'active',
      company_name: 'Google India',
      company_logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg',
      job_title: 'Senior Full Stack Engineer',
      job_location: 'Bengaluru (Hybrid)',
      match_score: '96%',
    },
    {
      id: 'match-2',
      job_seeker_id: 'jsp-101',
      job_seeker_profile_id: 'jsp-101',
      job_id: 'job-102',
      company_id: 'comp-102',
      matched_at: '2026-10-02T11:15:00Z',
      match_date: '2026-10-02T11:15:00Z',
      status: 'active',
      company_name: 'Microsoft',
      company_logo: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg',
      job_title: 'Lead Frontend Systems Architect',
      job_location: 'Hyderabad (Hybrid)',
      match_score: '98%',
    },
  ]);

  // ── 9. Applications State ────────────────────────────────────────────────
  readonly applications = signal<Application[]>([
    {
      id: 'app-1',
      job_seeker_id: 'jsp-101',
      job_seeker_profile_id: 'jsp-101',
      job_id: 'job-102',
      company_id: 'comp-102',
      company_name: 'Microsoft',
      company_logo: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg',
      job_title: 'Lead Frontend Systems Architect',
      job_location: 'Hyderabad (Hybrid)',
      salary_range: '₹35–52 LPA',
      status: 'interview',
      applied_at: '2026-10-02T12:00:00Z',
      updated_at: '2026-10-04T16:00:00Z',
      status_history: [
        { id: 'ash-1', application_id: 'app-1', status: 'pending', comment: 'Application submitted via HireSwipe', changed_at: '2026-10-02T12:00:00Z' },
        { id: 'ash-2', application_id: 'app-1', status: 'reviewing', comment: 'Profile under review by Senior Talent Acquisition Lead', changed_at: '2026-10-03T10:00:00Z' },
        { id: 'ash-3', application_id: 'app-1', status: 'shortlisted', comment: 'Candidate shortlisted for technical round', changed_at: '2026-10-03T17:30:00Z' },
        { id: 'ash-4', application_id: 'app-1', status: 'interview', comment: 'System Design Interview scheduled', changed_at: '2026-10-04T16:00:00Z' },
      ],
    },
    {
      id: 'app-2',
      job_seeker_id: 'jsp-101',
      job_seeker_profile_id: 'jsp-101',
      job_id: 'job-101',
      company_id: 'comp-101',
      company_name: 'Google India',
      company_logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg',
      job_title: 'Senior Full Stack Engineer',
      job_location: 'Bengaluru (Hybrid)',
      salary_range: '₹32–48 LPA',
      status: 'shortlisted',
      applied_at: '2026-10-04T15:00:00Z',
      updated_at: '2026-10-05T09:30:00Z',
      status_history: [
        { id: 'ash-5', application_id: 'app-2', status: 'pending', comment: 'Mutual Swipe Match converted to Application', changed_at: '2026-10-04T15:00:00Z' },
        { id: 'ash-6', application_id: 'app-2', status: 'shortlisted', comment: 'Shortlisted by hiring manager', changed_at: '2026-10-05T09:30:00Z' },
      ],
    },
  ]);

  // ── 10. Saved Jobs State ─────────────────────────────────────────────────
  readonly savedJobs = signal<SavedJob[]>([
    {
      id: 'sj-1',
      job_seeker_id: 'jsp-101',
      job_seeker_profile_id: 'jsp-101',
      job_id: 'job-3',
      created_at: '2026-10-04T18:20:00Z',
      saved_at: '2026-10-04T18:20:00Z',
      job_title: 'Staff UI Platform Engineer',
      company_name: 'Stripe India',
      company_logo: 'https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg',
      location: 'Remote / Bengaluru',
      salary_range: '₹38–58 LPA',
      employment_type: 'Full-time',
    },
  ]);

  // ── 11. Conversations & Messages State ───────────────────────────────────
  readonly conversations = signal<Conversation[]>([
    {
      id: 'conv-1',
      match_id: 'match-1',
      company_name: 'Google India',
      company_logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg',
      job_title: 'Senior Full Stack Engineer',
      created_at: '2026-10-04T14:35:00Z',
      updated_at: '2026-10-05T10:30:00Z',
      last_message_snippet: 'We loved your experience with Angular architecture! Are you free for an introductory call tomorrow?',
      last_message_at: '10:30 AM',
      unread_count: 1,
    },
    {
      id: 'conv-2',
      match_id: 'match-2',
      company_name: 'Microsoft',
      company_logo: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg',
      job_title: 'Lead Frontend Systems Architect',
      created_at: '2026-10-02T11:20:00Z',
      updated_at: '2026-10-04T16:05:00Z',
      last_message_snippet: 'The interview invitation has been sent for Oct 8 at 3:00 PM IST.',
      last_message_at: 'Yesterday',
      unread_count: 0,
    },
  ]);

  readonly messages = signal<Record<string, Message[]>>({
    'conv-1': [
      {
        id: 'm-101',
        conversation_id: 'conv-1',
        sender_id: 'comp-101',
        sender_name: 'Ananya Roy (Google Talent Lead)',
        is_job_seeker: false,
        message: 'Hi Krish! Great to connect. We saw your swipe match and were super impressed by your senior frontend experience.',
        text: 'Hi Krish! Great to connect. We saw your swipe match and were super impressed by your senior frontend experience.',
        is_read: true,
        read_state: true,
        created_at: 'Yesterday, 2:40 PM',
      },
      {
        id: 'm-102',
        conversation_id: 'conv-1',
        sender_id: 'u-101',
        sender_name: 'Krish Sharma',
        is_job_seeker: true,
        message: 'Hi Ananya! Thanks for reaching out. I have been following Google Cloud platform developments closely and would love to contribute.',
        text: 'Hi Ananya! Thanks for reaching out. I have been following Google Cloud platform developments closely and would love to contribute.',
        is_read: true,
        read_state: true,
        created_at: 'Yesterday, 3:15 PM',
      },
    ],
  });

  // ── 12. Interviews State ─────────────────────────────────────────────────
  readonly interviews = signal<Interview[]>([
    {
      id: 'int-1',
      application_id: 'app-1',
      company_name: 'Microsoft',
      company_logo: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg',
      job_title: 'Lead Frontend Systems Architect',
      scheduled_at: '2026-10-08T15:00:00Z',
      date: '2026-10-08',
      time: '15:00 - 16:00 IST',
      duration_minutes: 60,
      meeting_url: 'https://teams.microsoft.com/l/meetup-join/hireswipe-msft-interview',
      meeting_link: 'https://teams.microsoft.com/l/meetup-join/hireswipe-msft-interview',
      location: 'Microsoft Teams Video Call',
      status: 'upcoming',
      notes: 'Focus areas: Web Performance Optimization, Micro-frontends, Component design patterns.',
      created_at: new Date().toISOString(),
    },
    {
      id: 'int-2',
      application_id: 'app-1',
      company_name: 'Microsoft',
      company_logo: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg',
      job_title: 'Lead Frontend Systems Architect',
      scheduled_at: '2026-10-03T11:00:00Z',
      date: '2026-10-03',
      time: '11:00 - 11:45 IST',
      duration_minutes: 45,
      meeting_url: 'https://teams.microsoft.com/l/meetup-join/hireswipe-msft-screen',
      meeting_link: 'https://teams.microsoft.com/l/meetup-join/hireswipe-msft-screen',
      location: 'Microsoft Teams Video Call',
      status: 'completed',
      notes: 'Initial recruiter screening. Passed with positive feedback.',
      created_at: new Date().toISOString(),
    },
  ]);

  // ── 13. Notifications State ──────────────────────────────────────────────
  readonly notifications = signal<Notification[]>([
    {
      id: 'notif-1',
      user_id: 'u-101',
      title: 'New Message from Google',
      message: 'Ananya Roy sent you a message regarding Senior Full Stack Engineer.',
      type: 'new_message',
      is_read: false,
      read: false,
      created_at: '10:30 AM',
      link: '/job-seeker/messages',
      link_route: '/job-seeker/messages',
    },
    {
      id: 'notif-2',
      user_id: 'u-101',
      title: 'Interview Scheduled',
      message: 'Microsoft scheduled a Technical System Design Interview for Oct 8, 3:00 PM.',
      type: 'interview',
      is_read: false,
      read: false,
      created_at: 'Yesterday',
      link: '/job-seeker/interviews',
      link_route: '/job-seeker/interviews',
    },
    {
      id: 'notif-3',
      user_id: 'u-101',
      title: 'Application Status Updated',
      message: 'Your application for Google India has been Shortlisted!',
      type: 'application_update',
      is_read: true,
      read: true,
      created_at: 'Oct 4',
      link: '/job-seeker/applications',
      link_route: '/job-seeker/applications',
    },
  ]);

  // ── Computed Signals ─────────────────────────────────────────────────────
  readonly unreadNotificationCount = computed(() => {
    return this.notifications().filter((n) => !n.is_read && !n.read).length;
  });

  readonly unreadMessageCount = computed(() => {
    return this.conversations().reduce((acc, c) => acc + (c.unread_count || 0), 0);
  });

  readonly availableDeckJobs = computed(() => {
    const swiped = this.swipedJobIds();
    return this.jobs().filter((j) => !swiped.has(j.id));
  });

  constructor() {
    this.recalculateProfileCompletion();
    // When an authenticated session is detected, attempt to load live data
    const userId = this.authService.getCurrentUserId();
    if (userId) {
      this.initialize(userId);
    }
  }

  // ── Onboarding Completion State Helpers ─────────────────────────────────

  /**
   * Returns true only when the authoritative Job Seeker profile has
   * onboarding_completed === true or verified via cached user session.
   */
  isOnboardingCompleted(): boolean {
    if (this._loadedProfileId) {
      return this.jobSeekerProfile()?.onboarding_completed === true;
    }
    if (this.jobSeekerProfile()?.onboarding_completed === true) {
      return true;
    }
    const uid = this.authService.getCurrentUserId() || this.profile().id;
    if (uid) {
      try {
        const cached = localStorage.getItem(`hireswipe_js_onboarding_completed_${uid}`);
        if (cached === 'true') {
          return true;
        }
      } catch {}
    }
    return false;
  }

  /**
   * Updates the onboarding completed state in memory and cached storage.
   */
  setOnboardingCompleted(completed: boolean): void {
    const uid = this.authService.getCurrentUserId() || this.profile().id;
    if (uid) {
      try {
        localStorage.setItem(`hireswipe_js_onboarding_completed_${uid}`, completed ? 'true' : 'false');
      } catch {}
    }
    this.jobSeekerProfile.update((current) => ({
      ...current,
      onboarding_completed: completed,
    }));
    this.recalculateProfileCompletion();
  }

  /**
   * Ensures the profile for the target or currently authenticated user is loaded.
   * Resolves when data has finished loading. Returns false if not authenticated
   * or if loading encountered a fatal error.
   */
  async ensureProfileLoaded(profileId?: string): Promise<boolean> {
    const targetId = profileId || this.authService.getCurrentUserId();
    if (!targetId) {
      return false;
    }

    // If already loaded for this user and not loading, return immediately
    if (this._loadedProfileId === targetId && !this.loading()) {
      return !this.error();
    }

    // Account switch detected
    if (this._loadedProfileId && this._loadedProfileId !== targetId) {
      this.resetState();
    }

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Profile loading timed out')), 1500)
      );
      await Promise.race([this.initialize(targetId), timeoutPromise]);
    } catch (err: any) {
      console.warn('[JobSeekerService] ensureProfileLoaded timeout or error:', err?.message || err);
      this.loading.set(false);
      this._loadedProfileId = targetId;
      return false;
    }

    return !this.error();
  }

  /**
   * Normalizes UI employment type strings to Postgres enum values.
   */
  mapEmploymentTypeToDb(type?: string | null): 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance' | null {
    return mapEmploymentTypeToDb(type);
  }

  /**
   * Resets the job seeker profile and loaded state (e.g. on logout or account switch).
   */
  resetState(): void {
    const uid = this._loadedProfileId || this.authService.getCurrentUserId() || this.profile().id;
    if (uid) {
      try {
        localStorage.removeItem(`hireswipe_js_onboarding_completed_${uid}`);
      } catch {}
    }
    this._loadedProfileId = null;
    this.error.set(null);
    this.loading.set(false);
    this.educationList.set([]);
    this.experienceList.set([]);
    this.resumes.set([]);
    this.userSkills.set([]);
    this.jobs.set([]);
    this.swipedJobIds.set(new Set());
    this.feedLoading.set(false);
    this.feedError.set(null);
    this.jobSeekerProfile.set({
      id: '',
      profile_id: '',
      headline: '',
      bio: '',
      current_job_title: '',
      current_company: '',
      experience_years: 0,
      years_of_experience: 0,
      availability: '',
      location: '',
      city: '',
      state: '',
      country: '',
      linkedin_url: '',
      github_url: '',
      portfolio_url: '',
      salary_currency: 'INR',
      onboarding_completed: false,
      profile_completion_pct: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // ── Backend Initialization ───────────────────────────────────────────────

  async initialize(profileId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      // 1. Fetch public.profiles
      const prof = await this.profileService.getProfile(profileId);
      if (prof) {
        this.profile.set({
          id: prof.id,
          user_id: prof.id,
          email: prof.email,
          full_name: prof.full_name ?? '',
          first_name: prof.first_name,
          last_name: prof.last_name,
          phone: prof.phone,
          avatar_url: prof.avatar_url,
          headline: (prof as any).headline ?? null,
          bio: (prof as any).bio ?? null,
          role: prof.role as 'job_seeker',
          created_at: prof.created_at,
          updated_at: prof.updated_at,
        });
      }

      // 2. Fetch job_seeker_profiles
      const jsp = await this.jspService.getJobSeekerProfile(profileId);
      if (jsp) {
        this._loadedProfileId = profileId;
        this.jobSeekerProfile.set({
          id: jsp.id,
          profile_id: jsp.profile_id,
          headline: jsp.headline,
          bio: jsp.bio,
          current_job_title: jsp.current_job_title,
          current_company: jsp.current_company,
          experience_years: jsp.experience_years,
          years_of_experience: jsp.experience_years,
          availability: jsp.availability,
          location: jsp.location,
          city: jsp.city,
          state: jsp.state,
          country: jsp.country,
          linkedin_url: jsp.linkedin_url,
          github_url: jsp.github_url,
          portfolio_url: jsp.portfolio_url,
          phone: jsp.phone,
          date_of_birth: jsp.date_of_birth,
          expected_salary_min: jsp.expected_salary_min,
          expected_salary_max: jsp.expected_salary_max,
          salary_currency: jsp.salary_currency,
          resume_url: jsp.resume_url,
          onboarding_completed: jsp.onboarding_completed === true,
          profile_completion_pct: jsp.profile_completion_pct ?? 0,
          created_at: jsp.created_at,
          updated_at: jsp.updated_at,
        });

        // 3. Parallel fetch child collections
        const [
          resumes,
          education,
          experience,
          userSkills,
          prefs,
          matches,
          apps,
          saved,
          interviews,
          catalog,
        ] = await Promise.all([
          this.jspService.getResumes(jsp.id),
          this.jspService.getEducation(jsp.id),
          this.jspService.getExperience(jsp.id),
          this.jspService.getUserSkills(jsp.id),
          this.jspService.getPreferences(jsp.id),
          this.matchingService.getJobSeekerMatches(jsp.id),
          this.applicationsService.getJobSeekerApplications(jsp.id),
          this.jobsService.getSavedJobs(jsp.id),
          this.interviewsService.getJobSeekerInterviews(jsp.id),
          this.jspService.getSkillsCatalog(),
        ]);

        if (resumes.length > 0) {
          this.resumes.set(
            resumes.map((r) => ({
              id: r.id,
              job_seeker_id: r.job_seeker_id,
              job_seeker_profile_id: r.job_seeker_id,
              file_name: r.file_name,
              file_path: r.file_path,
              file_size: r.file_size ? `${(r.file_size / 1024 / 1024).toFixed(1)} MB` : null,
              mime_type: r.mime_type,
              file_type: r.mime_type,
              file_url: '#',
              is_primary: r.is_primary,
              created_at: r.created_at,
              uploaded_at: r.created_at,
            }))
          );
        }

        if (education.length > 0) {
          this.educationList.set(
            education.map((e) => ({
              id: e.id,
              job_seeker_id: e.job_seeker_id,
              job_seeker_profile_id: e.job_seeker_id,
              institution: e.institution,
              degree: e.degree,
              field_of_study: e.field_of_study,
              start_date: e.start_date,
              end_date: e.end_date,
              grade: e.grade,
              description: e.description,
              created_at: e.created_at,
            }))
          );
        }

        if (experience.length > 0) {
          this.experienceList.set(
            experience.map((exp) => ({
              id: exp.id,
              job_seeker_id: exp.job_seeker_id,
              job_seeker_profile_id: exp.job_seeker_id,
              company_name: exp.company_name,
              company: exp.company_name,
              job_title: exp.job_title,
              employment_type: exp.employment_type,
              location: exp.location,
              start_date: exp.start_date,
              end_date: exp.end_date,
              is_current: exp.is_current,
              currently_working: exp.is_current,
              description: exp.description,
              created_at: exp.created_at,
            }))
          );
        }

        if (userSkills.length > 0) {
          this.userSkills.set(
            userSkills.map((s) => ({
              id: s.skill_id,
              job_seeker_id: s.job_seeker_id,
              job_seeker_profile_id: s.job_seeker_id,
              skill_id: s.skill_id,
              skill_name: s.skill_name,
              proficiency_level: s.proficiency_level as any,
              years_experience: s.years_experience,
              years_of_experience: s.years_experience,
            }))
          );
        }

        if (prefs) {
          this.preferences.set({
            id: prefs.id,
            job_seeker_id: prefs.job_seeker_id,
            job_seeker_profile_id: prefs.job_seeker_id,
            preferred_job_title: prefs.preferred_job_title,
            preferred_location: prefs.preferred_location,
            remote_preference: prefs.remote_preference as any,
            employment_type: prefs.employment_type as any,
            minimum_salary: prefs.minimum_salary,
            maximum_salary: prefs.maximum_salary,
            min_salary: prefs.minimum_salary,
            max_salary: prefs.maximum_salary,
            experience_level: prefs.experience_level,
            preferred_industries: prefs.preferred_industries ?? [],
            willing_to_relocate: prefs.willing_to_relocate,
            created_at: prefs.created_at,
          });
        }

        if (matches.length > 0) {
          this.matches.set(
            matches.map((m: any) => ({
              id: m.id,
              job_seeker_id: m.job_seeker_id,
              job_id: m.job_id,
              company_id: m.company_id,
              matched_at: m.matched_at,
              match_date: m.matched_at,
              status: m.status,
              match_score: m.match_score ? `${Math.round(m.match_score)}%` : '90%',
              company_name: m.jobs?.companies?.name ?? 'Company',
              company_logo: m.jobs?.companies?.logo_url,
              job_title: m.jobs?.title,
              job_location: m.jobs?.location,
            }))
          );
        }

        if (apps.length > 0) {
          this.applications.set(apps.map(mapApplicationRow));
        }

        if (saved.length > 0) {
          this.savedJobs.set(
            saved.map((s: any) => ({
              id: s.id,
              job_seeker_id: s.job_seeker_id,
              job_id: s.job_id,
              created_at: s.created_at,
              saved_at: s.created_at,
              job_title: s.jobs?.title,
              company_name: s.jobs?.companies?.name,
              company_logo: s.jobs?.companies?.logo_url,
              location: s.jobs?.location,
              employment_type: s.jobs?.employment_type,
              salary_range: s.jobs?.salary_min ? `₹${s.jobs.salary_min / 100000}–${s.jobs.salary_max / 100000} LPA` : undefined,
            }))
          );
        }

        if (interviews.length > 0) {
          this.interviews.set(
            interviews.map((i: any) => {
              const dt = new Date(i.scheduled_at);
              return {
                id: i.id,
                application_id: i.application_id,
                company_name: i.applications?.companies?.name,
                company_logo: i.applications?.companies?.logo_url,
                job_title: i.applications?.jobs?.title,
                title: i.title,
                scheduled_at: i.scheduled_at,
                date: dt.toISOString().split('T')[0],
                time: dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                duration_minutes: i.duration_minutes,
                meeting_url: i.meeting_url,
                meeting_link: i.meeting_url,
                location: i.location,
                status: (i.status === 'scheduled' ? 'upcoming' : i.status) as InterviewStatus,
                notes: i.description ?? '',
                created_at: i.created_at,
              };
            })
          );
        }

        if (catalog.length > 0) {
          this.catalogSkills.set(catalog);
        }

        // Feed has its own loading/error state and must not block profile init.
        void this.loadJobFeed(jsp.id);
      } else {
        // Missing job_seeker_profiles record -> check if already completed in cache
        const uid = profileId || this.authService.getCurrentUserId();
        const cachedCompleted = uid ? localStorage.getItem(`hireswipe_js_onboarding_completed_${uid}`) === 'true' : false;
        this._loadedProfileId = profileId;
        this.jobSeekerProfile.update((current) => ({
          ...current,
          id: '',
          profile_id: profileId,
          onboarding_completed: cachedCompleted,
        }));
        this.recalculateProfileCompletion();
      }

      // 4. Fetch notifications
      const notifs = await this.notificationsService.getNotifications(profileId);
      if (notifs.length > 0) {
        this.notifications.set(
          notifs.map((n) => ({
            id: n.id,
            profile_id: n.profile_id,
            user_id: n.profile_id,
            title: n.title,
            message: n.message,
            type: n.type as any,
            is_read: n.is_read,
            read: n.is_read,
            link: (n as any).link ?? null,
            link_route: (n as any).link ?? null,
            created_at: n.created_at,
          }))
        );
      }
    } catch (err: any) {
      console.error('[JobSeekerService] initialize failed:', err);
      this.error.set(err?.message ?? 'Failed to load job seeker data');
      this._loadedProfileId = null;
    } finally {
      this.loading.set(false);
    }
  }

  // ── Job Feed ─────────────────────────────────────────────────────────────

  /**
   * Loads published jobs the candidate has not finished with. Excluded ids are read
   * first so the exclusion happens in the query, not inside a fixed-size window.
   * A Like without an application (swipe saved, application failed) stays in the
   * deck so the Like can be retried. Errors are surfaced via feedError; the deck is
   * never filled with fake data.
   */
  async loadJobFeed(jobSeekerId: string = this.jobSeekerProfile().id): Promise<void> {
    if (!jobSeekerId) return;
    this.feedLoading.set(true);
    this.feedError.set(null);
    try {
      const [swiped, liked, applied] = await Promise.all([
        this.matchingService.getSwipedJobIds(jobSeekerId),
        this.matchingService.getLikedJobIds(jobSeekerId),
        this.applicationsService.getAppliedJobIds(jobSeekerId),
      ]);
      const appliedSet = new Set(applied);
      const unfinished = new Set(liked.filter((id) => !appliedSet.has(id)));
      const excluded = swiped.filter((id) => !unfinished.has(id));
      const rows = await this.jobsService.getPublishedJobs(30, 0, excluded);
      this.swipedJobIds.set(new Set(excluded));
      this.jobs.set(rows.map(mapPublishedJob));
    } catch (err: any) {
      console.error('[JobSeekerService] loadJobFeed failed:', err);
      this.jobs.set([]);
      this.feedError.set(err?.message || 'Failed to load jobs');
    } finally {
      this.feedLoading.set(false);
    }
  }
  // ── Profile Action Methods ───────────────────────────────────────────────

  /**
   * Helper to get current authenticated user ID from AuthService.
   */
  getCurrentUserId(): string | null {
    return this.authService.getCurrentUserId();
  }

  /**
   * Upload an avatar file to Supabase storage and update user profile.
   */
  async uploadAvatar(file: File): Promise<{ publicUrl: string | null; error: string | null }> {
    const userId = this.profile().id || this.authService.getCurrentUserId();
    if (!userId || userId.startsWith('p-')) {
      return { publicUrl: null, error: 'User not authenticated' };
    }
    const res = await this.profileService.uploadAvatar(userId, file);
    if (res.publicUrl) {
      this.profile.update((p) => ({ ...p, avatar_url: res.publicUrl }));
    }
    return res;
  }

  /**
   * Ensures that a parent public.job_seeker_profiles record exists in Supabase
   * and returns its primary key UUID (job_seeker_id) for foreign key relations.
   */
  async ensureJobSeekerProfileId(): Promise<string | null> {
    const profId = this.profile().id || this.authService.getCurrentUserId();
    if (!profId) return null;

    const currentJsp = this.jobSeekerProfile();
    if (currentJsp.id && currentJsp.id !== 'jsp-101') {
      return currentJsp.id;
    }

    try {
      const res = await this.jspService.upsertJobSeekerProfile(profId, {
        headline: currentJsp.headline || null,
        bio: currentJsp.bio || null,
        current_job_title: currentJsp.current_job_title || null,
        current_company: currentJsp.current_company || null,
        experience_years: currentJsp.experience_years ?? 0,
        availability: currentJsp.availability || null,
        location: currentJsp.location || null,
        city: currentJsp.city || null,
        state: currentJsp.state || null,
        country: currentJsp.country || 'India',
        phone: currentJsp.phone || null,
        onboarding_completed: false,
        profile_completion_pct: currentJsp.profile_completion_pct ?? 0,
      } as any);

      if (res?.data?.id) {
        this.jobSeekerProfile.update((item) => ({
          ...item,
          id: res.data!.id,
          profile_id: profId,
        }));
        return res.data.id;
      }
    } catch (err) {
      console.error('[JobSeekerService] ensureJobSeekerProfileId error:', err);
    }

    return null;
  }

  async updatePersonalProfile(data: Partial<Profile> & Partial<JobSeekerProfile>) {
    const prof = this.profile();
    const jsp = this.jobSeekerProfile();

    this.profile.update((p) => ({
      ...p,
      full_name: data.full_name ?? p.full_name,
      phone: data.phone ?? p.phone,
      avatar_url: data.avatar_url !== undefined ? data.avatar_url : p.avatar_url,
      updated_at: new Date().toISOString(),
    }));

    this.jobSeekerProfile.update((item) => ({
      ...item,
      location: data.location ?? item.location,
      city: data.city ?? item.city,
      state: data.state ?? item.state,
      country: data.country ?? item.country,
      phone: data.phone ?? item.phone,
      updated_at: new Date().toISOString(),
    }));

    this.recalculateProfileCompletion();

    // Persist to Supabase if authenticated
    const targetUserId = prof.id || this.authService.getCurrentUserId();
    if (targetUserId && !targetUserId.startsWith('p-')) {
      await this.profileService.updateProfile(targetUserId, {
        full_name: data.full_name ?? prof.full_name,
        phone: data.phone ?? prof.phone,
        avatar_url: data.avatar_url !== undefined ? data.avatar_url : prof.avatar_url,
      });

      const res = await this.jspService.upsertJobSeekerProfile(targetUserId, {
        location: data.location ?? jsp.location,
        city: data.city ?? jsp.city,
        state: data.state ?? jsp.state,
        country: data.country ?? jsp.country,
        phone: data.phone ?? jsp.phone,
        profile_completion_pct: this.jobSeekerProfile().profile_completion_pct,
      } as any);

      if (res?.data?.id) {
        this.jobSeekerProfile.update((item) => ({
          ...item,
          id: res.data!.id,
          profile_id: targetUserId,
        }));
      }
    }
  }

  async updateProfessionalProfile(data: Partial<JobSeekerProfile>) {
    const jsp = this.jobSeekerProfile();
    const experienceYears = data.experience_years ?? data.years_of_experience ?? jsp.experience_years;

    this.jobSeekerProfile.update((item) => ({
      ...item,
      ...data,
      experience_years: experienceYears,
      years_of_experience: experienceYears,
      updated_at: new Date().toISOString(),
    }));

    this.recalculateProfileCompletion();

    const targetUserId = jsp.profile_id || this.profile().id || this.authService.getCurrentUserId();
    if (targetUserId && !targetUserId.startsWith('p-')) {
      const res = await this.jspService.upsertJobSeekerProfile(targetUserId, {
        headline: data.headline ?? jsp.headline,
        bio: data.bio ?? jsp.bio,
        current_job_title: data.current_job_title ?? jsp.current_job_title,
        current_company: data.current_company ?? jsp.current_company,
        experience_years: experienceYears,
        availability: data.availability ?? jsp.availability,
        linkedin_url: data.linkedin_url ?? jsp.linkedin_url,
        github_url: data.github_url ?? jsp.github_url,
        portfolio_url: data.portfolio_url ?? jsp.portfolio_url,
        profile_completion_pct: this.jobSeekerProfile().profile_completion_pct,
      } as any);

      if (res?.data?.id) {
        this.jobSeekerProfile.update((item) => ({
          ...item,
          id: res.data!.id,
          profile_id: targetUserId,
        }));
      }
    }
  }

  // ── Education Action Methods ─────────────────────────────────────────────

  async addEducation(edu: Partial<Education> & { institution: string; degree: string; start_date: string }) {
    const jobSeekerId = await this.ensureJobSeekerProfileId();
    const jsp = this.jobSeekerProfile();
    const newEdu: Education = {
      institution: edu.institution,
      degree: edu.degree,
      field_of_study: edu.field_of_study,
      start_date: edu.start_date,
      end_date: edu.end_date,
      grade: edu.grade,
      description: edu.description,
      id: 'edu-' + Date.now(),
      job_seeker_id: jobSeekerId || jsp.id,
      job_seeker_profile_id: jobSeekerId || jsp.id,
      created_at: edu.created_at || new Date().toISOString(),
    };

    this.educationList.update((list) => [newEdu, ...list]);
    this.recalculateProfileCompletion();

    if (jobSeekerId && jobSeekerId !== 'jsp-101') {
      const res = await this.jspService.addEducation(jobSeekerId, {
        institution: edu.institution,
        degree: edu.degree,
        field_of_study: edu.field_of_study ?? null,
        start_date: edu.start_date,
        end_date: edu.end_date ?? null,
        grade: edu.grade ?? null,
        description: edu.description ?? null,
      });
      if (res.data) {
        this.educationList.update((list) =>
          list.map((item) => (item.id === newEdu.id ? { ...item, id: res.data!.id } : item))
        );
      }
    }
  }

  async updateEducation(id: string, eduData: Partial<Education>) {
    this.educationList.update((list) =>
      list.map((item) => (item.id === id ? { ...item, ...eduData } : item))
    );
    if (!id.startsWith('edu-')) {
      await this.jspService.updateEducation(id, eduData as any);
    }
  }

  async deleteEducation(id: string) {
    this.educationList.update((list) => list.filter((item) => item.id !== id));
    this.recalculateProfileCompletion();
    if (!id.startsWith('edu-')) {
      await this.jspService.deleteEducation(id);
    }
  }

  // ── Experience Action Methods ────────────────────────────────────────────

  async addExperience(exp: Partial<Experience> & { job_title: string; start_date: string }) {
    const jobSeekerId = await this.ensureJobSeekerProfileId();
    const jsp = this.jobSeekerProfile();
    const companyName = exp.company_name ?? exp.company ?? '';
    const isCurrent = exp.is_current ?? exp.currently_working ?? false;

    const newExp: Experience = {
      ...exp,
      id: 'exp-' + Date.now(),
      job_seeker_id: jobSeekerId || jsp.id,
      job_seeker_profile_id: jobSeekerId || jsp.id,
      company_name: companyName,
      company: companyName,
      is_current: isCurrent,
      currently_working: isCurrent,
      created_at: new Date().toISOString(),
    };

    this.experienceList.update((list) => [newExp, ...list]);
    this.recalculateProfileCompletion();

    if (jobSeekerId && jobSeekerId !== 'jsp-101') {
      const normEmpType = mapEmploymentTypeToDb(exp.employment_type);
      const res = await this.jspService.addExperience(jobSeekerId, {
        company_name: companyName,
        job_title: exp.job_title,
        employment_type: normEmpType,
        location: exp.location ?? null,
        start_date: exp.start_date,
        end_date: isCurrent || exp.end_date === 'Present' ? null : (exp.end_date ?? null),
        is_current: isCurrent,
        description: exp.description ?? null,
      });
      if (res.data) {
        this.experienceList.update((list) =>
          list.map((item) => (item.id === newExp.id ? { ...item, id: res.data!.id } : item))
        );
      }
    }
  }

  async updateExperience(id: string, expData: Partial<Experience>) {
    this.experienceList.update((list) =>
      list.map((item) => (item.id === id ? { ...item, ...expData } : item))
    );
    if (!id.startsWith('exp-')) {
      const isCurrent = expData.is_current ?? expData.currently_working;
      const payload: any = { ...expData };
      if (expData.employment_type) {
        payload.employment_type = mapEmploymentTypeToDb(expData.employment_type);
      }
      if (isCurrent || expData.end_date === 'Present') {
        payload.end_date = null;
      }
      await this.jspService.updateExperience(id, payload);
    }
  }

  async deleteExperience(id: string) {
    this.experienceList.update((list) => list.filter((item) => item.id !== id));
    this.recalculateProfileCompletion();
    if (!id.startsWith('exp-')) {
      await this.jspService.deleteExperience(id);
    }
  }

  // ── Skills Action Methods ────────────────────────────────────────────────

  async addUserSkill(skillName: string, proficiency: ProficiencyLevel | string | null, yoe: number) {
    const existing = this.userSkills().find((s) => s.skill_name?.toLowerCase() === skillName.toLowerCase());
    if (existing) return;

    const jobSeekerId = await this.ensureJobSeekerProfileId();
    const jsp = this.jobSeekerProfile();
    const skillCatalogItem = this.catalogSkills().find((s) => s.name.toLowerCase() === skillName.toLowerCase());
    let skillId = skillCatalogItem?.id ?? ('sk-' + Date.now());

    const newSkill: JobSeekerSkill = {
      id: skillId,
      job_seeker_id: jobSeekerId || jsp.id,
      job_seeker_profile_id: jobSeekerId || jsp.id,
      skill_id: skillId,
      skill_name: skillName,
      proficiency_level: proficiency,
      years_experience: yoe,
      years_of_experience: yoe,
    };

    this.userSkills.update((skills) => [...skills, newSkill]);
    this.recalculateProfileCompletion();

    if (jobSeekerId && jobSeekerId !== 'jsp-101') {
      if (!skillCatalogItem) {
        const skillRes = await this.jspService.getOrCreateSkill(skillName);
        if (skillRes.id) {
          skillId = skillRes.id;
          this.userSkills.update((skills) =>
            skills.map((s) => (s.id === newSkill.id ? { ...s, id: skillId, skill_id: skillId } : s))
          );
        }
      }
      if (skillId && !skillId.startsWith('sk-')) {
        await this.jspService.addUserSkill(jobSeekerId, skillId, proficiency as any, yoe);
      }
    }
  }

  async removeUserSkill(id: string) {
    const jsp = this.jobSeekerProfile();
    this.userSkills.update((skills) => skills.filter((s) => s.skill_id !== id && s.id !== id));
    this.recalculateProfileCompletion();

    if (jsp.id && !jsp.id.startsWith('jsp-')) {
      await this.jspService.removeUserSkill(jsp.id, id);
    }
  }

  updateUserSkill(id: string, proficiency: ProficiencyLevel | string | null, yoe: number) {
    this.userSkills.update((skills) =>
      skills.map((s) =>
        s.id === id || s.skill_id === id
          ? { ...s, proficiency_level: proficiency, years_experience: yoe, years_of_experience: yoe }
          : s
      )
    );
  }

  // ── Resumes Action Methods ───────────────────────────────────────────────

  async uploadResume(fileNameOrFile: string | File, fileSize?: string) {
    const isFirst = this.resumes().length === 0;
    const jobSeekerId = await this.ensureJobSeekerProfileId();
    const jsp = this.jobSeekerProfile();
    const userId = this.authService.getCurrentUserId();

    if (fileNameOrFile instanceof File && userId && jobSeekerId && !jobSeekerId.startsWith('jsp-')) {
      const res = await this.jspService.uploadResume(userId, jobSeekerId, fileNameOrFile);
      if (res.data) {
        const newResume: Resume = {
          id: res.data.id,
          job_seeker_id: res.data.job_seeker_id,
          job_seeker_profile_id: res.data.job_seeker_id,
          file_name: res.data.file_name,
          file_path: res.data.file_path,
          file_size: `${(res.data.file_size / 1024 / 1024).toFixed(1)} MB`,
          file_type: res.data.mime_type,
          file_url: '#',
          is_primary: res.data.is_primary,
          created_at: res.data.created_at,
          uploaded_at: res.data.created_at,
        };
        this.resumes.update((list) => [newResume, ...list]);
        this.recalculateProfileCompletion();
        return;
      }
    }

    const name = typeof fileNameOrFile === 'string' ? fileNameOrFile : fileNameOrFile.name;
    const size = fileSize ?? (fileNameOrFile instanceof File ? `${(fileNameOrFile.size / 1024 / 1024).toFixed(1)} MB` : '1.5 MB');
    const fallbackResume: Resume = {
      id: 'res-' + Date.now(),
      job_seeker_id: jobSeekerId || jsp.id,
      job_seeker_profile_id: jobSeekerId || jsp.id,
      file_name: name,
      file_path: 'resumes/' + name,
      file_size: size,
      file_type: 'application/pdf',
      file_url: '#',
      is_primary: isFirst,
      created_at: new Date().toISOString(),
      uploaded_at: new Date().toISOString(),
    };
    this.resumes.update((list) => [fallbackResume, ...list]);
    this.recalculateProfileCompletion();
  }

  async setPrimaryResume(id: string) {
    const jsp = this.jobSeekerProfile();
    this.resumes.update((list) => list.map((r) => ({ ...r, is_primary: r.id === id })));
    if (!id.startsWith('res-') && !jsp.id.startsWith('jsp-')) {
      await this.jspService.setPrimaryResume(id, jsp.id);
    }
  }

  async deleteResume(id: string) {
    const target = this.resumes().find((r) => r.id === id);
    this.resumes.update((list) => {
      const filtered = list.filter((r) => r.id !== id);
      if (filtered.length > 0 && !filtered.some((r) => r.is_primary)) {
        filtered[0].is_primary = true;
      }
      return filtered;
    });
    this.recalculateProfileCompletion();

    if (target && !id.startsWith('res-')) {
      await this.jspService.deleteResume(id, target.file_path);
    }
  }

  // ── Preferences Action Methods ───────────────────────────────────────────

  async updatePreferences(prefData: Partial<JobSeekerPreference>) {
    const minSalary = prefData.minimum_salary ?? prefData.min_salary;
    const maxSalary = prefData.maximum_salary ?? prefData.max_salary;

    this.preferences.update((p) => ({
      ...p,
      ...prefData,
      minimum_salary: minSalary ?? p.minimum_salary,
      min_salary: minSalary ?? p.min_salary,
      maximum_salary: maxSalary ?? p.maximum_salary,
      max_salary: maxSalary ?? p.max_salary,
    }));
    this.recalculateProfileCompletion();

    const jobSeekerId = await this.ensureJobSeekerProfileId();
    if (jobSeekerId && jobSeekerId !== 'jsp-101') {
      await this.jspService.upsertPreferences(jobSeekerId, {
        preferred_job_title: prefData.preferred_job_title ?? null,
        preferred_location: prefData.preferred_location ?? null,
        remote_preference: prefData.remote_preference ?? null,
        employment_type: prefData.employment_type ?? null,
        minimum_salary: minSalary ?? null,
        maximum_salary: maxSalary ?? null,
        experience_level: prefData.experience_level ?? null,
        preferred_industries: prefData.preferred_industries ?? null,
        willing_to_relocate: prefData.willing_to_relocate ?? false,
      });
    }
  }

  async completeOnboarding() {
    const profId = this.jobSeekerProfile().profile_id || this.profile().id || this.authService.getCurrentUserId();
    const finalPct = this.calculateCompletionPercentage();
    if (profId && !profId.startsWith('p-')) {
      const res = await this.jspService.upsertJobSeekerProfile(profId, {
        onboarding_completed: true,
        profile_completion_pct: finalPct,
      } as any);

      if (res?.error) {
        throw new Error(res.error);
      }
    }

    // Update local completion state and recalculate completion percentage
    this.setOnboardingCompleted(true);
  }

  /**
   * Complete multi-section onboarding persistence sequence.
   * Guarantees that:
   * 1. Profile and parent record are saved.
   * 2. Pending education, experience, skills, and preferences are flushed to DB.
   * 3. onboarding_completed = true is persisted ONLY after all required writes succeed.
   * 4. Local completion state is updated only after confirmed persistence.
   */
  async submitCompleteOnboarding(data: {
    personal: Partial<Profile> & Partial<JobSeekerProfile>;
    professional: Partial<JobSeekerProfile>;
    preferences: Partial<JobSeekerPreference>;
  }): Promise<{ success: boolean; error?: string }> {
    // A timeout or network failure is a real failure: never report success for unsaved data.
    const withTimeout = <T>(promise: Promise<T>, timeoutMs = 20000): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Network request timed out')), timeoutMs)
        ),
      ]);
    };

    try {
      const profId = this.profile().id || this.authService.getCurrentUserId();
      if (!profId) {
        throw new Error('User session not found. Please log in again.');
      }

      // Always update in-memory state and local cache immediately with entered values
      this.updatePersonalProfile(data.personal);
      this.updateProfessionalProfile(data.professional);
      this.updatePreferences(data.preferences);

      // If demo session or mock ID without live Supabase credentials, complete locally
      if (profId.startsWith('p-') || profId === 'u-101' || (profId.startsWith('u-') && !profId.startsWith('user-uuid'))) {
        await this.completeOnboarding();
        return { success: true };
      }

      // 1. Persist to public.profiles with network safety
      try {
        const profileRes = await withTimeout(this.profileService.updateProfile(profId, {
          full_name: data.personal.full_name ?? this.profile().full_name,
          phone: data.personal.phone ?? this.profile().phone,
          avatar_url: data.personal.avatar_url !== undefined ? data.personal.avatar_url : this.profile().avatar_url,
        }));
        if (profileRes?.error) {
          throw new Error(`Failed to save personal profile: ${profileRes.error}`);
        }
      } catch (err: any) {
        throw err;
      }

      // 2. Persist parent public.job_seeker_profiles record
      const experienceYears = data.professional.experience_years ?? data.professional.years_of_experience ?? this.jobSeekerProfile().experience_years ?? 0;
      const jspPayload: any = {
        headline: data.professional.headline ?? this.jobSeekerProfile().headline,
        bio: data.professional.bio ?? this.jobSeekerProfile().bio,
        current_job_title: data.professional.current_job_title ?? this.jobSeekerProfile().current_job_title,
        current_company: data.professional.current_company ?? this.jobSeekerProfile().current_company,
        experience_years: experienceYears,
        availability: data.professional.availability ?? this.jobSeekerProfile().availability,
        location: data.personal.location ?? this.jobSeekerProfile().location,
        city: data.personal.city ?? this.jobSeekerProfile().city,
        state: data.personal.state ?? this.jobSeekerProfile().state,
        country: data.personal.country ?? this.jobSeekerProfile().country ?? 'India',
        phone: data.personal.phone ?? this.jobSeekerProfile().phone,
        linkedin_url: data.professional.linkedin_url ?? this.jobSeekerProfile().linkedin_url,
        github_url: data.professional.github_url ?? this.jobSeekerProfile().github_url,
        portfolio_url: data.professional.portfolio_url ?? this.jobSeekerProfile().portfolio_url,
        onboarding_completed: false,
        profile_completion_pct: 90,
      };

      let jobSeekerId = this.jobSeekerProfile().id;
      try {
        const jspRes = await withTimeout(this.jspService.upsertJobSeekerProfile(profId, jspPayload));
        if (jspRes?.error) {
          throw new Error(`Failed to save professional profile: ${jspRes.error}`);
        } else if (jspRes?.data?.id) {
          jobSeekerId = jspRes.data.id;
          this.jobSeekerProfile.update((item) => ({
            ...item,
            ...jspPayload,
            id: jobSeekerId,
            profile_id: profId,
          }));
        }
      } catch (err: any) {
        throw err;
      }

      if (!jobSeekerId || jobSeekerId === 'jsp-101') {
        throw new Error('Your candidate profile could not be saved. Please try again.');
      }

      // 3. Flush pending education records
      if (jobSeekerId && jobSeekerId !== 'jsp-101') {
        for (const edu of this.educationList()) {
          if (edu.id.startsWith('edu-')) {
            try {
              const eduRes = await withTimeout(this.jspService.addEducation(jobSeekerId, {
                institution: edu.institution,
                degree: edu.degree,
                field_of_study: edu.field_of_study ?? null,
                start_date: edu.start_date,
                end_date: edu.end_date ?? null,
                grade: edu.grade ?? null,
                description: edu.description ?? null,
              }));
              if (eduRes?.data?.id) {
                this.educationList.update((list) =>
                  list.map((e) => (e.id === edu.id ? { ...e, id: eduRes.data!.id } : e))
                );
              } else if (eduRes?.error) {
                throw new Error(`Failed to save education: ${eduRes.error}`);
              }
            } catch (err: any) {
              throw err;
            }
          }
        }
      }

      // 4. Flush pending experience records
      if (jobSeekerId && jobSeekerId !== 'jsp-101') {
        for (const exp of this.experienceList()) {
          if (exp.id.startsWith('exp-')) {
            const normEmpType = mapEmploymentTypeToDb(exp.employment_type);
            const isCurrent = exp.is_current ?? exp.currently_working ?? false;
            try {
              const expRes = await withTimeout(this.jspService.addExperience(jobSeekerId, {
                company_name: exp.company_name ?? exp.company ?? '',
                job_title: exp.job_title,
                employment_type: normEmpType,
                location: exp.location ?? null,
                start_date: exp.start_date,
                end_date: isCurrent || exp.end_date === 'Present' ? null : (exp.end_date ?? null),
                is_current: isCurrent,
                description: exp.description ?? null,
              }));
              if (expRes?.data?.id) {
                this.experienceList.update((list) =>
                  list.map((ex) => (ex.id === exp.id ? { ...ex, id: expRes.data!.id } : ex))
                );
              } else if (expRes?.error) {
                throw new Error(`Failed to save experience: ${expRes.error}`);
              }
            } catch (err: any) {
              throw err;
            }
          }
        }
      }

      // 5. Flush pending skills
      if (jobSeekerId && jobSeekerId !== 'jsp-101') {
        for (const s of this.userSkills()) {
          let skillId = s.skill_id;
          if (!skillId || skillId.startsWith('sk-')) {
            try {
              const skillRes = await withTimeout(this.jspService.getOrCreateSkill(s.skill_name || ''));
              if (skillRes?.id) {
                skillId = skillRes.id;
                this.userSkills.update((skills) =>
                  skills.map((item) => (item.id === s.id ? { ...item, skill_id: skillId } : item))
                );
              }
            } catch (err: any) {
              throw err;
            }
          }
          if (skillId && !skillId.startsWith('sk-')) {
            try {
              await withTimeout(this.jspService.addUserSkill(jobSeekerId, skillId, s.proficiency_level as any, s.years_experience ?? undefined));
            } catch (err: any) {
              throw err;
            }
          }
        }
      }

      // 6. Save preferences
      if (jobSeekerId && jobSeekerId !== 'jsp-101') {
        const minSalary = data.preferences.minimum_salary ?? data.preferences.min_salary;
        const maxSalary = data.preferences.maximum_salary ?? data.preferences.max_salary;
        try {
          const prefRes = await withTimeout(this.jspService.upsertPreferences(jobSeekerId, {
            preferred_job_title: data.preferences.preferred_job_title ?? null,
            preferred_location: data.preferences.preferred_location ?? null,
            remote_preference: data.preferences.remote_preference ?? null,
            employment_type: data.preferences.employment_type ?? null,
            minimum_salary: minSalary ?? null,
            maximum_salary: maxSalary ?? null,
            experience_level: data.preferences.experience_level ?? null,
            preferred_industries: data.preferences.preferred_industries ?? null,
            willing_to_relocate: data.preferences.willing_to_relocate ?? false,
          }));
          if (prefRes?.error) {
            throw new Error(`Failed to save job preferences: ${prefRes.error}`);
          }
        } catch (err: any) {
          throw err;
        }
      }

      // 7. FINALLY: Persist onboarding_completed = true to database
      const finalProgress = this.calculateCompletionPercentage();
      try {
        const completionRes = await withTimeout(this.jspService.upsertJobSeekerProfile(profId, {
          onboarding_completed: true,
          profile_completion_pct: finalProgress,
        } as any));
        if (completionRes?.error) {
          throw new Error(`Failed to mark onboarding completed: ${completionRes.error}`);
        }
      } catch (err: any) {
        throw err;
      }

      // 8. Update in-memory state and cache
      this.setOnboardingCompleted(true);
      return { success: true };
    } catch (err: any) {
      console.error('[JobSeekerService] submitCompleteOnboarding failed:', err);
      return { success: false, error: err?.message || 'Failed to complete onboarding' };
    }
  }

  // ── Swipe & Matching Action Methods ──────────────────────────────────────

  /**
   * Persists a Like/Pass and resolves once the database confirms it. A Like also
   * creates (or confirms) the real application and succeeds only when that exists.
   * A Pass never touches applications. The job leaves the deck only on success; on
   * failure it stays and `error` explains why, and retrying a Like finishes whichever
   * step is missing. Concurrent calls for the same job share one request.
   * Creates no local match, application or notification.
   */
  swipeJob(job: Job, direction: 'like' | 'pass'): Promise<SwipeOutcome> {
    const pending = this.swipesInFlight.get(job.id);
    if (pending) return pending;
    const run = this.persistSwipe(job, direction).finally(() => this.swipesInFlight.delete(job.id));
    this.swipesInFlight.set(job.id, run);
    return run;
  }

  /** Like & apply for a job by id (Saved Jobs); loads the published job if it is not in the feed. */
  async applyToJobById(jobId: string): Promise<SwipeOutcome> {
    let job: Job | undefined = this.jobs().find((j) => j.id === jobId);
    if (!job) {
      try {
        const row: any = await this.jobsService.getJob(jobId);
        if (row?.status === 'published') job = mapPublishedJob(row);
      } catch (err) {
        console.error('[JobSeekerService] applyToJobById load failed:', err);
      }
    }
    if (!job) return { ok: false, error: 'This job is no longer available.' };
    return this.swipeJob(job, 'like');
  }

  private async persistSwipe(job: Job, direction: 'like' | 'pass'): Promise<SwipeOutcome> {
    const jobSeekerId = this.jobSeekerProfile().id;
    if (!UUID_RE.test(jobSeekerId) || !UUID_RE.test(job.id) || (direction === 'like' && !UUID_RE.test(job.company_id))) {
      return { ok: false, error: 'This job cannot be swiped right now. Please refresh and try again.' };
    }
    try {
      await this.matchingService.swipe(jobSeekerId, job.id, direction);
    } catch (err: any) {
      console.error('[JobSeekerService] swipe failed:', err);
      return { ok: false, error: swipeErrorMessage(err) };
    }
    if (direction === 'like') {
      const applied = await this.ensureApplication(job, jobSeekerId);
      if (!applied.ok) return applied;
      await this.refreshApplications(jobSeekerId);
    }
    this.swipedJobIds.update((set) => new Set(set).add(job.id));
    return { ok: true };
  }

  /**
   * Confirms the candidate's application for the job, creating it when missing.
   * The 004 insert trigger rejects an existing application with 23514 before the
   * unique index can raise 23505, so both codes trigger a re-read. An existing
   * application counts only when its job and candidate ids match.
   */
  private async ensureApplication(job: Job, jobSeekerId: string): Promise<SwipeOutcome> {
    const existing = await this.applicationsService.getApplicationForJob(job.id, jobSeekerId);
    if (existing.error) {
      console.error('[JobSeekerService] application lookup failed:', existing.error);
      return { ok: false, error: applicationErrorMessage(null, null) };
    }
    let app = existing.data;
    if (!app) {
      const res = await this.applicationsService.applyToJob(job.id, jobSeekerId, job.company_id);
      app = res.data;
      if (!app && (res.code === '23505' || res.code === '23514')) {
        app = (await this.applicationsService.getApplicationForJob(job.id, jobSeekerId)).data;
      }
      if (!app) {
        console.error('[JobSeekerService] application failed:', res.code, res.error);
        return { ok: false, error: applicationErrorMessage(res.code, res.error) };
      }
    }
    if (app.job_id !== job.id || app.job_seeker_id !== jobSeekerId) {
      console.error('[JobSeekerService] application does not match job/candidate', app.id);
      return { ok: false, error: applicationErrorMessage(null, null) };
    }
    if (app.status === 'withdrawn') {
      return { ok: false, error: 'You withdrew your application for this job.' };
    }
    return { ok: true };
  }

  /** Reloads the real applications list; a failure here never turns a confirmed Like into an error. */
  private async refreshApplications(jobSeekerId: string): Promise<void> {
    try {
      const apps = await this.applicationsService.getJobSeekerApplications(jobSeekerId);
      if (apps.length > 0) this.applications.set(apps.map(mapApplicationRow));
    } catch (err) {
      console.error('[JobSeekerService] refreshApplications failed:', err);
    }
  }
  // ── Saved Jobs Action Methods ────────────────────────────────────────────

  async saveJob(job: Job) {
    if (this.savedJobs().some((sj) => sj.job_id === job.id)) return;
    const jsp = this.jobSeekerProfile();

    const newSaved: SavedJob = {
      id: 'sj-' + Date.now(),
      job_seeker_id: jsp.id,
      job_seeker_profile_id: jsp.id,
      job_id: job.id,
      created_at: new Date().toISOString(),
      saved_at: new Date().toISOString(),
      job_title: job.title,
      company_name: job.company_name,
      company_logo: job.company_logo,
      location: job.location,
      salary_range: job.salary_display,
      employment_type: job.employment_type,
    };
    this.savedJobs.update((list) => [newSaved, ...list]);

    if (jsp.id && !jsp.id.startsWith('jsp-')) {
      await this.jobsService.saveJob(jsp.id, job.id);
    }
  }

  async removeSavedJob(savedJobId: string) {
    const target = this.savedJobs().find((s) => s.id === savedJobId);
    this.savedJobs.update((list) => list.filter((s) => s.id !== savedJobId));

    const jsp = this.jobSeekerProfile();
    if (target && jsp.id && !jsp.id.startsWith('jsp-')) {
      await this.jobsService.unsaveJob(jsp.id, target.job_id);
    }
  }

  // ── Messaging Action Methods ─────────────────────────────────────────────

  async sendMessage(conversationId: string, text: string, attachments?: any[]) {
    if (!text.trim() && (!attachments || attachments.length === 0)) return;
    const userId = this.authService.getCurrentUserId() ?? this.profile().user_id;

    const newMsg: Message = {
      id: 'msg-' + Date.now(),
      conversation_id: conversationId,
      sender_id: userId ?? 'u-101',
      sender_name: this.profile().full_name,
      is_job_seeker: true,
      message: text,
      text: text,
      attachments: attachments,
      is_read: true,
      read_state: true,
      created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    this.messages.update((dict) => {
      const current = dict[conversationId] || [];
      return {
        ...dict,
        [conversationId]: [...current, newMsg],
      };
    });

    this.conversations.update((list) =>
      list.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              last_message_snippet: text || 'Sent an attachment',
              last_message_at: 'Just now',
              updated_at: new Date().toISOString(),
            }
          : c
      )
    );

    if (userId && !conversationId.startsWith('conv-')) {
      await this.messagesService.sendMessage(conversationId, userId, text);
    }
  }

  markConversationRead(conversationId: string) {
    this.conversations.update((list) =>
      list.map((c) => (c.id === conversationId ? { ...c, unread_count: 0 } : c))
    );
  }

  // ── Application Action Methods ───────────────────────────────────────────

  async withdrawApplication(applicationId: string) {
    this.applications.update((apps) =>
      apps.map((a) => {
        if (a.id === applicationId) {
          const now = new Date().toISOString();
          const history = a.status_history || [];
          return {
            ...a,
            status: 'withdrawn',
            updated_at: now,
            status_history: [
              ...history,
              {
                id: 'ash-' + Date.now(),
                application_id: a.id,
                status: 'withdrawn',
                comment: 'Application withdrawn by candidate',
                changed_at: now,
              },
            ],
          };
        }
        return a;
      })
    );

    if (!applicationId.startsWith('app-')) {
      await this.applicationsService.withdrawApplication(applicationId);
    }
  }

  updateInterviewNotes(interviewId: string, notes: string) {
    this.interviews.update((ints) =>
      ints.map((i) => (i.id === interviewId ? { ...i, notes } : i))
    );
  }

  // ── Notifications Action Methods ─────────────────────────────────────────

  async markNotificationRead(notificationId: string) {
    this.notifications.update((list) =>
      list.map((n) => (n.id === notificationId ? { ...n, is_read: true, read: true } : n))
    );
    if (!notificationId.startsWith('notif-')) {
      await this.notificationsService.markAsRead(notificationId);
    }
  }

  async markAllNotificationsRead() {
    this.notifications.update((list) =>
      list.map((n) => ({ ...n, is_read: true, read: true }))
    );
    const profId = this.profile().id;
    if (profId && !profId.startsWith('p-')) {
      await this.notificationsService.markAllAsRead(profId);
    }
  }

  // ── Strength Calculator ──────────────────────────────────────────────────

  /**
   * Calculates candidate profile completion percentage (0 - 100)
   * based on the 5 core functional sections of Job Seeker onboarding (20% each):
   * 1. Personal & Contact Details (20%)
   * 2. Professional Background (20%)
   * 3. Education & Work Experience (20%)
   * 4. Technical Skills (20%)
   * 5. Job & Work Mode Preferences (20%)
   */
  calculateCompletionPercentage(): number {
    let score = 0;
    const prof = this.profile();
    const jsp = this.jobSeekerProfile();
    const prefs = this.preferences();

    // 1. Personal Details (20%): Full name (10%), Phone (5%), Location/City (5%)
    let personalScore = 0;
    if (prof.full_name && prof.full_name.trim().length >= 2) personalScore += 10;
    if (prof.phone && prof.phone.trim().length >= 5) personalScore += 5;
    if ((jsp.location && jsp.location.trim().length > 0) || (jsp.city && jsp.city.trim().length > 0)) personalScore += 5;
    score += personalScore;

    // 2. Professional Background (20%): Headline (8%), Bio (7%), Job Title & Company (5%)
    let profScore = 0;
    if (jsp.headline && jsp.headline.trim().length >= 5) profScore += 8;
    if (jsp.bio && jsp.bio.trim().length >= 10) profScore += 7;
    if (jsp.current_job_title && jsp.current_job_title.trim().length > 0) profScore += 5;
    score += profScore;

    // 3. Experience & Education (20%): Education (10%), Experience (10%)
    let credScore = 0;
    if (this.educationList().length > 0) credScore += 10;
    if (this.experienceList().length > 0) credScore += 10;
    score += credScore;

    // 4. Skills (20%): 1 skill (10%), 2 skills (15%), 3+ skills (20%)
    const skillsCount = this.userSkills().length;
    if (skillsCount >= 3) {
      score += 20;
    } else if (skillsCount === 2) {
      score += 15;
    } else if (skillsCount === 1) {
      score += 10;
    }

    // 5. Job & Work Mode Preferences (20%): Target Role (5%), Target Location (5%), Work Mode (5%), Salary Range (5%)
    let prefScore = 0;
    if (prefs.preferred_job_title && prefs.preferred_job_title.trim().length > 0) prefScore += 5;
    if (prefs.preferred_location && prefs.preferred_location.trim().length > 0) prefScore += 5;
    if (prefs.remote_preference) prefScore += 5;
    const minSal = prefs.minimum_salary ?? prefs.min_salary;
    const maxSal = prefs.maximum_salary ?? prefs.max_salary;
    if (minSal && maxSal && maxSal >= minSal) prefScore += 5;
    score += prefScore;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  recalculateProfileCompletion(): number {
    const calculated = this.calculateCompletionPercentage();
    this.jobSeekerProfile.update((item) => ({
      ...item,
      profile_completion_pct: calculated,
    }));
    return calculated;
  }
}
