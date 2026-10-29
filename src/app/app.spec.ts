import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { AuthComponent } from './components/auth/auth.component';
import { LandingComponent } from './components/landing/landing.component';
import { AuthService } from './core/services/auth.service';
import { CompanyDataService } from './features/company/services/company-data.service';
import { JobSeekerService } from './features/job-seeker/services/job-seeker.service';

describe('HireSwipe Application & Authentication', () => {
  let mockAuthService: any;
  let mockCompanyDataService: any;
  let mockJobSeekerService: any;
  let mockRouter: Router;

  beforeEach(async () => {
    mockAuthService = {
      session: signal(null),
      user: signal(null),
      loading: signal(false),
      profileRole: signal(null),
      isAuthenticated: computed(() => !!mockAuthService.session()),
      isCompany: computed(
        () =>
          mockAuthService.profileRole() === 'company' ||
          mockAuthService.user()?.user_metadata?.role === 'company'
      ),
      isJobSeeker: computed(
        () =>
          mockAuthService.profileRole() === 'job_seeker' ||
          mockAuthService.user()?.user_metadata?.role === 'job_seeker'
      ),
      isAdmin: computed(() => false),
      navigateAfterAuth: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      changePassword: vi.fn(),
      getCurrentUserId: vi.fn(() => null),
    };

    mockCompanyDataService = {
      isOnboardingCompleted: vi.fn(() => false),
      setOnboardingCompleted: vi.fn(),
      initialize: vi.fn().mockResolvedValue(undefined),
    };

    mockJobSeekerService = {
      ensureProfileLoaded: vi.fn().mockResolvedValue(true),
      isOnboardingCompleted: vi.fn(() => false),
      setOnboardingCompleted: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [App, AuthComponent, LandingComponent],
      providers: [
        provideRouter(routes),
        { provide: AuthService, useValue: mockAuthService },
        { provide: CompanyDataService, useValue: mockCompanyDataService },
        { provide: JobSeekerService, useValue: mockJobSeekerService },
      ],
    }).compileComponents();

    mockRouter = TestBed.inject(Router);
    vi.spyOn(mockRouter, 'navigate').mockResolvedValue(true);
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render landing page hero heading', async () => {
    const fixture = TestBed.createComponent(LandingComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('perfect job match');
  });

  describe('AuthComponent', () => {
    it('should initialize with Job Seeker role and Login mode by default', () => {
      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.role).toBe('jobseeker');
      expect(component.mode).toBe('login');
      expect(component.loginForm).toBeDefined();
      expect(component.signupForm).toBeDefined();
    });

    it('should switch roles between Job Seeker and Company', () => {
      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.setRole('company');
      expect(component.role).toBe('company');

      component.setRole('jobseeker');
      expect(component.role).toBe('jobseeker');
    });

    it('should switch modes between Login and Sign Up', () => {
      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.setMode('signup');
      expect(component.mode).toBe('signup');

      component.setMode('login');
      expect(component.mode).toBe('login');
    });

    it('should validate invalid login submission', () => {
      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.onSubmit();
      expect(component.loginForm.invalid).toBe(true);
      expect(component.isFieldInvalid('email')).toBe(true);
      expect(component.isFieldInvalid('password')).toBe(true);
    });

    it('should not navigate on a failed sign-in (no fabricated session)', async () => {
      mockAuthService.signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });

      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.loginForm.patchValue({ email: 'alex@example.com', password: 'password123' });
      component.onSubmit();

      expect(mockAuthService.signIn).toHaveBeenCalledWith('alex@example.com', 'password123');
      await fixture.whenStable();
      expect(component.authError).toContain('Invalid login credentials');
      expect(mockRouter.navigate).not.toHaveBeenCalled();
      expect(component.successMessage).toBe('');
    });

    it('should navigate to the job-seeker dashboard on a successful sign-in when onboarding is complete', async () => {
      mockAuthService.signIn.mockResolvedValue({ error: null });
      mockJobSeekerService.isOnboardingCompleted.mockReturnValue(true);

      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.loginForm.patchValue({ email: 'alex@example.com', password: 'password123' });
      component.onSubmit();

      expect(mockAuthService.signIn).toHaveBeenCalledWith('alex@example.com', 'password123');
      await fixture.whenStable();
      expect(component.successMessage).toContain('Signed in successfully as Job Seeker');
      expect(mockJobSeekerService.ensureProfileLoaded).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/dashboard']);
    });

    it('should redirect an incomplete job seeker to onboarding on sign-in', async () => {
      mockAuthService.signIn.mockResolvedValue({ error: null });
      mockJobSeekerService.isOnboardingCompleted.mockReturnValue(false);

      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.loginForm.patchValue({ email: 'alex@example.com', password: 'password123' });
      component.onSubmit();

      await fixture.whenStable();
      expect(mockJobSeekerService.ensureProfileLoaded).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/onboarding']);
    });

    it('should navigate a company to onboarding when onboarding is not complete', async () => {
      mockAuthService.signIn.mockResolvedValue({ error: null });
      mockAuthService.isCompany = vi.fn().mockReturnValue(true);
      mockCompanyDataService.isOnboardingCompleted.mockReturnValue(false);

      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.setRole('company');
      component.loginForm.patchValue({ email: 'hiring@acme.test', password: 'password123' });
      component.onSubmit();

      await fixture.whenStable();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/company/onboarding']);
    });

    it('shows the auth error and clears loading when sign-in fails', async () => {
      mockAuthService.signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      component.loginForm.patchValue({ email: 'a@b.co', password: 'password123' });

      await component.onSubmit();
      fixture.detectChanges();

      expect(component.authError).toBe('Invalid login credentials');
      expect(component.loading).toBe(false);
      expect(fixture.nativeElement.querySelector('.error-banner')?.textContent).toContain('Invalid login credentials');
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('shows an error and clears loading when sign-in throws (network failure)', async () => {
      mockAuthService.signIn.mockRejectedValue(new TypeError('fetch failed'));
      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      component.loginForm.patchValue({ email: 'a@b.co', password: 'password123' });

      await component.onSubmit();

      expect(component.authError).toBe('fetch failed');
      expect(component.loading).toBe(false);
    });

    it('routes by the stored profile role, not the selected tab', async () => {
      mockAuthService.signIn.mockResolvedValue({ error: null });
      mockAuthService.isCompany = vi.fn().mockReturnValue(true);
      mockAuthService.getCurrentUserId = vi.fn(() => 'u-1');
      mockCompanyDataService.isOnboardingCompleted.mockReturnValue(true);
      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      component.loginForm.patchValue({ email: 'a@b.co', password: 'password123' }); // job-seeker tab selected

      await component.onSubmit();

      expect(mockCompanyDataService.initialize).toHaveBeenCalledWith('u-1');
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/company/dashboard']);
    });

    it.each([
      ['jobseeker', 'job_seeker', '/job-seeker/onboarding'],
      ['company', 'company', '/company/onboarding'],
    ])('signup on the %s tab requests role %s and goes to onboarding', async (tab, role, route) => {
      mockAuthService.signUp.mockResolvedValue({ error: null });
      mockAuthService.isCompany = vi.fn().mockReturnValue(role === 'company');
      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      component.setRole(tab as any);
      component.setMode('signup');
      component.signupForm.patchValue({ fullName: 'Al Ex', email: 'a@b.co', password: 'password123', confirmPassword: 'password123', termsAccepted: true });

      await component.onSubmit();

      expect(mockAuthService.signUp).toHaveBeenCalledWith('a@b.co', 'password123', 'Al Ex', role);
      expect(mockRouter.navigate).toHaveBeenCalledWith([route]);
    });

    it('signup routes by the stored profile role even if the company tab was selected', async () => {
      mockAuthService.signUp.mockResolvedValue({ error: null });
      mockAuthService.isCompany = vi.fn().mockReturnValue(false);
      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      component.setRole('company');
      component.setMode('signup');
      component.signupForm.patchValue({ fullName: 'Al Ex', email: 'a@b.co', password: 'password123', confirmPassword: 'password123', termsAccepted: true });

      await component.onSubmit();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/onboarding']);
    });

    it('ignores a duplicate submit while a request is in flight', async () => {
      let release!: (v: any) => void;
      mockAuthService.signIn.mockReturnValue(new Promise((r) => (release = r)));
      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      component.loginForm.patchValue({ email: 'a@b.co', password: 'password123' });

      const first = component.onSubmit();
      expect(component.loading).toBe(true);
      await component.onSubmit();
      expect(mockAuthService.signIn).toHaveBeenCalledTimes(1);

      release({ error: { message: 'nope' } });
      await first;
      expect(component.loading).toBe(false);
      expect(component.authError).toBe('nope');
    });

    it('signup with email verification pending shows a message and does not navigate', async () => {
      mockAuthService.signUp.mockResolvedValue({ error: null, needsEmailVerification: true });
      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      component.setMode('signup');
      component.signupForm.patchValue({ fullName: 'Al Ex', email: 'a@b.co', password: 'password123', confirmPassword: 'password123', termsAccepted: true });

      await component.onSubmit();

      expect(component.successMessage).toMatch(/verification link/);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should validate password mismatch in signup form', () => {
      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.setMode('signup');
      component.signupForm.patchValue({
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        password: 'password123',
        confirmPassword: 'differentpassword',
      });

      component.onSubmit();
      expect(component.signupForm.hasError('passwordMismatch')).toBe(true);
      expect(component.getFieldError('confirmPassword')).toBe('Passwords do not match.');
    });

    it('should not navigate on a failed sign-up (no fabricated account)', async () => {
      mockAuthService.signUp.mockResolvedValue({ error: { message: 'Email already registered' } });

      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.setMode('signup');
      component.signupForm.patchValue({
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        termsAccepted: true,
      });

      component.onSubmit();

      expect(mockAuthService.signUp).toHaveBeenCalledWith(
        'jane@example.com',
        'password123',
        'Jane Doe',
        'job_seeker',
      );
      await fixture.whenStable();
      expect(component.authError).toContain('Email already registered');
      expect(mockRouter.navigate).not.toHaveBeenCalled();
      expect(component.successMessage).toBe('');
    });

    it('should navigate to job-seeker onboarding on a successful sign-up', async () => {
      mockAuthService.signUp.mockResolvedValue({ error: null });

      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.setMode('signup');
      component.signupForm.patchValue({
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        termsAccepted: true,
      });

      component.onSubmit();

      await fixture.whenStable();
      expect(mockAuthService.signUp).toHaveBeenCalledWith(
        'jane@example.com',
        'password123',
        'Jane Doe',
        'job_seeker',
      );
      expect(component.successMessage).toContain('Account created successfully as Job Seeker');
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/onboarding']);
    });
  });
});
