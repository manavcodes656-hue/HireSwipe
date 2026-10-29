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

  describe('POST /api/company/applications/:applicationId/interest', () => {
    const url = `${apiUrl}/company/applications/${applicationId}/interest`;
    const interest = { id: 'i-1', application_id: applicationId, expressed_by: 'u-1', created_at: '2026-01-01T00:00:00Z' };

    beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));

    it('posts to the real application id with the Bearer token and no body ids', async () => {
      const promise = service.expressCompanyInterest(applicationId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');
      expect(req.request.body).toEqual({});
      req.flush({ status: 'ok', alreadyRecorded: false, interest }, { status: 201, statusText: 'Created' });

      expect(await promise).toEqual({ interest, alreadyRecorded: false, error: null });
    });

    it('reports a repeated request as already recorded, not as an error', async () => {
      const promise = service.expressCompanyInterest(applicationId);
      await new Promise((r) => setTimeout(r, 5));
      httpMock.expectOne(url).flush({ status: 'ok', alreadyRecorded: true, interest });

      expect(await promise).toEqual({ interest, alreadyRecorded: true, error: null });
    });

    it('returns the backend message for rejections and never reports success', async () => {
      const cases: [number, string, string][] = [
        [403, 'FORBIDDEN', 'Not an active member of this company'],
        [404, 'APPLICATION_NOT_FOUND', 'Application not found'],
        [409, 'APPLICATION_WITHDRAWN', 'The candidate withdrew this application'],
        [409, 'JOB_NOT_PUBLISHED', 'This job is not published'],
        [503, 'COMPANY_INTEREST_UNAVAILABLE', 'Company interest is not available yet.'],
      ];
      for (const [status, code, message] of cases) {
        const promise = service.expressCompanyInterest(applicationId);
        await new Promise((r) => setTimeout(r, 5));
        httpMock.expectOne(url).flush({ error: { code, message } }, { status, statusText: code });

        const result = await promise;
        expect(result.error).toBe(message);
        expect(result.interest).toBeNull();
      }
    });

    it('gives a readable message when the server cannot be reached', async () => {
      const promise = service.expressCompanyInterest(applicationId);
      await new Promise((r) => setTimeout(r, 5));
      httpMock.expectOne(url).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

      const result = await promise;
      expect(result.error).toMatch(/Could not reach the server/);
      expect(result.interest).toBeNull();
    });

    it('lists the application ids the company has expressed interest in', async () => {
      mockSupabaseService.client.from = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [{ application_id: 'a1' }, { application_id: 'a2' }], error: null }),
      });

      expect(await service.getInterestedApplicationIds()).toEqual(['a1', 'a2']);
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('company_interest');
    });

    it('returns an empty list when the interest read fails', async () => {
      mockSupabaseService.client.from = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } }),
      });

      expect(await service.getInterestedApplicationIds()).toEqual([]);
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

    it('applyToJob returns the database error code so callers can react to duplicates and eligibility', async () => {
      mockSupabaseService.client.from = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Application not allowed: Missing mandatory profile fields: headline', code: '23514' },
            }),
          }),
        }),
      });

      const result = await service.applyToJob(jobId, 'seeker-1', companyId);

      expect(result.data).toBeNull();
      expect(result.code).toBe('23514');
      expect(result.error).toContain('Missing mandatory profile fields');
    });

    describe('getApplicationForJob / getAppliedJobIds', () => {
      const chain = (terminal: any) => {
        const q: any = {};
        q.select = vi.fn().mockReturnValue(q);
        q.eq = vi.fn().mockReturnValue(q);
        q.maybeSingle = vi.fn().mockResolvedValue(terminal);
        q.then = (resolve: any) => resolve(terminal); // awaited without maybeSingle (list query)
        mockSupabaseService.client.from = vi.fn().mockReturnValue(q);
        return q;
      };

      it('looks the application up by job and candidate', async () => {
        const q = chain({ data: dummyApp, error: null });

        const result = await service.getApplicationForJob(jobId, 'seeker-1');

        expect(q.eq).toHaveBeenCalledWith('job_id', jobId);
        expect(q.eq).toHaveBeenCalledWith('job_seeker_id', 'seeker-1');
        expect(result).toEqual({ data: dummyApp, error: null });
      });

      it('returns null data when there is no application, and the message on error', async () => {
        chain({ data: null, error: null });
        expect((await service.getApplicationForJob(jobId, 's')).data).toBeNull();

        chain({ data: null, error: { message: 'rls' } });
        expect(await service.getApplicationForJob(jobId, 's')).toEqual({ data: null, error: 'rls' });
      });

      it('lists applied job ids and throws on errors', async () => {
        chain({ data: [{ job_id: 'a' }, { job_id: 'b' }], error: null });
        expect(await service.getAppliedJobIds('s')).toEqual(['a', 'b']);

        vi.spyOn(console, 'error').mockImplementation(() => {});
        chain({ data: null, error: { message: 'boom' } });
        await expect(service.getAppliedJobIds('s')).rejects.toThrow('boom');
      });
    });

    it('preserves withdrawApplication direct query', async () => {
      await service.withdrawApplication(applicationId);
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('applications');
    });
  });
});
