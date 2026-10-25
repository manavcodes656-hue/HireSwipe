import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OnboardingComponent } from './onboarding.component';
import { JobSeekerService } from '../services/job-seeker.service';
import { JobSeekerProfileService } from '../../../core/services/job-seeker-profile.service';
import { ProfileService } from '../../../core/services/profile.service';
import { AuthService } from '../../../core/services/auth.service';
import { JobsService } from '../../../core/services/jobs.service';
import { ApplicationsService } from '../../../core/services/applications.service';
import { MatchingService } from '../../../core/services/matching.service';
import { InterviewsService } from '../../../core/services/interviews.service';
import { NotificationsService } from '../../../core/services/notifications.service';
import { MessagesService } from '../../../core/services/messages.service';

describe('Job Seeker Onboarding Data Integrity, Persistence & Recovery (Phase 4)', () => {
  let mockJobSeekerService: any;
  let mockJspService: any;
  let mockProfileService: any;
  let mockAuthService: any;
  let mockJobsService: any;
  let mockApplicationsService: any;
  let mockMatchingService: any;
  let mockInterviewsService: any;
  let mockNotificationsService: any;
  let mockMessagesService: any;
  let mockRouter: any;

  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {}

    mockRouter = {
      navigate: vi.fn(),
    };

    mockAuthService = {
      getCurrentUserId: vi.fn().mockReturnValue('user-uuid-123'),
      isAuthenticated: vi.fn().mockReturnValue(true),
      isJobSeeker: vi.fn().mockReturnValue(true),
      loading: signal(false),
    };

    mockProfileService = {
      getProfile: vi.fn().mockResolvedValue({
        id: 'user-uuid-123',
        full_name: 'Priya Sharma',
        phone: '+91 9876543210',
        avatar_url: 'https://example.com/priya.jpg',
        email: 'priya@example.com',
        role: 'job_seeker',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      updateProfile: vi.fn().mockResolvedValue({
        error: null,
      }),
      uploadAvatar: vi.fn().mockResolvedValue({
        publicUrl: 'https://supabase.co/storage/v1/object/public/avatars/user-uuid-123/avatar.png',
        error: null,
      }),
    };

    mockJspService = {
      getJobSeekerProfile: vi.fn().mockResolvedValue({
        id: 'jsp-uuid-999',
        profile_id: 'user-uuid-123',
        headline: 'Full Stack Engineer',
        bio: '5+ years building scalable apps',
        current_job_title: 'Software Engineer',
        current_company: 'Acme Corp',
        experience_years: 5,
        availability: '15 Days',
        onboarding_completed: false,
        profile_completion_pct: 60,
      }),
      upsertJobSeekerProfile: vi.fn().mockResolvedValue({
        data: { id: 'jsp-uuid-999', profile_id: 'user-uuid-123', onboarding_completed: false },
        error: null,
      }),
      getEducation: vi.fn().mockResolvedValue([]),
      addEducation: vi.fn().mockResolvedValue({ data: { id: 'edu-db-1' }, error: null }),
      updateEducation: vi.fn().mockResolvedValue(undefined),
      deleteEducation: vi.fn().mockResolvedValue(undefined),
      getExperience: vi.fn().mockResolvedValue([]),
      addExperience: vi.fn().mockResolvedValue({ data: { id: 'exp-db-1' }, error: null }),
      updateExperience: vi.fn().mockResolvedValue(undefined),
      deleteExperience: vi.fn().mockResolvedValue(undefined),
      getUserSkills: vi.fn().mockResolvedValue([]),
      getSkillsCatalog: vi.fn().mockResolvedValue([]),
      getOrCreateSkill: vi.fn().mockResolvedValue({ id: 'skill-db-1', name: 'Kubernetes' }),
      addUserSkill: vi.fn().mockResolvedValue({ data: { id: 'js-skill-1' }, error: null }),
      removeUserSkill: vi.fn().mockResolvedValue(undefined),
      getResumes: vi.fn().mockResolvedValue([]),
      uploadResume: vi.fn().mockResolvedValue({
        data: {
          id: 'res-db-1',
          job_seeker_id: 'jsp-uuid-999',
          file_name: 'resume.pdf',
          file_path: 'resumes/resume.pdf',
          file_size: 1048576,
          mime_type: 'application/pdf',
          is_primary: true,
          created_at: new Date().toISOString(),
        },
        error: null,
      }),
      setPrimaryResume: vi.fn().mockResolvedValue(undefined),
      deleteResume: vi.fn().mockResolvedValue(undefined),
      getPreferences: vi.fn().mockResolvedValue(null),
      upsertPreferences: vi.fn().mockResolvedValue({ data: { id: 'pref-db-1' }, error: null }),
    };

    mockJobsService = {
      getSavedJobs: vi.fn().mockResolvedValue([]),
      getPublishedJobs: vi.fn().mockResolvedValue([]),
    };

    mockApplicationsService = {
      getJobSeekerApplications: vi.fn().mockResolvedValue([]),
    };

    mockMatchingService = {
      getSwipedJobIds: vi.fn().mockResolvedValue([]),
      getJobSeekerMatches: vi.fn().mockResolvedValue([]),
      swipe: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    mockInterviewsService = {
      getJobSeekerInterviews: vi.fn().mockResolvedValue([]),
    };

    mockNotificationsService = {
      getNotifications: vi.fn().mockResolvedValue([]),
    };

    mockMessagesService = {
      getConversations: vi.fn().mockResolvedValue([]),
    };
  });

  const getCommonProviders = () => [
    JobSeekerService,
    { provide: AuthService, useValue: mockAuthService },
    { provide: ProfileService, useValue: mockProfileService },
    { provide: JobSeekerProfileService, useValue: mockJspService },
    { provide: JobsService, useValue: mockJobsService },
    { provide: ApplicationsService, useValue: mockApplicationsService },
    { provide: MatchingService, useValue: mockMatchingService },
    { provide: InterviewsService, useValue: mockInterviewsService },
    { provide: NotificationsService, useValue: mockNotificationsService },
    { provide: MessagesService, useValue: mockMessagesService },
  ];

  describe('1. Profile Lifecycle & Initialization', () => {
    let service: JobSeekerService;

    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: getCommonProviders(),
      });
      service = TestBed.inject(JobSeekerService);
    });

    it('loads an existing completed profile accurately', async () => {
      service.resetState();
      mockJspService.getJobSeekerProfile.mockResolvedValueOnce({
        id: 'jsp-uuid-999',
        profile_id: 'user-uuid-123',
        onboarding_completed: true,
        profile_completion_pct: 100,
      });

      await service.ensureProfileLoaded('user-uuid-123');
      expect(service.isOnboardingCompleted()).toBe(true);
      expect(service.jobSeekerProfile().onboarding_completed).toBe(true);
      expect(service.jobSeekerProfile().id).toBe('jsp-uuid-999');
    });

    it('loads an existing incomplete profile accurately as incomplete', async () => {
      service.resetState();
      mockJspService.getJobSeekerProfile.mockResolvedValueOnce({
        id: 'jsp-uuid-999',
        profile_id: 'user-uuid-123',
        onboarding_completed: false,
        profile_completion_pct: 30,
      });

      await service.ensureProfileLoaded('user-uuid-123');
      expect(service.isOnboardingCompleted()).toBe(false);
      expect(service.jobSeekerProfile().onboarding_completed).toBe(false);
    });

    it('initializes a missing profile record as incomplete', async () => {
      service.resetState();
      mockJspService.getJobSeekerProfile.mockResolvedValueOnce(null);

      await service.ensureProfileLoaded('user-uuid-123');
      expect(service.isOnboardingCompleted()).toBe(false);
      expect(service.jobSeekerProfile().onboarding_completed).toBe(false);
    });

    it('distinguishes profile fetch errors from missing profiles without falsely completing', async () => {
      service.resetState();
      mockJspService.getJobSeekerProfile.mockRejectedValueOnce(new Error('Network connectivity timeout'));

      await service.ensureProfileLoaded('user-uuid-123');
      expect(service.isOnboardingCompleted()).toBe(false);
      expect(service.error()).toBe('Network connectivity timeout');
    });

    it('resets state and loads new user profile on account switch', async () => {
      mockJspService.getJobSeekerProfile.mockImplementation(async (id: string) => {
        if (id === 'user-uuid-777') {
          return {
            id: 'jsp-uuid-777',
            profile_id: 'user-uuid-777',
            onboarding_completed: true,
            profile_completion_pct: 100,
          };
        }
        return {
          id: 'jsp-uuid-999',
          profile_id: 'user-uuid-123',
          onboarding_completed: false,
          profile_completion_pct: 60,
        };
      });

      service.resetState();
      await service.ensureProfileLoaded('user-uuid-123');
      expect(service.jobSeekerProfile().id).toBe('jsp-uuid-999');

      // Switch user
      service.resetState();
      expect(service.jobSeekerProfile().id).toBe('');
      expect(service.isOnboardingCompleted()).toBe(false);
      expect(service.educationList().length).toBe(0);
      expect(service.experienceList().length).toBe(0);

      mockAuthService.getCurrentUserId.mockReturnValue('user-uuid-777');
      await service.ensureProfileLoaded('user-uuid-777');
      expect(service.jobSeekerProfile().id).toBe('jsp-uuid-777');
      expect(service.isOnboardingCompleted()).toBe(true);
    });
  });

  describe('2. Multi-Section Persistence & FK Integrity', () => {
    let service: JobSeekerService;

    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: getCommonProviders(),
      });
      service = TestBed.inject(JobSeekerService);
    });

    it('maps employment_type strings to PostgreSQL enum values', () => {
      expect(service.mapEmploymentTypeToDb('Full-time')).toBe('full_time');
      expect(service.mapEmploymentTypeToDb('Part-time')).toBe('part_time');
      expect(service.mapEmploymentTypeToDb('Contract')).toBe('contract');
      expect(service.mapEmploymentTypeToDb('Internship')).toBe('internship');
      expect(service.mapEmploymentTypeToDb('Freelance')).toBe('freelance');
    });

    it('formats experience end_date as null when is_current is true', async () => {
      await service.ensureProfileLoaded('user-uuid-123');

      await service.addExperience({
        company: 'Innovate Labs',
        job_title: 'Senior Developer',
        employment_type: 'Full-time',
        location: 'Bengaluru, India',
        start_date: '2022-01-01',
        end_date: 'Present',
        is_current: true,
        description: 'Leading frontend team',
      });

      expect(mockJspService.addExperience).toHaveBeenCalledWith(
        'jsp-uuid-999',
        expect.objectContaining({
          is_current: true,
          end_date: null,
          employment_type: 'full_time',
        })
      );
    });

    it('ensures parent job_seeker_profiles ID exists before saving education child records', async () => {
      service.resetState();
      mockJspService.upsertJobSeekerProfile.mockResolvedValueOnce({
        data: { id: 'jsp-new-real-uuid' },
        error: null,
      });

      await service.addEducation({
        institution: 'IIT Delhi',
        degree: 'B.Tech',
        field_of_study: 'Computer Science',
        start_date: '2016-08-01',
        end_date: '2020-05-31',
      });

      expect(mockJspService.upsertJobSeekerProfile).toHaveBeenCalled();
      expect(mockJspService.addEducation).toHaveBeenCalledWith(
        'jsp-new-real-uuid',
        expect.objectContaining({ institution: 'IIT Delhi' })
      );
    });

    it('creates or retrieves skill in catalog before binding to user', async () => {
      await service.ensureProfileLoaded('user-uuid-123');

      await service.addUserSkill('Kubernetes', 'advanced', 3);

      expect(mockJspService.getOrCreateSkill).toHaveBeenCalledWith('Kubernetes');
      expect(mockJspService.addUserSkill).toHaveBeenCalledWith(
        'jsp-uuid-999',
        'skill-db-1',
        'advanced',
        3
      );
    });
  });

  describe('3. submitCompleteOnboarding Atomic Completion & Recovery', () => {
    let service: JobSeekerService;

    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: getCommonProviders(),
      });
      service = TestBed.inject(JobSeekerService);
    });

    it('persists onboarding_completed = true only after all required section writes succeed', async () => {
      await service.ensureProfileLoaded('user-uuid-123');

      const callOrder: string[] = [];
      mockProfileService.updateProfile.mockImplementation(async () => {
        callOrder.push('profile');
        return { error: null };
      });
      mockJspService.upsertJobSeekerProfile.mockImplementation(async (_: any, payload: any) => {
        if (payload.onboarding_completed === true) {
          callOrder.push('complete');
        } else {
          callOrder.push('jsp_profile');
        }
        return { data: { id: 'jsp-uuid-999' }, error: null };
      });
      mockJspService.upsertPreferences.mockImplementation(async () => {
        callOrder.push('preferences');
        return { data: { id: 'pref-db-1' }, error: null };
      });

      const res = await service.submitCompleteOnboarding({
        personal: { full_name: 'Priya Sharma', phone: '+91 9876543210' },
        professional: { headline: 'Lead Architect', current_company: 'Acme', experience_years: 6 },
        preferences: { preferred_job_title: 'Staff Architect', remote_preference: 'remote' as any },
      });

      expect(res.success).toBe(true);
      expect(callOrder).toEqual(['profile', 'jsp_profile', 'preferences', 'complete']);
      expect(service.isOnboardingCompleted()).toBe(true);
    });

    it('aborts completion and keeps local completion false if a required section save fails', async () => {
      await service.ensureProfileLoaded('user-uuid-123');

      mockJspService.upsertJobSeekerProfile.mockImplementation(async (_: any, payload: any) => {
        if (payload.onboarding_completed !== true) {
          return { data: null, error: 'Database constraint violation on professional profile' };
        }
        return { data: { id: 'jsp-uuid-999' }, error: null };
      });

      const res = await service.submitCompleteOnboarding({
        personal: { full_name: 'Priya Sharma', phone: '+91 9876543210' },
        professional: { headline: 'Lead Architect' },
        preferences: { preferred_job_title: 'Staff Architect' },
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Failed to save professional profile');
      expect(service.isOnboardingCompleted()).toBe(false);
      expect(service.jobSeekerProfile().onboarding_completed).toBe(false);
    });

    it('flushes pending in-memory education and experience records during final submission', async () => {
      await service.ensureProfileLoaded('user-uuid-123');

      // Stage an in-memory education and experience with temporary IDs
      service.educationList.set([
        {
          id: 'edu-temp-1',
          job_seeker_id: 'jsp-uuid-999',
          institution: 'BITS Pilani',
          degree: 'M.Tech',
          field_of_study: 'Software Engineering',
          start_date: '2020-08-01',
          end_date: '2022-06-30',
          created_at: new Date().toISOString(),
        },
      ]);
      service.experienceList.set([
        {
          id: 'exp-temp-1',
          job_seeker_id: 'jsp-uuid-999',
          company_name: 'HyperGrowth Corp',
          company: 'HyperGrowth Corp',
          job_title: 'Tech Lead',
          employment_type: 'Full-time',
          location: 'Hyderabad, India',
          start_date: '2022-07-01',
          end_date: null,
          is_current: true,
          description: 'Architecting platform services',
          created_at: new Date().toISOString(),
        },
      ]);

      const res = await service.submitCompleteOnboarding({
        personal: { full_name: 'Priya Sharma', phone: '+91 9876543210' },
        professional: { headline: 'Lead Architect', current_company: 'Acme', experience_years: 6 },
        preferences: { preferred_job_title: 'Staff Architect' },
      });

      expect(res.success).toBe(true);
      expect(mockJspService.addEducation).toHaveBeenCalledWith(
        'jsp-uuid-999',
        expect.objectContaining({ institution: 'BITS Pilani' })
      );
      expect(mockJspService.addExperience).toHaveBeenCalledWith(
        'jsp-uuid-999',
        expect.objectContaining({ company_name: 'HyperGrowth Corp', is_current: true, end_date: null })
      );
    });
  });

  describe('4. OnboardingComponent Form Validation, Uploads & Double-Click Guard', () => {
    let comp: OnboardingComponent;
    let mockService: any;

    beforeEach(() => {
      mockService = {
        profile: signal({ id: 'user-uuid-123', full_name: 'Priya Sharma', phone: '+91 9876543210' }),
        jobSeekerProfile: signal({
          id: 'jsp-uuid-999',
          city: 'Bengaluru',
          state: 'Karnataka',
          country: 'India',
          location: 'Bengaluru, Karnataka, India',
          headline: 'Full Stack Engineer',
          bio: '5+ years building scalable apps',
          current_job_title: 'Software Engineer',
          current_company: 'Acme Corp',
          years_of_experience: 5,
          availability: '15 Days',
          onboarding_completed: false,
        }),
        preferences: signal({
          preferred_job_title: 'Staff Engineer',
          preferred_location: 'Bengaluru',
          remote_preference: 'hybrid',
          employment_type: 'full_time',
          min_salary: 3000000,
          max_salary: 5000000,
          experience_level: 'senior',
          willing_to_relocate: true,
        }),
        userSkills: signal([{ id: 's-1', skill_name: 'Angular', proficiency_level: 'expert' }]),
        catalogSkills: signal([]),
        resumes: signal([]),
        updatePersonalProfile: vi.fn(),
        updateProfessionalProfile: vi.fn(),
        updatePreferences: vi.fn(),
        uploadAvatar: vi.fn().mockResolvedValue({ publicUrl: 'https://storage/avatars/new.png' }),
        uploadResume: vi.fn().mockResolvedValue(true),
        submitCompleteOnboarding: vi.fn().mockResolvedValue({ success: true }),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [ReactiveFormsModule],
        providers: [
          FormBuilder,
          { provide: JobSeekerService, useValue: mockService },
          { provide: Router, useValue: mockRouter },
        ],
      });

      comp = TestBed.createComponent(OnboardingComponent).componentInstance;
      comp.ngOnInit();
    });

    it('rejects avatar photos exceeding 5MB', async () => {
      const largeFile = new File(['x'.repeat(100)], 'giant.png', { type: 'image/png' });
      Object.defineProperty(largeFile, 'size', { value: 6 * 1024 * 1024 });

      const event = { target: { files: [largeFile] } } as any;
      await comp.onAvatarFileSelected(event);

      expect(comp.errorMessage).toBe('Profile photo must be less than 5MB.');
      expect(mockService.uploadAvatar).not.toHaveBeenCalled();
    });

    it('rejects resume files with invalid formats', async () => {
      const invalidFile = new File(['executable'], 'virus.exe', { type: 'application/x-msdownload' });
      const event = { target: { files: [invalidFile] } } as any;

      await comp.onFileSelected(event);

      expect(comp.errorMessage).toBe('Resume must be a PDF or Word document (.pdf, .doc, .docx).');
      expect(mockService.uploadResume).not.toHaveBeenCalled();
    });

    it('passes valid File objects to uploadResume', async () => {
      const validResume = new File(['resume content'], 'resume.pdf', { type: 'application/pdf' });
      const event = { target: { files: [validResume] } } as any;

      await comp.onFileSelected(event);

      expect(mockService.uploadResume).toHaveBeenCalledWith(validResume, expect.any(String));
      expect(comp.errorMessage).toBeNull();
    });

    it('prevents duplicate submissions when double-clicked', async () => {
      comp.isSubmitting = true;
      await comp.finishOnboarding();

      expect(mockService.submitCompleteOnboarding).not.toHaveBeenCalled();
    });

    it('keeps user on step 5 with form state preserved if submission fails', async () => {
      comp.currentStep = 5;
      mockService.submitCompleteOnboarding.mockResolvedValueOnce({
        success: false,
        error: 'Database connection failed',
      });

      await comp.finishOnboarding();

      expect(comp.currentStep).toBe(5);
      expect(comp.errorMessage).toBe('Database connection failed');
      expect(comp.isSubmitting).toBe(false);
      expect(comp.step1Form.get('full_name')?.value).toBe('Priya Sharma');
    });

    it('advances to celebration step 6 only after submission succeeds', async () => {
      comp.currentStep = 5;
      mockService.submitCompleteOnboarding.mockResolvedValueOnce({ success: true });

      await comp.finishOnboarding();

      expect(comp.currentStep).toBe(6);
      expect(comp.errorMessage).toBeNull();
      expect(comp.isSubmitting).toBe(false);
    });
  });
});
