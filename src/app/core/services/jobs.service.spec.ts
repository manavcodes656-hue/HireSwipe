import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { JobsService, JobRow } from './jobs.service';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { environment } from '../../../environments/environment';

describe('JobsService — Backend Integration Tests', () => {
  let service: JobsService;
  let httpMock: HttpTestingController;
  let mockAuthService: any;
  let mockSupabaseService: any;

  const apiUrl = environment.apiUrl || 'http://localhost:3000/api';
  const companyId = '11111111-1111-1111-1111-111111111111';
  const jobId = '22222222-2222-2222-2222-222222222222';

  const dummyJob: JobRow = {
    id: jobId,
    company_id: companyId,
    created_by: 'user-uuid-123',
    title: 'Senior Frontend Engineer',
    description: 'We are looking for an experienced Angular engineer.',
    employment_type: 'full_time',
    experience_level: 'senior',
    experience_min: 5,
    experience_max: 9,
    salary_min: 120000,
    salary_max: 160000,
    salary_currency: 'USD',
    location: 'San Francisco, CA',
    city: 'San Francisco',
    state: 'CA',
    country: 'USA',
    remote_type: 'hybrid',
    openings: 2,
    application_deadline: '2026-12-31T00:00:00Z',
    status: 'published',
    created_at: '2026-01-01T00:00:00Z',
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
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({ data: [dummyJob], error: null }),
              }),
              single: vi.fn().mockResolvedValue({ data: dummyJob, error: null }),
            }),
            order: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({ data: [dummyJob], error: null }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: dummyJob, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      },
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        JobsService,
        { provide: AuthService, useValue: mockAuthService },
        { provide: SupabaseService, useValue: mockSupabaseService },
      ],
    });

    service = TestBed.inject(JobsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  describe('GET /api/company/jobs', () => {
    it('retrieves jobs for the authenticated company and sends the Bearer token', async () => {
      const promise = service.getCompanyJobs(companyId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/jobs`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');

      req.flush({ status: 'ok', jobs: [dummyJob] });
      const result = await promise;
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Senior Frontend Engineer');
    });

    it('fails closed and returns an empty list on 401 Unauthorized', async () => {
      const promise = service.getCompanyJobs(companyId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/jobs`);
      req.flush(
        { error: { code: 'UNAUTHORIZED', message: 'Token expired' } },
        { status: 401, statusText: 'Unauthorized' }
      );

      const result = await promise;
      expect(result).toEqual([]);
    });

    it('fails closed and returns an empty list on 403 Forbidden', async () => {
      const promise = service.getCompanyJobs(companyId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/jobs`);
      req.flush(
        { error: { code: 'FORBIDDEN', message: 'No company membership' } },
        { status: 403, statusText: 'Forbidden' }
      );

      const result = await promise;
      expect(result).toEqual([]);
    });

    it('falls back to direct Supabase query when network error or server offline occurs', async () => {
      const promise = service.getCompanyJobs(companyId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/jobs`);
      req.error(new ProgressEvent('Network error'));

      const result = await promise;
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('jobs');
      expect(result).toBeDefined();
    });
  });

  describe('GET /api/company/jobs/:jobId', () => {
    it('retrieves an authorized job by ID with the Bearer token', async () => {
      const promise = service.getJob(jobId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/jobs/${jobId}`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');

      req.flush({ status: 'ok', job: dummyJob });
      const result = await promise;
      expect(result).toEqual(dummyJob);
    });

    it('returns null when the backend returns 404', async () => {
      const promise = service.getJob(jobId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/jobs/${jobId}`);
      req.flush(
        { error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } },
        { status: 404, statusText: 'Not Found' }
      );

      const result = await promise;
      expect(result).toBeNull();
    });

    it('falls back to public Supabase query when backend rejects with 403', async () => {
      const promise = service.getJob(jobId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/jobs/${jobId}`);
      req.flush(
        { error: { code: 'FORBIDDEN', message: 'Not allowed' } },
        { status: 403, statusText: 'Forbidden' }
      );

      const result = await promise;
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('jobs');
      expect(result).toEqual(dummyJob);
    });
  });

  describe('POST /api/company/jobs', () => {
    it('creates a job with sanitized fields and sends the Bearer token', async () => {
      const payload = {
        title: 'Senior Frontend Engineer',
        description: 'We are looking for an experienced Angular engineer.',
        employment_type: 'full_time',
        status: 'active', // Should normalize to 'published'
        requirements: ['TypeScript', { requirement_text: 'Angular' }],
        benefits: ['Health Insurance', { benefit_text: 'Remote Stipend' }],
        unsupported_field: 'should-be-stripped',
      };

      const promise = service.createJob(companyId, 'user-uuid-123', payload);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/jobs`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');
      expect(req.request.body.status).toBe('published');
      expect(req.request.body.requirements).toEqual(['TypeScript', 'Angular']);
      expect(req.request.body.benefits).toEqual(['Health Insurance', 'Remote Stipend']);
      expect(req.request.body.unsupported_field).toBeUndefined();

      req.flush({ status: 'ok', job: dummyJob });
      const result = await promise;
      expect(result).toEqual({ jobId, error: null });
    });

    it('returns structured error when backend returns validation or server error', async () => {
      const promise = service.createJob(companyId, 'user-uuid-123', { title: '' });
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/jobs`);
      req.flush(
        { error: { code: 'VALIDATION_ERROR', message: 'Title is required' } },
        { status: 400, statusText: 'Bad Request' }
      );

      const result = await promise;
      expect(result.jobId).toBeNull();
      expect(result.error).toBe('Title is required');
    });
  });

  describe('POST /api/company/jobs error messages', () => {
    it('names the invalid fields of a validation error', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const promise = service.createJob(companyId, 'user-uuid-123', { title: 'x' });
      await new Promise((r) => setTimeout(r, 5));

      httpMock.expectOne(`${apiUrl}/company/jobs`).flush(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            fields: { salary_max: 'cannot be less than salary_min', application_deadline: 'must be a valid date' },
          },
        },
        { status: 400, statusText: 'Bad Request' }
      );

      const result = await promise;
      expect(result.jobId).toBeNull();
      expect(result.error).toBe(
        'Invalid request body: salary_max cannot be less than salary_min; application_deadline must be a valid date'
      );
    });

    it('falls back to a direct, RLS-protected Supabase insert when the API is unreachable', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const insert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: jobId }, error: null }) }),
      });
      mockSupabaseService.client.from = vi.fn().mockReturnValue({ insert });

      const promise = service.createJob(companyId, 'user-uuid-123', {
        title: 'x', status: 'active', requirements: ['a'], skills: [{ skill_name: 'Angular' }], bogus: 1,
      });
      await new Promise((r) => setTimeout(r, 5));
      httpMock.expectOne(`${apiUrl}/company/jobs`).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

      expect(await promise).toEqual({ jobId, error: null });
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('jobs');
      const inserted = insert.mock.calls[0][0];
      expect(inserted).toMatchObject({ title: 'x', status: 'published', company_id: companyId, created_by: 'user-uuid-123' });
      expect(inserted.requirements).toBeUndefined();
      expect(inserted.skills).toBeUndefined();
      expect(inserted.bogus).toBeUndefined();
    });

    it('reports the database error when the fallback insert is also refused', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockSupabaseService.client.from = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'new row violates row-level security policy' } }),
          }),
        }),
      });

      const promise = service.createJob(companyId, 'user-uuid-123', { title: 'x' });
      await new Promise((r) => setTimeout(r, 5));
      httpMock.expectOne(`${apiUrl}/company/jobs`).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

      const result = await promise;
      expect(result.jobId).toBeNull();
      expect(result.error).toContain('row-level security');
    });

    it('passes through the membership rejection from the API', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const promise = service.createJob(companyId, 'user-uuid-123', { title: 'x' });
      await new Promise((r) => setTimeout(r, 5));

      httpMock.expectOne(`${apiUrl}/company/jobs`).flush(
        { error: { code: 'FORBIDDEN', message: 'Must be an active company member to post jobs' } },
        { status: 403, statusText: 'Forbidden' }
      );

      expect((await promise).error).toBe('Must be an active company member to post jobs');
    });
  });

  describe('PATCH /api/company/jobs/:jobId', () => {
    it('updates a job with sanitized fields and sends the Bearer token', async () => {
      const updates = {
        title: 'Lead Frontend Engineer',
        salary_max: 180000,
      };

      const promise = service.updateJob(jobId, updates);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/jobs/${jobId}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');
      expect(req.request.body.title).toBe('Lead Frontend Engineer');
      expect(req.request.body.salary_max).toBe(180000);

      req.flush({ status: 'ok', job: { ...dummyJob, ...updates } });
      const result = await promise;
      expect(result).toEqual({ error: null });
    });

    it('returns error when backend rejects update', async () => {
      const promise = service.updateJob(jobId, { title: 'Updated' });
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/jobs/${jobId}`);
      req.flush(
        { error: { code: 'FORBIDDEN', message: 'Job does not belong to your company' } },
        { status: 403, statusText: 'Forbidden' }
      );

      const result = await promise;
      expect(result.error).toBe('Job does not belong to your company');
    });
  });

  describe('PATCH /api/company/jobs/:jobId/status', () => {
    it('updates job status and normalizes "active" to "published"', async () => {
      const promise = service.updateJobStatus(jobId, 'active');
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/jobs/${jobId}/status`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');
      expect(req.request.body).toEqual({ status: 'published' });

      req.flush({ status: 'ok', job: { ...dummyJob, status: 'published' } });
      const result = await promise;
      expect(result).toEqual({ error: null });
    });

    it('supports helper methods publishJob, pauseJob, and closeJob', async () => {
      // publishJob
      const pubPromise = service.publishJob(jobId);
      await new Promise((r) => setTimeout(r, 5));
      const pubReq = httpMock.expectOne(`${apiUrl}/company/jobs/${jobId}/status`);
      expect(pubReq.request.body).toEqual({ status: 'published' });
      pubReq.flush({ status: 'ok' });
      await pubPromise;

      // pauseJob
      const pausePromise = service.pauseJob(jobId);
      await new Promise((r) => setTimeout(r, 5));
      const pauseReq = httpMock.expectOne(`${apiUrl}/company/jobs/${jobId}/status`);
      expect(pauseReq.request.body).toEqual({ status: 'paused' });
      pauseReq.flush({ status: 'ok' });
      await pausePromise;

      // closeJob
      const closePromise = service.closeJob(jobId);
      await new Promise((r) => setTimeout(r, 5));
      const closeReq = httpMock.expectOne(`${apiUrl}/company/jobs/${jobId}/status`);
      expect(closeReq.request.body).toEqual({ status: 'closed' });
      closeReq.flush({ status: 'ok' });
      await closePromise;
    });
  });

  describe('Direct Supabase Job Seeker Operations', () => {
    it('preserves getPublishedJobs direct query for job seeker feed', async () => {
      const result = await service.getPublishedJobs(10, 0);
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('jobs');
      expect(result).toHaveLength(1);
    });

    it('preserves saveJob and unsaveJob operations', async () => {
      const saveRes = await service.saveJob('seeker-1', jobId);
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('saved_jobs');
      expect(saveRes.error).toBeNull();

      const unsaveRes = await service.unsaveJob('seeker-1', jobId);
      expect(unsaveRes.error).toBeNull();
    });
  });
});
