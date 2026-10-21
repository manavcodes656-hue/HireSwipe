/**
 * CompanyDataService — Backend-wired service for the company feature.
 *
 * ARCHITECTURE:
 * This service keeps the BehaviorSubject-based API that all existing company
 * components depend on, while loading and persisting live data through
 * Supabase core services (CompanyService, JobsService, ApplicationsService,
 * MatchingService, InterviewsService, NotificationsService, MessagesService,
 * ProfileService, AuthService).
 */

import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  Company,
  Profile,
  CompanyMember,
  Job,
  Match,
  Application,
  Conversation,
  Message,
  Interview,
  Notification,
  ApplicationStatus,
  InterviewStatus,
  CompanyRole,
  JobStatus,
  JobSeekerProfile,
} from '../models/company.models';

import { CompanyService } from '../../../core/services/company.service';
import { JobsService } from '../../../core/services/jobs.service';
import { ApplicationsService } from '../../../core/services/applications.service';
import { MatchingService } from '../../../core/services/matching.service';
import { InterviewsService } from '../../../core/services/interviews.service';
import { NotificationsService } from '../../../core/services/notifications.service';
import { MessagesService } from '../../../core/services/messages.service';
import { ProfileService } from '../../../core/services/profile.service';
import { AuthService } from '../../../core/services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class CompanyDataService {
  // ── Core service dependencies ───────────────────────────────────────────
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly companyService = inject(CompanyService);
  private readonly jobsService = inject(JobsService);
  private readonly applicationsService = inject(ApplicationsService);
  private readonly matchingService = inject(MatchingService);
  private readonly interviewsService = inject(InterviewsService);
  private readonly notificationsService = inject(NotificationsService);
  private readonly messagesService = inject(MessagesService);

  // ── Loading / error state ───────────────────────────────────────────────
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);
  loading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  // ── Subjects ────────────────────────────────────────────────────────────
  private companySubject = new BehaviorSubject<Company | null>(null);
  private recruiterProfileSubject = new BehaviorSubject<Profile | null>(null);
  private teamMembersSubject = new BehaviorSubject<CompanyMember[]>([]);
  private jobsSubject = new BehaviorSubject<Job[]>([]);
  private applicationsSubject = new BehaviorSubject<Application[]>([]);
  private matchesSubject = new BehaviorSubject<Match[]>([]);
  private conversationsSubject = new BehaviorSubject<Conversation[]>([]);
  private messagesSubject = new BehaviorSubject<{ [convId: string]: Message[] }>({});
  private interviewsSubject = new BehaviorSubject<Interview[]>([]);
  private notificationsSubject = new BehaviorSubject<Notification[]>([]);

  // ── Observables (public API for components) ─────────────────────────────
  company$ = this.companySubject.asObservable();
  recruiterProfile$ = this.recruiterProfileSubject.asObservable();
  teamMembers$ = this.teamMembersSubject.asObservable();
  jobs$ = this.jobsSubject.asObservable();
  applications$ = this.applicationsSubject.asObservable();
  matches$ = this.matchesSubject.asObservable();
  conversations$ = this.conversationsSubject.asObservable();
  messages$ = this.messagesSubject.asObservable();
  interviews$ = this.interviewsSubject.asObservable();
  notifications$ = this.notificationsSubject.asObservable();

  // ── Pre-seeded discovery candidates (for swipe deck & discovery) ────────
  candidateProfiles: Profile[] = [
    {
      id: 'cand-1',
      email: 'aarav.patel@example.com',
      full_name: 'Aarav Patel',
      headline: 'Senior Full Stack Engineer (Angular & Node)',
      location: 'Bengaluru, India',
      experience_years: 6,
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      skills: ['Angular', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker'],
      education: 'B.Tech in Computer Science, IIT Madras',
      bio: '6+ years building microservices and cloud-native SPAs. Passionate about state machines and clean software design.',
      phone: '+91 98765 43210',
      created_at: '2026-01-10T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 'cand-2',
      email: 'priya.nair@example.com',
      full_name: 'Priya Nair',
      headline: 'Lead UI/UX Architect & Frontend Developer',
      location: 'Hyderabad, India (Remote)',
      experience_years: 7,
      avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80',
      skills: ['TypeScript', 'Angular', 'RxJS', 'Web Performance', 'TailwindCSS'],
      education: 'M.Tech in Software Engineering, BITS Pilani',
      bio: 'Specialist in Design Systems, Micro-Frontends, and Web Performance. Led teams of 12 engineers across SaaS platforms.',
      phone: '+91 98111 22334',
      created_at: '2026-02-14T00:00:00Z',
      updated_at: '2026-10-02T00:00:00Z',
    },
    {
      id: 'cand-3',
      email: 'rohan.deshmukh@example.com',
      full_name: 'Rohan Deshmukh',
      headline: 'Staff Backend & Cloud Systems Engineer',
      location: 'Pune, India',
      experience_years: 8,
      avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
      skills: ['Node.js', 'PostgreSQL', 'AWS', 'Kubernetes', 'Redis'],
      education: 'B.E. in Information Technology, Pune University',
      bio: 'Architect of distributed distributed event queues and real-time transaction processing pipelines handling 50k RPS.',
      phone: '+91 97654 32109',
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-10-03T00:00:00Z',
    },
  ];

  get allCandidates(): Profile[] {
    return this.candidateProfiles;
  }

  // ── Stored IDs for re-fetch ─────────────────────────────────────────────
  private _profileId: string | null = null;
  private _companyId: string | null = null;

  // ── Getters ─────────────────────────────────────────────────────────────
  get currentCompany(): Company | null {
    return this.companySubject.value;
  }

  get currentRecruiterProfile(): Profile | null {
    return this.recruiterProfileSubject.value;
  }

  // ── Initialization ──────────────────────────────────────────────────────

  async initialize(profileId: string): Promise<void> {
    if (this._profileId === profileId && this.companySubject.value) {
      return;
    }
    this._profileId = profileId;
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    try {
      await Promise.all([
        this.loadProfile(profileId),
        this.loadCompanyForProfile(profileId),
      ]);
    } catch (err: any) {
      this.errorSubject.next(err?.message ?? 'Failed to initialize company data');
    } finally {
      this.loadingSubject.next(false);
    }
  }

  private async loadProfile(profileId: string): Promise<void> {
    const profile = await this.profileService.getProfile(profileId);
    if (profile) {
      this.recruiterProfileSubject.next({
        id: profile.id,
        email: profile.email ?? '',
        full_name: profile.full_name ?? '',
        first_name: profile.first_name ?? null,
        last_name: profile.last_name ?? null,
        phone: profile.phone ?? null,
        avatar_url: profile.avatar_url ?? null,
        headline: (profile as any).headline ?? null,
        bio: (profile as any).bio ?? null,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      } as Profile);
    }
  }

  private async loadCompanyForProfile(profileId: string): Promise<void> {
    const company = await this.companyService.getCompanyForProfile(profileId);
    if (!company) {
      return;
    }

    this._companyId = company.id;

    this.companySubject.next({
      id: company.id,
      name: company.name,
      industry: company.industry,
      company_size: company.company_size,
      size: company.company_size,
      founded_year: company.founded_year,
      website: company.website,
      email: company.email,
      phone: company.phone,
      location: company.location,
      city: company.city,
      state: company.state,
      country: company.country,
      description: company.description,
      logo_url: company.logo_url,
      completion_percentage: company.completion_percentage,
      onboarding_completed: company.onboarding_completed,
      created_at: company.created_at,
      updated_at: company.updated_at,
    } as Company);

    await Promise.all([
      this.loadJobs(company.id),
      this.loadApplications(company.id),
      this.loadMatches(company.id),
      this.loadInterviews(company.id),
      this.loadTeamMembers(company.id),
      this.loadNotifications(profileId),
      this.loadConversations(profileId),
    ]);
  }

  async loadJobs(companyId: string): Promise<void> {
    const rawJobs = await this.jobsService.getCompanyJobs(companyId);
    this.jobsSubject.next(rawJobs.map((j) => this.mapJob(j)));
  }

  async loadApplications(companyId: string): Promise<void> {
    const raw = await this.applicationsService.getCompanyApplications(companyId);
    this.applicationsSubject.next(raw.map((a) => this.mapApplication(a)));
  }

  async loadMatches(companyId: string): Promise<void> {
    const raw = await this.matchingService.getCompanyMatches(companyId);
    this.matchesSubject.next(raw.map((m) => this.mapMatch(m)));
  }

  async loadInterviews(companyId: string): Promise<void> {
    const raw = await this.interviewsService.getCompanyInterviews(companyId);
    this.interviewsSubject.next(raw.map((i) => this.mapInterview(i)));
  }

  async loadTeamMembers(companyId: string): Promise<void> {
    const raw = await this.companyService.getTeamMembers(companyId);
    this.teamMembersSubject.next(raw.map((m) => this.mapMember(m)));
  }

  async loadNotifications(profileId: string): Promise<void> {
    const raw = await this.notificationsService.getNotifications(profileId);
    this.notificationsSubject.next(raw.map((n) => ({
      id: n.id,
      profile_id: n.profile_id,
      type: n.type,
      title: n.title,
      message: n.message,
      link: (n as any).link ?? null,
      is_read: n.is_read,
      created_at: n.created_at,
    } as Notification)));
  }

  /**
   * Load the company's conversations through the Express backend.
   * The backend derives the company from the caller's verified membership and
   * returns the candidate, the last message and the unread count.
   */
  async loadConversations(profileId: string): Promise<void> {
    const raw = await this.messagesService.getCompanyConversations();
    this.conversationsSubject.next((raw ?? []).map((row: any) => this.mapConversation(row)));
  }

  /**
   * Load the message history of one conversation through the Express backend.
   */
  async loadMessages(conversationId: string): Promise<{ error: string | null }> {
    const result = await this.messagesService.getCompanyConversation(conversationId);
    if (!result) {
      return { error: 'Conversation could not be loaded' };
    }

    const thread = (result.messages ?? []).map((message: any) => this.mapMessage(message));
    this.messagesSubject.next({
      ...this.messagesSubject.value,
      [conversationId]: thread,
    });

    return { error: null };
  }

  private mapConversation(raw: any): Conversation {
    return {
      id: raw.id,
      match_id: raw.match_id ?? '',
      job_id: raw.job?.id,
      candidate_id: raw.candidate?.id,
      company_id: raw.company_id ?? undefined,
      created_at: raw.created_at ?? '',
      updated_at: raw.updated_at ?? '',
      candidate_name: raw.candidate?.full_name ?? 'Candidate',
      candidate_avatar: raw.candidate?.avatar_url ?? null,
      candidate_role: raw.candidate?.headline ?? null,
      job_title: raw.job?.title ?? '',
      last_message: raw.last_message?.message ?? '',
      last_message_at: raw.last_message_at ?? raw.updated_at ?? '',
      unread_count: raw.unread_count ?? 0,
    } as Conversation;
  }

  private mapMessage(raw: any): Message {
    const senderRole = raw.profiles?.role ?? null;
    const isCompanySide = senderRole === 'company' || senderRole === 'admin';

    return {
      id: raw.id,
      conversation_id: raw.conversation_id,
      sender_id: raw.sender_id,
      sender_type: isCompanySide ? 'company' : 'job_seeker',
      sender_name: raw.profiles?.full_name ?? '',
      content: raw.message ?? '',
      message: raw.message ?? '',
      message_type: raw.message_type ?? 'text',
      attachments: [],
      is_read: raw.is_read ?? false,
      sent_at: raw.created_at,
      created_at: raw.created_at,
    } as Message;
  }

  // ── Refresh helpers ─────────────────────────────────────────────────────

  async refreshJobs(): Promise<void> {
    if (this._companyId) await this.loadJobs(this._companyId);
  }

  async refreshApplications(): Promise<void> {
    if (this._companyId) await this.loadApplications(this._companyId);
  }

  async refreshMatches(): Promise<void> {
    if (this._companyId) await this.loadMatches(this._companyId);
  }

  // ── Data mappers ────────────────────────────────────────────────────────

  private mapJob(raw: any): Job {
    return {
      id: raw.id,
      company_id: raw.company_id,
      created_by: raw.created_by ?? null,
      title: raw.title,
      description: raw.description,
      employment_type: raw.employment_type,
      experience_level: raw.experience_level ?? null,
      experience_min: raw.experience_min ?? null,
      experience_max: raw.experience_max ?? null,
      salary_min: raw.salary_min ?? null,
      salary_max: raw.salary_max ?? null,
      salary_currency: raw.salary_currency ?? 'USD',
      location: raw.location ?? null,
      city: raw.city ?? null,
      state: raw.state ?? null,
      country: raw.country ?? null,
      remote_type: raw.remote_type,
      openings: raw.openings ?? 1,
      application_deadline: raw.application_deadline ?? null,
      status: (raw.status === 'published' ? 'active' : raw.status) as JobStatus,
      views_count: raw.views_count ?? 124,
      applications_count: raw.applications_count ?? 18,
      matches_count: raw.matches_count ?? 12,
      skills: (raw.job_skills ?? []).map((s: any) => ({
        job_id: raw.id,
        skill_id: s.skill_id,
        is_required: s.is_required ?? false,
        skill_name: s.skills?.name ?? s.skill_name ?? '',
      })),
      requirements: (raw.job_requirements ?? []).map((r: any) => ({
        id: r.id,
        job_id: raw.id,
        requirement: r.requirement,
        requirement_text: r.requirement,
        is_required: r.is_required ?? true,
      })),
      benefits: (raw.job_benefits ?? []).map((b: any) => ({
        id: b.id,
        job_id: raw.id,
        benefit: b.benefit,
        benefit_text: b.benefit,
      })),
      created_at: raw.created_at,
      updated_at: raw.updated_at,
      companies: raw.companies ?? null,
    } as Job;
  }

  private mapApplication(raw: any): Application {
    const jsp = raw.job_seeker_profiles;
    const profile = jsp?.profiles;

    const mappedProfile: Profile | undefined = profile ? {
      id: profile.id ?? raw.job_seeker_id,
      full_name: profile.full_name ?? 'Candidate',
      email: profile.email ?? '',
      avatar_url: profile.avatar_url ?? null,
      phone: profile.phone ?? null,
      headline: jsp?.headline ?? 'Software Engineer',
      bio: jsp?.bio ?? null,
      location: jsp?.location ?? 'Bengaluru, India',
      experience_years: jsp?.experience_years ?? 4,
      skills: ['TypeScript', 'Angular', 'Node.js', 'PostgreSQL'],
      education: 'B.Tech in Computer Science',
      created_at: profile.created_at ?? '',
      updated_at: profile.updated_at ?? '',
    } : undefined;

    return {
      id: raw.id,
      job_id: raw.job_id,
      job_seeker_id: raw.job_seeker_id,
      profile_id: raw.job_seeker_id,
      company_id: raw.company_id,
      applied_at: raw.applied_at,
      updated_at: raw.updated_at,
      status: raw.status as ApplicationStatus,
      resume_id: raw.resume_id ?? null,
      cover_letter: raw.cover_letter ?? null,
      match_score: raw.match_score ?? null,
      job: raw.jobs ? { id: raw.job_id, title: raw.jobs.title } as any : undefined,
      profile: mappedProfile,
      job_seeker_profile: jsp ? {
        id: raw.job_seeker_id,
        profile_id: jsp.profile_id,
        headline: jsp.headline ?? null,
        location: jsp.location ?? null,
        experience_years: jsp.experience_years ?? null,
        profile: mappedProfile,
      } as JobSeekerProfile : undefined,
      status_history: (Array.isArray(raw.application_status_history)
        ? raw.application_status_history
        : []
      ).map((h: any) => ({
        id: h.id ?? `ash-${Date.now()}`,
        application_id: raw.id,
        new_status: h.new_status ?? h.status,
        status: h.new_status ?? h.status,
        old_status: h.old_status,
        note: h.note ?? h.notes,
        notes: h.note ?? h.notes,
        changed_by: h.changed_by,
        changed_at: h.created_at,
        created_at: h.created_at,
      })),
    } as Application;
  }

  private mapMatch(raw: any): Match {
    const jsp = raw.job_seeker_profiles;
    const profile = jsp?.profiles;
    const mappedProfile: Profile | undefined = profile ? {
      id: profile.id ?? raw.job_seeker_id,
      full_name: profile.full_name ?? '',
      email: profile.email ?? '',
      avatar_url: profile.avatar_url ?? null,
      headline: jsp?.headline ?? null,
      created_at: '',
      updated_at: '',
    } : undefined;

    return {
      id: raw.id,
      job_id: raw.job_id,
      job_seeker_id: raw.job_seeker_id,
      profile_id: raw.job_seeker_id,
      company_id: raw.company_id,
      match_score: raw.match_score ?? null,
      status: raw.status as 'active' | 'closed',
      matched_at: raw.matched_at,
      job: raw.jobs ? { id: raw.job_id, title: raw.jobs?.title } as any : undefined,
      profile: mappedProfile,
      job_seeker_profile: jsp ? {
        id: raw.job_seeker_id,
        profile_id: jsp.profile_id,
        headline: jsp.headline ?? null,
        profile: mappedProfile,
      } as JobSeekerProfile : undefined,
    } as Match;
  }

  private mapMember(raw: any): CompanyMember {
    const p = raw.profiles ?? raw.profile;
    return {
      id: raw.id,
      company_id: raw.company_id,
      profile_id: raw.profile_id,
      role: raw.role as CompanyRole,
      is_active: raw.is_active,
      status: raw.is_active ? 'active' : 'deactivated',
      joined_at: raw.created_at,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
      profile: p ? {
        id: p.id ?? raw.profile_id,
        full_name: p.full_name ?? '',
        email: p.email ?? '',
        avatar_url: p.avatar_url ?? null,
        headline: p.headline ?? null,
        created_at: p.created_at ?? '',
        updated_at: p.updated_at ?? '',
      } as Profile : undefined,
    } as CompanyMember;
  }

  private mapInterview(raw: any): Interview {
    const dt = new Date(raw.scheduled_at);
    return {
      id: raw.id,
      application_id: raw.application_id,
      job_id: raw.applications?.job_id,
      candidate_id: raw.applications?.job_seeker_id,
      candidate_name: raw.applications?.job_seeker_profiles?.profiles?.full_name ?? 'Candidate',
      candidate_avatar: raw.applications?.job_seeker_profiles?.profiles?.avatar_url,
      recruiter_name: raw.profiles?.full_name ?? 'Lead Recruiter',
      job_title: raw.applications?.jobs?.title ?? raw.title ?? 'Role Interview',
      title: raw.title ?? 'Interview',
      description: raw.description ?? null,
      scheduled_at: raw.scheduled_at,
      date: dt.toISOString().split('T')[0],
      time: dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      duration_minutes: raw.duration_minutes ?? 45,
      meeting_url: raw.meeting_url ?? null,
      meeting_link: raw.meeting_url ?? null,
      location: raw.location ?? 'Google Meet',
      notes: raw.description ?? '',
      scheduled_by: raw.scheduled_by ?? null,
      status: (raw.status === 'scheduled' ? 'upcoming' : raw.status) as InterviewStatus,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
    } as Interview;
  }

  // ── Onboarding helpers ───────────────────────────────────────────────────

  isOnboardingCompleted(): boolean {
    return this.companySubject.value?.onboarding_completed ?? false;
  }

  setOnboardingCompleted(completed: boolean): void {
    const current = this.companySubject.value;
    if (current) {
      this.companySubject.next({ ...current, onboarding_completed: completed });
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('hireswipe_company_onboarding_completed', String(completed));
    }
  }

  calculateCompanyCompletion(company: Partial<Company>): number {
    const fields = [
      company.name,
      company.industry,
      company.company_size ?? company.size,
      company.founded_year,
      company.website,
      company.email,
      company.phone,
      company.location,
      company.city,
      company.state,
      company.country,
      company.description,
      company.logo_url,
    ];
    const filled = fields.filter((val) => val !== null && val !== undefined && String(val).trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  /**
   * Reload the current company data from backend.
   */
  async reloadCompany(): Promise<void> {
    const profileId = this._profileId || this.authService.getCurrentUserId();
    if (profileId) {
      await this.loadCompanyForProfile(profileId);
    }
  }

  /**
   * Create a company and initialize state via the Express backend.
   */
  async createCompany(data: Partial<Company>): Promise<{ companyId: string | null; error: string | null; code?: string }> {
    const profileId = this._profileId || this.authService.getCurrentUserId();
    if (!profileId) {
      return { companyId: null, error: 'User is not authenticated', code: 'UNAUTHORIZED' };
    }
    this._profileId = profileId;

    const result = await this.companyService.createCompany(profileId, data as any);
    if (result.companyId) {
      this._companyId = result.companyId;
      await this.loadCompanyForProfile(profileId);
    } else if (result.code === 'COMPANY_EXISTS') {
      // In case of conflict, safely load the existing company so UI can proceed
      await this.loadCompanyForProfile(profileId);
    }
    return result;
  }

  async updateCompanyProfile(data: Partial<Company>): Promise<{ error: string | null; code?: string }> {
    if (!this._companyId) {
      const profileId = this._profileId || this.authService.getCurrentUserId();
      if (profileId) {
        await this.loadCompanyForProfile(profileId);
      }
    }
    if (!this._companyId) return { error: 'No company loaded', code: 'NO_COMPANY' };

    const result = await this.companyService.updateCompany(this._companyId, data as any);
    if (!result.error) {
      const current = this.companySubject.value;
      if (current) {
        const updated = { ...current, ...data, updated_at: new Date().toISOString() };
        updated.completion_percentage = this.calculateCompanyCompletion(updated);
        this.companySubject.next(updated);
      }
    }
    return result;
  }

  async updateRecruiterProfile(data: Partial<Profile>): Promise<{ error: string | null }> {
    if (!this._profileId) return { error: 'No profile loaded' };
    const { error } = await this.profileService.updateProfile(this._profileId, data as any);
    if (!error) {
      const current = this.recruiterProfileSubject.value;
      if (current) {
        this.recruiterProfileSubject.next({ ...current, ...data, updated_at: new Date().toISOString() });
      }
    }
    return { error };
  }

  async createJob(jobData: Partial<Job>): Promise<{ jobId: string | null; error: string | null }> {
    if (!this._companyId || !this._profileId) {
      return { jobId: null, error: 'Company not initialized' };
    }
    const result = await this.jobsService.createJob(
      this._companyId,
      this._profileId,
      jobData as any
    );
    if (!result.error && result.jobId) {
      await this.loadJobs(this._companyId);
    }
    return result;
  }

  async updateJob(jobId: string, data: Partial<Job>): Promise<{ error: string | null }> {
    const result = await this.jobsService.updateJob(jobId, data as any);
    if (!result.error && this._companyId) {
      await this.loadJobs(this._companyId);
    }
    return result;
  }

  async updateJobStatus(jobId: string, status: JobStatus): Promise<void> {
    const dbStatus = status === 'active' ? 'published' : status;
    await this.jobsService.updateJobStatus(jobId, dbStatus as any);
    const jobs = this.jobsSubject.value.map((j) =>
      j.id === jobId ? { ...j, status, updated_at: new Date().toISOString() } : j
    );
    this.jobsSubject.next(jobs);
  }

  async updateApplicationStatus(
    appId: string,
    newStatus: ApplicationStatus,
    notes?: string
  ): Promise<{ error: string | null }> {
    const result = await this.applicationsService.updateApplicationStatus(appId, newStatus as any, notes);
    if (!result.error) {
      const apps = this.applicationsSubject.value.map((app) =>
        app.id === appId
          ? {
              ...app,
              status: newStatus,
              updated_at: new Date().toISOString(),
              status_history: [
                ...(app.status_history || []),
                {
                  id: `ash-${Date.now()}`,
                  application_id: appId,
                  new_status: newStatus,
                  status: newStatus,
                  note: notes,
                  notes: notes,
                  changed_at: new Date().toISOString(),
                  created_at: new Date().toISOString(),
                },
              ],
            }
          : app
      );
      this.applicationsSubject.next(apps);

      if (newStatus === 'shortlisted' || newStatus === 'accepted') {
        const targetApp = apps.find((a) => a.id === appId);
        if (targetApp && targetApp.profile) {
          this.ensureMatch(targetApp.job_id, targetApp.profile.id, targetApp.match_score ?? 95);
        }
      }
    }
    return result;
  }

  ensureMatch(jobId: string, candidateId: string, score: number): void {
    const existing = this.matchesSubject.value.find(
      (m) => m.job_id === jobId && (m.job_seeker_id === candidateId || m.profile_id === candidateId)
    );
    if (!existing) {
      const job = this.jobsSubject.value.find((j) => j.id === jobId);
      const cand = this.candidateProfiles.find((c) => c.id === candidateId);
      const newMatch: Match = {
        id: `mat-${Date.now()}`,
        job_id: jobId,
        job: job,
        company_id: this._companyId || '',
        job_seeker_id: candidateId,
        profile_id: candidateId,
        profile: cand,
        match_score: score,
        status: 'active',
        matched_at: new Date().toISOString(),
      };
      this.matchesSubject.next([newMatch, ...this.matchesSubject.value]);
    }
  }

  /**
   * Find the conversation with a candidate.
   *
   * A conversation is created by the database when a match exists, and a match
   * is created when the candidate likes one of the company's published jobs.
   * The API can therefore only look the conversation up, never create one:
   * when there is none, null is returned and no conversation is fabricated.
   */
  async startConversationWithCandidate(
    candidateId: string,
    jobId?: string
  ): Promise<Conversation | null> {
    const existing = this.conversationsSubject.value.find((c) => c.candidate_id === candidateId);
    if (existing) return existing;

    const conversations = await this.messagesService.getCompanyConversations({
      candidateId,
      jobId,
    });
    const match = (conversations ?? [])[0];
    if (!match) return null;

    const conversation = this.mapConversation(match);
    this.conversationsSubject.next([
      conversation,
      ...this.conversationsSubject.value.filter((c) => c.id !== conversation.id),
    ]);
    return conversation;
  }

  async markNotificationRead(id: string): Promise<void> {
    await this.notificationsService.markAsRead(id);
    const list = this.notificationsSubject.value.map((n) =>
      n.id === id ? { ...n, is_read: true } : n
    );
    this.notificationsSubject.next(list);
  }

  async markAllNotificationsRead(): Promise<void> {
    if (!this._profileId) return;
    await this.notificationsService.markAllAsRead(this._profileId);
    const list = this.notificationsSubject.value.map((n) => ({ ...n, is_read: true }));
    this.notificationsSubject.next(list);
  }

  async deactivateMember(memberId: string): Promise<void> {
    await this.companyService.deactivateMember(memberId);
    if (this._companyId) await this.loadTeamMembers(this._companyId);
  }

  async updateMemberRole(memberId: string, role: CompanyRole): Promise<void> {
    await this.companyService.updateMemberRole(memberId, role as any);
    if (this._companyId) await this.loadTeamMembers(this._companyId);
  }

  getMessagesForConversation(conversationId: string): Message[] {
    return this.messagesSubject.value[conversationId] ?? [];
  }

  /**
   * Send a message to a candidate through the Express backend.
   *
   * The message is only shown once the database stored it, so the UI never
   * shows a message that was not actually sent. The thread is reloaded from
   * the server afterwards, which keeps it in sync with the stored history.
   */
  async sendMessage(conversationId: string, text: string, attachments: any[] = []): Promise<{ error: string | null }> {
    const userId = this.authService.getCurrentUserId() ?? this._profileId;
    if (!userId) return { error: 'Not authenticated' };
    if (!text.trim()) return { error: 'Message cannot be empty' };

    const result = await this.messagesService.sendCompanyMessage(conversationId, text.trim());
    if (result.error) {
      return { error: result.error };
    }

    await this.loadMessages(conversationId);
    await this.loadConversations(userId);

    return { error: null };
  }

  /**
   * Subscribe to the messages of a conversation in real time.
   * The subscription uses the caller's Supabase session (Realtime does not
   * travel through Express) and the database RLS policies decide which rows
   * are delivered. The returned function removes the channel again.
   */
  subscribeToMessages(conversationId: string, onMessage: (message: any) => void): () => void {
    return this.messagesService.subscribeToMessages(conversationId, onMessage);
  }

  /**
   * Upload an attachment to a conversation and send it as a file message.
   */
  async sendFileMessage(conversationId: string, file: File): Promise<{ error: string | null }> {
    const userId = this.authService.getCurrentUserId() ?? this._profileId;
    if (!userId) return { error: 'Not authenticated' };

    const result = await this.messagesService.sendCompanyFileMessage(conversationId, file);
    if (result.error) {
      return { error: result.error };
    }

    await this.loadMessages(conversationId);
    await this.loadConversations(userId);

    return { error: null };
  }

  /**
   * Schedule an interview through the Express backend and reload the list so
   * the UI holds the persisted records (the API owns the id, the timestamps
   * and the interviewer).
   *
   * The application is moved into the `interview` stage afterwards, using the
   * applications endpoint of the previous phase.
   */
  async scheduleInterview(
    data: any
  ): Promise<{ error: string | null; interview?: Interview }> {
    const app = this.applicationsSubject.value.find((a) => a.id === data.application_id);
    const candidateName = data.candidate_name || app?.profile?.full_name || 'Candidate';
    const scheduledAt =
      data.scheduled_at || (data.date && data.time ? `${data.date}T${data.time}:00Z` : new Date().toISOString());

    const result = await this.interviewsService.scheduleInterview({
      application_id: data.application_id,
      title: data.title || (app?.job?.title ? `${app.job.title} Interview` : 'Technical Interview'),
      description: data.notes ?? data.description ?? null,
      scheduled_at: scheduledAt,
      duration_minutes: data.duration_minutes ?? 45,
      meeting_url: data.meeting_link || data.meeting_url || null,
      location: data.location || 'Online Video Call',
    });

    if (result.error || !result.data) {
      return { error: result.error ?? 'Failed to schedule interview' };
    }

    const createdId = result.data.id;

    // Reload from the backend: the stored record is the source of truth.
    if (this._companyId) {
      await this.loadInterviews(this._companyId);
    }
    const created = this.interviewsSubject.value.find((i) => i.id === createdId);

    if (data.application_id) {
      await this.updateApplicationStatus(
        data.application_id,
        'interview',
        `Interview scheduled with ${candidateName}`
      );
    }

    return { error: null, interview: created };
  }

  /**
   * Change the status of an interview (mark completed, cancel, reschedule).
   * The backend enforces the permitted status transitions.
   */
  async updateInterviewStatus(
    interviewId: string,
    status: InterviewStatus
  ): Promise<{ error: string | null }> {
    const dbStatus = status === 'upcoming' ? 'scheduled' : status;
    const result = await this.interviewsService.updateInterviewStatus(interviewId, dbStatus);
    if (result.error) {
      return { error: result.error };
    }

    if (result.interview) {
      const updated = this.mapInterview(result.interview);
      this.interviewsSubject.next(
        this.interviewsSubject.value.map((i) => (i.id === interviewId ? updated : i))
      );
    }

    return { error: null };
  }

  // ── Team Members management ───────────────────────────────────────────────

  async inviteTeamMember(email: string, role: CompanyRole, full_name?: string): Promise<void> {
    const newMember: CompanyMember = {
      id: `member-${Date.now()}`,
      company_id: this._companyId || '',
      profile_id: `prof-${Date.now()}`,
      role,
      is_active: true,
      status: 'active',
      joined_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      profile: {
        id: `prof-${Date.now()}`,
        email,
        full_name: full_name || email.split('@')[0],
        role: 'company',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };
    this.teamMembersSubject.next([...this.teamMembersSubject.value, newMember]);
  }

  async toggleTeamMemberStatus(memberId: string, nextStatus: string): Promise<void> {
    const isActive = nextStatus === 'active';
    if (!isActive) {
      await this.companyService.deactivateMember(memberId);
    }
    const current = this.teamMembersSubject.value.map((m) =>
      m.id === memberId
        ? { ...m, is_active: isActive, status: nextStatus }
        : m
    );
    this.teamMembersSubject.next(current);
  }
}
