import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationsService, ApplicationRow } from './applications.service';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { environment } from '../../../environments/environment';

describe('ApplicationsService — Backend Integration Tests', () => {
  let service: ApplicationsService;
  let httpMock: HttpTestingController;
  let mockAuthService: any;
  let mockSupabaseService: any;

  const apiUrl = environment.apiUrl || 'http://localhost:3000/api';
  const companyId = '11111111-1111-1111-1111-111111111111';
  const jobId = '22222222-2222-2222-2222-222222222222';
  const applicationId = '33333333-3333-3333-3333-333333333333';

  const dummyApp: ApplicationRow = {
    id: applicationId,
    company_id: companyId,
    job_id: jobId,
    job_seeker_id: '44444444-4444-4444-4444-444444444444',
    resume_id: '55555555-5555-5555-5555-555555555555',
    cover_letter: 'I am excited to apply for this role.',
    status: 'pending',
    match_score: 92,
    applied_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    TestBed.resetTestingModule();

    mockAuthService = {
      getAccessToken: vi.fn().mockResolvedValue('mock-access-token-xyz'),
      getCurrentUserId: vi.fn().mockReturnValue('user-uuid-123'),
    };

    mockSupabaseService = {
      client: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [dummyApp], error: null }),
            }),
            order: vi.fn().mockResolvedValue({ data: [dummyApp], error: null }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: dummyApp, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      },
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ApplicationsService,
        { provide: AuthService, useValue: mockAuthService },
        { provide: SupabaseService, useValue: mockSupabaseService },
      ],
    });

    service = TestBed.inject(ApplicationsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  describe('GET /api/company/applications', () => {
    it('retrieves applications for the company with Bearer token', async () => {
      const promise = service.getCompanyApplications(companyId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/applications`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');

      req.flush({ status: 'ok', applications: [dummyApp] });
      const result = await promise;
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(applicationId);
    });

    it('passes jobId query parameter when provided', async () => {
      const promise = service.getCompanyApplications(companyId, jobId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/applications?jobId=${jobId}`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');

      req.flush({ status: 'ok', applications: [dummyApp] });
      const result = await promise;
      expect(result).toHaveLength(1);
    });

    it('fails closed and returns an empty list on 401 Unauthorized', async () => {
      const promise = service.getCompanyApplications(companyId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/applications`);
      req.flush(
        { error: { code: 'UNAUTHORIZED', message: 'Token expired' } },
        { status: 401, statusText: 'Unauthorized' }
      );

      const result = await promise;
      expect(result).toEqual([]);
    });

    it('fails closed and returns an empty list on 403 Forbidden', async () => {
      const promise = service.getCompanyApplications(companyId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/applications`);
      req.flush(
        { error: { code: 'FORBIDDEN', message: 'No company membership' } },
        { status: 403, statusText: 'Forbidden' }
      );

      const result = await promise;
      expect(result).toEqual([]);
    });

    it('falls back to direct Supabase query when network error or server offline occurs', async () => {
      const promise = service.getCompanyApplications(companyId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/applications`);
      req.error(new ProgressEvent('Network error'));

      const result = await promise;
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('applications');
      expect(result).toBeDefined();
    });
  });

  describe('GET /api/company/applications/:applicationId', () => {
    it('retrieves an authorized application with Bearer token', async () => {
      const promise = service.getApplication(applicationId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/applications/${applicationId}`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');

      req.flush({ status: 'ok', application: dummyApp });
      const result = await promise;
      expect(result).toEqual(dummyApp);
    });

    it('returns null when application is not found (404)', async () => {
      const promise = service.getApplication(applicationId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/applications/${applicationId}`);
      req.flush(
        { error: { code: 'APPLICATION_NOT_FOUND', message: 'Not found' } },
        { status: 404, statusText: 'Not Found' }
      );

      const result = await promise;
      expect(result).toBeNull();
    });
  });

  describe('PATCH /api/company/applications/:applicationId/status', () => {
    it('updates application status and passes review notes with Bearer token', async () => {
      const promise = service.updateApplicationStatus(applicationId, 'shortlisted', 'Impressive GitHub portfolio');
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/applications/${applicationId}/status`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');
      expect(req.request.body).toEqual({ status: 'shortlisted', note: 'Impressive GitHub portfolio' });

      req.flush({ status: 'ok', application: { ...dummyApp, status: 'shortlisted' } });
      const result = await promise;
      expect(result).toEqual({ error: null });
    });

    it('returns structured error when backend rejects status update', async () => {
      const promise = service.updateApplicationStatus(applicationId, 'withdrawn');
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/applications/${applicationId}/status`);
      req.flush(
        { error: { code: 'INVALID_STATUS', message: 'Only candidates can withdraw applications' } },
        { status: 400, statusText: 'Bad Request' }
      );

      const result = await promise;
      expect(result.error).toBe('Only candidates can withdraw applications');
    });
  });

  describe('Direct Supabase Job Seeker Operations', () => {
    it('preserves getJobSeekerApplications direct query for candidate dashboard', async () => {
      const result = await service.getJobSeekerApplications('seeker-1');
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('applications');
      expect(result).toHaveLength(1);
    });

    it('preserves applyToJob direct submission', async () => {
      const result = await service.applyToJob(jobId, 'seeker-1', companyId, undefined, 'My cover letter');
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('applications');
      expect(result.error).toBeNull();
      expect(result.data).toEqual(dummyApp);
    });

    it('preserves withdrawApplication direct query', async () => {
      await service.withdrawApplication(applicationId);
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('applications');
    });
  });
});
