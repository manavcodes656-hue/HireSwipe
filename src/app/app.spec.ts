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

describe('HireSwipe Application & Authentication', () => {
  let mockAuthService: any;
  let mockCompanyDataService: any;
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
    };

    await TestBed.configureTestingModule({
      imports: [App, AuthComponent, LandingComponent],
      providers: [
        provideRouter(routes),
        { provide: AuthService, useValue: mockAuthService },
        { provide: CompanyDataService, useValue: mockCompanyDataService },
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

    it('should navigate to the job-seeker dashboard on a successful sign-in', async () => {
      mockAuthService.signIn.mockResolvedValue({ error: null });

      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.loginForm.patchValue({ email: 'alex@example.com', password: 'password123' });
      component.onSubmit();

      expect(mockAuthService.signIn).toHaveBeenCalledWith('alex@example.com', 'password123');
      await fixture.whenStable();
      expect(component.successMessage).toContain('Signed in successfully as Job Seeker');
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/dashboard']);
    });

    it('should navigate a company to onboarding when onboarding is not complete', async () => {
      mockAuthService.signIn.mockResolvedValue({ error: null });
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
