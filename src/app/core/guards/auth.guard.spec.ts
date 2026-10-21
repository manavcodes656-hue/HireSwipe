import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authGuard, jobSeekerGuard, companyGuard, guestGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { signal } from '@angular/core';

describe('Security Route Guards (Phase 2)', () => {
  let mockAuthService: any;
  let mockRouter: any;

  beforeEach(() => {
    mockAuthService = {
      loading: signal(false),
      isAuthenticated: vi.fn(),
      isJobSeeker: vi.fn(),
      isCompany: vi.fn(),
      navigateAfterAuth: vi.fn(),
    };

    mockRouter = {
      navigate: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
      ],
    });
  });

  describe('authGuard', () => {
    it('should allow navigation if session is loading', () => {
      mockAuthService.loading.set(true);
      const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
      expect(result).toBe(true);
    });

    it('should redirect unauthenticated users to /login', () => {
      mockAuthService.isAuthenticated.mockReturnValue(false);
      const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should allow navigation for authenticated users', () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
      expect(result).toBe(true);
    });
  });

  describe('jobSeekerGuard', () => {
    it('should allow navigation while session is loading', () => {
      mockAuthService.loading.set(true);
      const result = TestBed.runInInjectionContext(() => jobSeekerGuard({} as any, {} as any));
      expect(result).toBe(true);
    });

    it('should redirect unauthenticated users to /login', () => {
      mockAuthService.isAuthenticated.mockReturnValue(false);
      const result = TestBed.runInInjectionContext(() => jobSeekerGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should redirect non-job-seekers to company dashboard', () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(false);
      const result = TestBed.runInInjectionContext(() => jobSeekerGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/company/dashboard']);
    });

    it('should allow verified job seekers to proceed', () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isJobSeeker.mockReturnValue(true);
      const result = TestBed.runInInjectionContext(() => jobSeekerGuard({} as any, {} as any));
      expect(result).toBe(true);
    });
  });

  describe('companyGuard', () => {
    it('should allow navigation while session is loading', () => {
      mockAuthService.loading.set(true);
      const result = TestBed.runInInjectionContext(() => companyGuard({} as any, {} as any));
      expect(result).toBe(true);
    });

    it('should redirect unauthenticated users to /login', () => {
      mockAuthService.isAuthenticated.mockReturnValue(false);
      const result = TestBed.runInInjectionContext(() => companyGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should redirect non-company users to job seeker dashboard', () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isCompany.mockReturnValue(false);
      const result = TestBed.runInInjectionContext(() => companyGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/job-seeker/dashboard']);
    });

    it('should allow verified company members to proceed', () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.isCompany.mockReturnValue(true);
      const result = TestBed.runInInjectionContext(() => companyGuard({} as any, {} as any));
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
});
