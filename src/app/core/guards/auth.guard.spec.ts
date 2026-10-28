import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  authGuard,
  jobSeekerGuard,
  companyGuard,
  guestGuard,
  jobSeekerDashboardGuard,
  jobSeekerOnboardingGuard,
} from './auth.guard';
import { AuthService } from '../services/auth.service';
import { JobSeekerService } from '../../features/job-seeker/services/job-seeker.service';
import { signal } from '@angular/core';

describe('Security Route Guards (Phase 3)', () => {
  let mockAuthService: any;
  let mockJobSeekerService: any;
  let mockRouter: any;

  beforeEach(() => {
    mockAuthService = {
      loading: signal(false),
      isAuthenticated: vi.fn(),
      isJobSeeker: vi.fn(),
      isCompany: vi.fn(),
      getCurrentUserId: vi.fn().mockReturnValue('u-test-123'),
      navigateAfterAuth: vi.fn(),
    };

    mockJobSeekerService = {
      loading: signal(false),
      error: signal(null),
      isOnboardingCompleted: vi.fn(),
      ensureProfileLoaded: vi.fn().mockResolvedValue(true),
      setOnboardingCompleted: vi.fn(),
      resetState: vi.fn(),
    };

    mockRouter = {
      navigate: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: JobSeekerService, useValue: mockJobSeekerService },
        { provide: Router, useValue: mockRouter },
      ],
    });
  });

  describe('authGuard', () => {
    it('waits for session restore and redirects when none exists', async () => {
      mockAuthService.loading.set(true);
      mockAuthService.isAuthenticated.mockReturnValue(false);
      setTimeout(() => mockAuthService.loading.set(false), 50);
      const result = await TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should redirect unauthenticated users to /login', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(false);
      const result = await TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should allow navigation for authenticated users', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      const result = await TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
      expect(result).toBe(true);
    });
  });

  describe('jobSeekerGuard', () => {
    it('waits for session restore and redirects when none exists', async () => {
      mockAuthService.loading.set(true);
      mockAuthService.isAuthenticated.mockReturnValue(false);
      setTimeout(() => mockAuthService.loading.set(false), 50);
      const result = await TestBed.runInInjectionContext(() => jobSeekerGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should redirect unauthenticated users to /login', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(false);
      const result = await TestBed.runInInjectionContext(() => jobSeekerGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should redirect non-job-seekers to company dashboard', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(false);
      const result = await TestBed.runInInjectionContext(() => jobSeekerGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/company/dashboard']);
    });

    it('should allow verified job seekers to proceed', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(true);
      const result = await TestBed.runInInjectionContext(() => jobSeekerGuard({} as any, {} as any));
      expect(result).toBe(true);
    });
  });

  describe('companyGuard', () => {
    it('waits for session restore and redirects when none exists', async () => {
      mockAuthService.loading.set(true);
      mockAuthService.isAuthenticated.mockReturnValue(false);
      setTimeout(() => mockAuthService.loading.set(false), 50);
      const result = await TestBed.runInInjectionContext(() => companyGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should redirect unauthenticated users to /login', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(false);
      const result = await TestBed.runInInjectionContext(() => companyGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should redirect non-company users to job seeker dashboard', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isCompany.mockReturnValue(false);
      const result = await TestBed.runInInjectionContext(() => companyGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/dashboard']);
    });

    it('should allow verified company members to proceed', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isCompany.mockReturnValue(true);
      const result = await TestBed.runInInjectionContext(() => companyGuard({} as any, {} as any));
      expect(result).toBe(true);
    });
  });

  describe('guestGuard', () => {
    it('should allow unauthenticated visitors to view login/signup', () => {
      mockAuthService.isAuthenticated.mockReturnValue(false);
      const result = TestBed.runInInjectionContext(() => guestGuard({} as any, {} as any));
      expect(result).toBe(true);
    });

    it('should redirect authenticated users to their home area', () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      const result = TestBed.runInInjectionContext(() => guestGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockAuthService.navigateAfterAuth).toHaveBeenCalledWith('login');
    });
  });

  describe('jobSeekerDashboardGuard', () => {
    it('should redirect unauthenticated users to /login', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(false);
      const result = await TestBed.runInInjectionContext(() => jobSeekerDashboardGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should redirect company users to /company/dashboard', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(false);
      mockAuthService.isCompany.mockReturnValue(true);
      const result = await TestBed.runInInjectionContext(() => jobSeekerDashboardGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/company/dashboard']);
    });

    it('should redirect unassigned/unknown roles to /', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(false);
      mockAuthService.isCompany.mockReturnValue(false);
      const result = await TestBed.runInInjectionContext(() => jobSeekerDashboardGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/']);
    });

    it('should redirect incomplete Job Seeker to /job-seeker/onboarding', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(true);
      mockJobSeekerService.isOnboardingCompleted.mockReturnValue(false);

      const result = await TestBed.runInInjectionContext(() => jobSeekerDashboardGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockJobSeekerService.ensureProfileLoaded).toHaveBeenCalledWith('u-test-123');
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/onboarding']);
    });

    it('should allow completed Job Seeker to access dashboard routes', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(true);
      mockJobSeekerService.isOnboardingCompleted.mockReturnValue(true);

      const result = await TestBed.runInInjectionContext(() => jobSeekerDashboardGuard({} as any, {} as any));
      expect(result).toBe(true);
      expect(mockJobSeekerService.ensureProfileLoaded).toHaveBeenCalledWith('u-test-123');
    });

    it('should redirect to /job-seeker/onboarding if profile load encounters an error', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(true);
      mockJobSeekerService.ensureProfileLoaded.mockRejectedValue(new Error('Network failure'));

      const result = await TestBed.runInInjectionContext(() => jobSeekerDashboardGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/onboarding']);
    });

    it('should redirect to /job-seeker/onboarding if JobSeekerService error signal is set', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(true);
      mockJobSeekerService.error.set('Database connection timeout');

      const result = await TestBed.runInInjectionContext(() => jobSeekerDashboardGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/onboarding']);
    });
  });

  describe('jobSeekerOnboardingGuard', () => {
    it('should redirect unauthenticated users to /login', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(false);
      const result = await TestBed.runInInjectionContext(() => jobSeekerOnboardingGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should redirect company users to /company/onboarding', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(false);
      mockAuthService.isCompany.mockReturnValue(true);
      const result = await TestBed.runInInjectionContext(() => jobSeekerOnboardingGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/company/onboarding']);
    });

    it('should redirect completed Job Seeker to /job-seeker/dashboard', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(true);
      mockJobSeekerService.isOnboardingCompleted.mockReturnValue(true);

      const result = await TestBed.runInInjectionContext(() => jobSeekerOnboardingGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/dashboard']);
    });

    it('should allow incomplete Job Seeker to access /job-seeker/onboarding', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(true);
      mockJobSeekerService.isOnboardingCompleted.mockReturnValue(false);

      const result = await TestBed.runInInjectionContext(() => jobSeekerOnboardingGuard({} as any, {} as any));
      expect(result).toBe(true);
    });

    it('should allow access to onboarding form if profile loading encounters an error so user can retry', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(true);
      mockJobSeekerService.ensureProfileLoaded.mockRejectedValue(new Error('Fetch failed'));

      const result = await TestBed.runInInjectionContext(() => jobSeekerOnboardingGuard({} as any, {} as any));
      expect(result).toBe(true);
    });
  });
});
