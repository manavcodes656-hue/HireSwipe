import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { AuthComponent } from './components/auth/auth.component';
import { LandingComponent } from './components/landing/landing.component';

describe('HireSwipe Application & Authentication', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App, AuthComponent, LandingComponent],
      providers: [provideRouter(routes)],
    }).compileComponents();
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

    it('should successfully submit valid login form', () => {
      const fixture = TestBed.createComponent(AuthComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.loginForm.patchValue({
        email: 'alex@example.com',
        password: 'password123',
      });

      component.onSubmit();
      expect(component.loginForm.valid).toBe(true);
      expect(component.successMessage).toContain('Signed in successfully as Job Seeker');
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

    it('should successfully submit valid signup form', () => {
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
      expect(component.signupForm.valid).toBe(true);
      expect(component.successMessage).toContain('Account created successfully as Job Seeker');
    });
  });
});
