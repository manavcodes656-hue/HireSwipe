import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { InterviewsService, CompanyInterview } from './interviews.service';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { environment } from '../../../environments/environment';

/** Self-referential query stub that resolves to `result` when awaited. */
function makeQuery(result: { data: any; error: any }) {
  const q: any = {};
  const chainable = [
    'select',
    'eq',
    'neq',
    'order',
    'limit',
    'range',
    'insert',
    'update',
    'upsert',
    'delete',
    'maybeSingle',
    'single',
  ];
  for (const method of chainable) {
    q[method] = vi.fn(() => q);
  }
  q.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return q;
}

describe('InterviewsService — Backend Integration Tests', () => {
  let service: InterviewsService;
  let httpMock: HttpTestingController;
  let mockAuthService: any;
  let mockSupabaseService: any;

  const apiUrl = environment.apiUrl || 'http://localhost:3000/api';
  const companyId = '11111111-1111-1111-1111-111111111111';
  const applicationId = '22222222-2222-2222-2222-222222222222';
  const jobId = '33333333-3333-3333-3333-333333333333';
  const interviewId = '44444444-4444-4444-4444-444444444444';

  const dummyInterview = {
    id: interviewId,
    application_id: applicationId,
    scheduled_by: 'user-uuid-123',
    title: 'Technical Interview',
    description: 'System design and live coding',
    scheduled_at: '2026-10-25T14:00:00.000Z',
    duration_minutes: 45,
    meeting_url: 'https://meet.google.com/abc-defg-hij',
    location: 'Google Meet (Virtual)',
    status: 'scheduled',
    created_at: '2026-10-20T10:00:00.000Z',
    updated_at: '2026-10-20T10:00:00.000Z',
    applications: {
      id: applicationId,
      job_id: jobId,
      job_seeker_id: '55555555-5555-4555-8555-555555555555',
      company_id: companyId,
      status: 'shortlisted',
      jobs: { id: jobId, title: 'Senior Frontend Engineer' },
      job_seeker_profiles: {
        id: '55555555-5555-4555-8555-555555555555',
        profile_id: 'p-1',
        headline: 'Angular expert',
        location: 'Bengaluru, India',
        experience_years: 6,
        profiles: { id: 'p-1', full_name: 'Aarav Patel', avatar_url: 'https://cdn.test/a.png' },
      },
    },
    profiles: { full_name: 'Recruiter', avatar_url: null },
  } as unknown as CompanyInterview;

  beforeEach(() => {
    TestBed.resetTestingModule();

    mockAuthService = {
      getAccessToken: vi.fn().mockResolvedValue('mock-access-token-xyz'),
      getCurrentUserId: vi.fn().mockReturnValue('user-uuid-123'),
    };

    mockSupabaseService = {
      client: {
        from: vi.fn().mockReturnValue(makeQuery({ data: [dummyInterview], error: null })),
      },
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        InterviewsService,
        { provide: AuthService, useValue: mockAuthService },
        { provide: SupabaseService, useValue: mockSupabaseService },
      ],
    });

    service = TestBed.inject(InterviewsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  describe('GET /api/company/interviews', () => {
    it('retrieves the company interviews with Bearer token', async () => {
      const promise = service.getCompanyInterviews(companyId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/interviews`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');

      req.flush({ status: 'ok', interviews: [dummyInterview] });
      const result = await promise;
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(interviewId);
    });

    it('never sends the client-side company id to the backend', async () => {
      const promise = service.getCompanyInterviews(companyId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/interviews`);
      expect(req.request.url).not.toContain(companyId);

      req.flush({ status: 'ok', interviews: [] });
      await promise;
    });

    it('passes application, job and status filters as query parameters', async () => {
      const promise = service.getCompanyInterviews(companyId, {
        applicationId,
        jobId,
        status: 'scheduled',
      });
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(
        `${apiUrl}/company/interviews?applicationId=${applicationId}&jobId=${jobId}&status=scheduled`
      );
      expect(req.request.method).toBe('GET');

      req.flush({ status: 'ok', interviews: [] });
      await promise;
    });

    it('fails closed and returns an empty list on 401 Unauthorized', async () => {
      const promise = service.getCompanyInterviews(companyId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/interviews`);
      req.flush(
        { error: { code: 'UNAUTHORIZED', message: 'Token expired' } },
        { status: 401, statusText: 'Unauthorized' }
      );

      const result = await promise;
      expect(result).toEqual([]);
      expect(mockSupabaseService.client.from).not.toHaveBeenCalled();
    });

    it('fails closed and returns an empty list on 403 Forbidden', async () => {
      const promise = service.getCompanyInterviews(companyId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/interviews`);
      req.flush(
        { error: { code: 'FORBIDDEN', message: 'No company membership' } },
        { status: 403, statusText: 'Forbidden' }
      );

      const result = await promise;
      expect(result).toEqual([]);
      expect(mockSupabaseService.client.from).not.toHaveBeenCalled();
    });

    it('falls back to a direct Supabase query when the backend is unreachable', async () => {
      const promise = service.getCompanyInterviews(companyId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/interviews`);
      req.error(new ProgressEvent('Network error'));

      const result = await promise;
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('interviews');
      expect(result).toHaveLength(1);
    });
  });

  describe('GET /api/company/interviews/:interviewId', () => {
    it('retrieves an authorized interview with Bearer token', async () => {
      const promise = service.getInterview(interviewId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/interviews/${interviewId}`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');

      req.flush({ status: 'ok', interview: dummyInterview });
      const result = await promise;
      expect(result?.id).toBe(interviewId);
    });

    it('returns null when the interview is not found (404)', async () => {
      const promise = service.getInterview(interviewId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/interviews/${interviewId}`);
      req.flush(
        { error: { code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' } },
        { status: 404, statusText: 'Not Found' }
      );

      const result = await promise;
      expect(result).toBeNull();
    });
  });

  describe('POST /api/company/interviews', () => {
    it('schedules an interview and returns the persisted record', async () => {
      const promise = service.scheduleInterview({
        application_id: applicationId,
        title: 'Technical Interview',
        description: 'System design and live coding',
        scheduled_at: '2026-10-25T14:00:00.000Z',
        duration_minutes: 45,
        meeting_url: 'https://meet.google.com/abc-defg-hij',
        location: 'Google Meet (Virtual)',
      });
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/interviews`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');
      expect(req.request.body.application_id).toBe(applicationId);
      expect(req.request.body.title).toBe('Technical Interview');
      expect(req.request.body.scheduled_at).toBe('2026-10-25T14:00:00.000Z');
      // the interviewer is the authenticated caller, never a client value
      expect(req.request.body).not.toHaveProperty('scheduled_by');

      req.flush({ status: 'ok', interview: dummyInterview }, { status: 201, statusText: 'Created' });
      const result = await promise;
      expect(result.error).toBeNull();
      expect(result.data?.id).toBe(interviewId);
    });

    it('drops fields the API does not accept', async () => {
      const promise = service.scheduleInterview({
        application_id: applicationId,
        title: 'Technical Interview',
        scheduled_at: '2026-10-25T14:00:00.000Z',
        id: 'should-be-dropped',
        company_id: companyId,
      } as any);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/interviews`);
      expect(req.request.body).not.toHaveProperty('id');
      expect(req.request.body).not.toHaveProperty('company_id');

      req.flush({ status: 'ok', interview: dummyInterview }, { status: 201, statusText: 'Created' });
      await promise;
    });

    it('returns a structured error when the backend rejects the request', async () => {
      const promise = service.scheduleInterview({
        application_id: applicationId,
        title: 'Technical Interview',
        scheduled_at: '2026-10-25T14:00:00.000Z',
      });
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/interviews`);
      req.flush(
        { error: { code: 'INVALID_TRANSITION', message: 'Cannot schedule an interview for a withdrawn application' } },
        { status: 400, statusText: 'Bad Request' }
      );

      const result = await promise;
      expect(result.data).toBeNull();
      expect(result.error).toBe('Cannot schedule an interview for a withdrawn application');
      expect(result.code).toBe('INVALID_TRANSITION');
    });
  });

  describe('PATCH /api/company/interviews/:interviewId', () => {
    it('updates the permitted fields only', async () => {
      const promise = service.updateInterview(interviewId, {
        title: 'Final Round',
        location: 'Bengaluru Office',
      });
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/interviews/${interviewId}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');
      expect(req.request.body).toEqual({ title: 'Final Round', location: 'Bengaluru Office' });

      req.flush({ status: 'ok', interview: dummyInterview });
      const result = await promise;
      expect(result.error).toBeNull();
    });

    it('never sends the immutable relationship fields', async () => {
      const promise = service.updateInterview(interviewId, {
        application_id: applicationId,
        scheduled_by: 'someone-else',
        title: 'Final Round',
      } as any);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/interviews/${interviewId}`);
      expect(req.request.body).not.toHaveProperty('application_id');
      expect(req.request.body).not.toHaveProperty('scheduled_by');

      req.flush({ status: 'ok', interview: dummyInterview });
      await promise;
    });

    it('returns a structured error when the backend rejects the update', async () => {
      const promise = service.updateInterview(interviewId, { title: 'Final Round' });
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/interviews/${interviewId}`);
      req.flush(
        { error: { code: 'FORBIDDEN', message: 'Interview does not belong to your company' } },
        { status: 403, statusText: 'Forbidden' }
      );

      const result = await promise;
      expect(result.error).toBe('Interview does not belong to your company');
      expect(result.code).toBe('FORBIDDEN');
    });
  });

  describe('PATCH /api/company/interviews/:interviewId/status', () => {
    it('updates the interview status and returns the stored record', async () => {
      const promise = service.updateInterviewStatus(interviewId, 'completed');
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/interviews/${interviewId}/status`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-access-token-xyz');
      expect(req.request.body).toEqual({ status: 'completed' });

      req.flush({ status: 'ok', interview: { ...dummyInterview, status: 'completed' } });
      const result = await promise;
      expect(result.error).toBeNull();
      expect(result.interview?.status).toBe('completed');
    });

    it('reports a rejected status transition', async () => {
      const promise = service.updateInterviewStatus(interviewId, 'cancelled');
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/interviews/${interviewId}/status`);
      req.flush(
        { error: { code: 'INVALID_TRANSITION', message: 'Cannot change interview status from completed to cancelled' } },
        { status: 400, statusText: 'Bad Request' }
      );

      const result = await promise;
      expect(result.error).toBe('Cannot change interview status from completed to cancelled');
      expect(result.code).toBe('INVALID_TRANSITION');
    });

    it('cancels an interview through the status endpoint', async () => {
      const promise = service.cancelInterview(interviewId);
      await new Promise((r) => setTimeout(r, 5));

      const req = httpMock.expectOne(`${apiUrl}/company/interviews/${interviewId}/status`);
      expect(req.request.body).toEqual({ status: 'cancelled' });

      req.flush({ status: 'ok', interview: { ...dummyInterview, status: 'cancelled' } });
      const result = await promise;
      expect(result.error).toBeNull();
    });
  });

  describe('Job Seeker Interviews (Direct Supabase)', () => {
    it('preserves the direct candidate query used by the job seeker dashboard', async () => {
      const result = await service.getJobSeekerInterviews('seeker-1');
      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('interviews');
      expect(result).toHaveLength(1);
    });
  });
});
