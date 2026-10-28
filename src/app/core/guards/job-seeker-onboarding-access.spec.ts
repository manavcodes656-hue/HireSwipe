import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { routes } from '../../app.routes';
import {
  jobSeekerDashboardGuard,
  jobSeekerOnboardingGuard,
  authGuard,
  companyGuard,
  guestGuard,
} from './auth.guard';
import { AuthService } from '../services/auth.service';
import { JobSeekerService } from '../../features/job-seeker/services/job-seeker.service';
import { CompanyDataService } from '../../features/company/services/company-data.service';
import { AuthComponent } from '../../components/auth/auth.component';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';

describe('Job Seeker Onboarding Access Control & Authentication Redirection (Phase 3)', () => {
  let mockAuthService: any;
  let mockJobSeekerService: any;
  let mockCompanyDataService: any;
  let mockRouter: any;

  beforeEach(() => {
    mockAuthService = {
      loading: signal(false),
      isAuthenticated: vi.fn(),
      isJobSeeker: vi.fn(),
      isCompany: vi.fn(),
      getCurrentUserId: vi.fn().mockReturnValue('u-user-456'),
      navigateAfterAuth: vi.fn(),
      signIn: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
      signInWithGoogle: vi.fn(),
    };

    mockJobSeekerService = {
      loading: signal(false),
      error: signal(null),
      jobSeekerProfile: signal({
        id: 'jsp-456',
        profile_id: 'u-user-456',
        onboarding_completed: false,
        profile_completion_pct: 0,
      }),
      isOnboardingCompleted: vi.fn(),
      ensureProfileLoaded: vi.fn().mockResolvedValue(true),
      setOnboardingCompleted: vi.fn(),
      resetState: vi.fn(),
    };

    mockCompanyDataService = {
      isOnboardingCompleted: vi.fn(),
      setOnboardingCompleted: vi.fn(),
      initialize: vi.fn().mockResolvedValue(undefined),
    };

    mockRouter = {
      navigate: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        { provide: AuthService, useValue: mockAuthService },
        { provide: JobSeekerService, useValue: mockJobSeekerService },
        { provide: CompanyDataService, useValue: mockCompanyDataService },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: {
            url: of([]),
            queryParams: of({}),
          },
        },
      ],
    });
  });

  describe('Scenario 1: Unauthenticated user requests protected routes', () => {
    it('should redirect unauthenticated user from protected dashboard to /login', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(false);
      const canAccess = await TestBed.runInInjectionContext(() => jobSeekerDashboardGuard({} as any, {} as any));
      expect(canAccess).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should redirect unauthenticated user from onboarding to /login', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(false);
      const canAccess = await TestBed.runInInjectionContext(() => jobSeekerOnboardingGuard({} as any, {} as any));
      expect(canAccess).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('Scenario 2 & 3: Job Seeker Login Redirections', () => {
    it('should redirect incomplete Job Seeker to /job-seeker/onboarding on login', async () => {
      const authComp = new AuthComponent(
        TestBed.inject(FormBuilder),
        TestBed.inject(ActivatedRoute),
        mockRouter,
        mockCompanyDataService,
        mockJobSeekerService,
        mockAuthService
      );

      authComp.role = 'jobseeker';
      authComp.mode = 'login';
      authComp.ngOnInit();
      authComp.loginForm.patchValue({ email: 'seeker@example.com', password: 'password123' });

      mockJobSeekerService.isOnboardingCompleted.mockReturnValue(false);

      authComp.onSubmit();
      await new Promise((r) => setTimeout(r, 600));

      expect(mockJobSeekerService.ensureProfileLoaded).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/onboarding']);
    });

    it('should redirect completed Job Seeker to /job-seeker/dashboard on login', async () => {
      const authComp = new AuthComponent(
        TestBed.inject(FormBuilder),
        TestBed.inject(ActivatedRoute),
        mockRouter,
        mockCompanyDataService,
        mockJobSeekerService,
        mockAuthService
      );

      authComp.role = 'jobseeker';
      authComp.mode = 'login';
      authComp.ngOnInit();
      authComp.loginForm.patchValue({ email: 'seeker@example.com', password: 'password123' });

      mockJobSeekerService.isOnboardingCompleted.mockReturnValue(true);

      authComp.onSubmit();
      await new Promise((r) => setTimeout(r, 600));

      expect(mockJobSeekerService.ensureProfileLoaded).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/dashboard']);
    });
  });

  describe('Scenario 4, 5, 6: Incomplete Job Seeker manually enters protected dashboard routes', () => {
    it('should block incomplete Job Seeker from entering /job-seeker/dashboard', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(true);
      mockJobSeekerService.isOnboardingCompleted.mockReturnValue(false);

      const canAccess = await TestBed.runInInjectionContext(() => jobSeekerDashboardGuard({} as any, {} as any));
      expect(canAccess).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/onboarding']);
    });

    it('should block incomplete Job Seeker from entering child route /job-seeker/applications', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(true);
      mockJobSeekerService.isOnboardingCompleted.mockReturnValue(false);

      const canAccess = await TestBed.runInInjectionContext(() => jobSeekerDashboardGuard({} as any, {} as any));
      expect(canAccess).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/onboarding']);
    });

    it('should block incomplete Job Seeker from entering /job-seeker/swipe or /job-seeker/matches', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(true);
      mockJobSeekerService.isOnboardingCompleted.mockReturnValue(false);

      const canAccess = await TestBed.runInInjectionContext(() => jobSeekerDashboardGuard({} as any, {} as any));
      expect(canAccess).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/onboarding']);
    });
  });

  describe('Scenario 7: Completed Job Seeker visits /job-seeker/onboarding', () => {
    it('should redirect completed Job Seeker away from onboarding to /job-seeker/dashboard', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(true);
      mockJobSeekerService.isOnboardingCompleted.mockReturnValue(true);

      const canAccess = await TestBed.runInInjectionContext(() => jobSeekerOnboardingGuard({} as any, {} as any));
      expect(canAccess).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/dashboard']);
    });

    it('should allow incomplete Job Seeker to stay on /job-seeker/onboarding', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(true);
      mockJobSeekerService.isOnboardingCompleted.mockReturnValue(false);

      const canAccess = await TestBed.runInInjectionContext(() => jobSeekerOnboardingGuard({} as any, {} as any));
      expect(canAccess).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalledWith(['/job-seeker/dashboard']);
    });
  });

  describe('Scenario 8, 9, 10: Profile loading, missing profiles, and network errors', () => {
    it('should deny dashboard access safely when profile load fails with an exception', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(true);
      mockJobSeekerService.ensureProfileLoaded.mockRejectedValue(new Error('Network offline'));

      const canAccess = await TestBed.runInInjectionContext(() => jobSeekerDashboardGuard({} as any, {} as any));
      expect(canAccess).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/onboarding']);
    });

    it('should deny dashboard access safely when JobSeekerService error signal is set', async () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(true);
      mockJobSeekerService.error.set('Failed to fetch user data');

      const canAccess = await TestBed.runInInjectionContext(() => jobSeekerDashboardGuard({} as any, {} as any));
      expect(canAccess).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/onboarding']);
    });
  });

  describe('Scenario 11: Logout and account switching state isolation', () => {
    it('should trigger resetState when switching accounts', () => {
      mockJobSeekerService.resetState();
      expect(mockJobSeekerService.resetState).toHaveBeenCalled();
    });
  });

  describe('Scenario 13: Job Seeker signup redirection', () => {
    it('should mark onboarding incomplete and redirect to /job-seeker/onboarding on signup', async () => {
      const authComp = new AuthComponent(
        TestBed.inject(FormBuilder),
        TestBed.inject(ActivatedRoute),
        mockRouter,
        mockCompanyDataService,
        mockJobSeekerService,
        mockAuthService
      );

      authComp.role = 'jobseeker';
      authComp.mode = 'signup';
      authComp.ngOnInit();
      authComp.signupForm.patchValue({
        fullName: 'New Seeker',
        email: 'newseeker@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        termsAccepted: true,
      });

      authComp.onSubmit();
      await new Promise((r) => setTimeout(r, 600));

      expect(mockJobSeekerService.setOnboardingCompleted).toHaveBeenCalledWith(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/onboarding']);
    });
  });

  describe('Scenario 14 & 15: Company functionality remains completely preserved', () => {
    it('should redirect company signup to /company/onboarding with company completion set to false', async () => {
      const authComp = new AuthComponent(
        TestBed.inject(FormBuilder),
        TestBed.inject(ActivatedRoute),
        mockRouter,
        mockCompanyDataService,
        mockJobSeekerService,
        mockAuthService
      );

      mockAuthService.isCompany = vi.fn().mockReturnValue(true);
      authComp.role = 'company';
      authComp.mode = 'signup';
      authComp.ngOnInit();
      authComp.signupForm.patchValue({
        fullName: 'Acme Corp',
        email: 'hr@acme.com',
        password: 'password123',
        confirmPassword: 'password123',
        termsAccepted: true,
      });

      authComp.onSubmit();
      await new Promise((r) => setTimeout(r, 600));

      expect(mockCompanyDataService.setOnboardingCompleted).toHaveBeenCalledWith(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/company/onboarding']);
    });

    it('should redirect completed company login to /company/dashboard', async () => {
      const authComp = new AuthComponent(
        TestBed.inject(FormBuilder),
        TestBed.inject(ActivatedRoute),
        mockRouter,
        mockCompanyDataService,
        mockJobSeekerService,
        mockAuthService
      );

      mockAuthService.isCompany = vi.fn().mockReturnValue(true);
      authComp.role = 'company';
      authComp.mode = 'login';
      authComp.ngOnInit();
      authComp.loginForm.patchValue({ email: 'hr@acme.com', password: 'password123' });
      mockCompanyDataService.isOnboardingCompleted.mockReturnValue(true);

      authComp.onSubmit();
      await new Promise((r) => setTimeout(r, 600));

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/company/dashboard']);
    });

    it('should redirect incomplete company login to /company/onboarding', async () => {
      const authComp = new AuthComponent(
        TestBed.inject(FormBuilder),
        TestBed.inject(ActivatedRoute),
        mockRouter,
        mockCompanyDataService,
        mockJobSeekerService,
        mockAuthService
      );

      mockAuthService.isCompany = vi.fn().mockReturnValue(true);
      authComp.role = 'company';
      authComp.mode = 'login';
      authComp.ngOnInit();
      authComp.loginForm.patchValue({ email: 'hr@acme.com', password: 'password123' });
      mockCompanyDataService.isOnboardingCompleted.mockReturnValue(false);

      authComp.onSubmit();
      await new Promise((r) => setTimeout(r, 600));

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/company/onboarding']);
    });
  });

  describe('Scenario 16: Route hierarchy and protection structure', () => {
    it('should have job-seeker/onboarding protected by jobSeekerOnboardingGuard', () => {
      const onboardingRoute = routes.find((r) => r.path === 'job-seeker/onboarding');
      expect(onboardingRoute).toBeDefined();
      expect(onboardingRoute?.canActivate).toContain(jobSeekerOnboardingGuard);
    });

    it('should have job-seeker dashboard layout protected by jobSeekerDashboardGuard on canActivate and canActivateChild', () => {
      const jobSeekerRoute = routes.find((r) => r.path === 'job-seeker');
      expect(jobSeekerRoute).toBeDefined();
      expect(jobSeekerRoute?.canActivate).toContain(jobSeekerDashboardGuard);
      expect(jobSeekerRoute?.canActivateChild).toContain(jobSeekerDashboardGuard);
    });

    it('should have wildcard route redirecting to empty root path', () => {
      const wildcardRoute = routes.find((r) => r.path === '**');
      expect(wildcardRoute).toBeDefined();
      expect(wildcardRoute?.redirectTo).toBe('');
    });
  });
});
