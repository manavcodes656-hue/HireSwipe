import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { JobSeekerService, mapPublishedJob } from './job-seeker.service';
import { JobSeekerProfileService } from '../../../core/services/job-seeker-profile.service';
import { ProfileService } from '../../../core/services/profile.service';
import { AuthService } from '../../../core/services/auth.service';
import { JobsService } from '../../../core/services/jobs.service';
import { ApplicationsService } from '../../../core/services/applications.service';
import { MatchingService, SwipeError } from '../../../core/services/matching.service';
import { InterviewsService } from '../../../core/services/interviews.service';
import { NotificationsService } from '../../../core/services/notifications.service';
import { MessagesService } from '../../../core/services/messages.service';

const JSP_ID = '11111111-1111-1111-1111-111111111111';
const JOB_ID = '22222222-2222-2222-2222-222222222222';
const COMPANY_ID = '33333333-3333-3333-3333-333333333333';
const APP_ID = '44444444-4444-4444-4444-444444444444';

const jobRow = (over: any = {}) => ({
  id: JOB_ID,
  company_id: COMPANY_ID,
  title: 'Angular Engineer',
  description: 'Build',
  employment_type: 'full_time',
  salary_currency: 'USD',
  remote_type: 'remote',
  status: 'published',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  companies: { name: 'Acme', logo_url: null },
  ...over,
});
const job = () => mapPublishedJob(jobRow());

const appRow = (over: any = {}) => ({
  id: APP_ID,
  job_id: JOB_ID,
  job_seeker_id: JSP_ID,
  company_id: COMPANY_ID,
  status: 'pending',
  applied_at: '2026-01-02T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  ...over,
});

describe('JobSeekerService Like/Pass persistence and application creation', () => {
  let matching: any;
  let applications: any;
  let jobs: any;
  let service: JobSeekerService;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    matching = { swipe: vi.fn().mockResolvedValue({ swipe: {}, alreadyRecorded: false }) };
    applications = {
      getApplicationForJob: vi.fn().mockResolvedValue({ data: null, error: null }),
      applyToJob: vi.fn().mockResolvedValue({ data: appRow(), error: null }),
      getJobSeekerApplications: vi.fn().mockResolvedValue([]),
    };
    jobs = { getJob: vi.fn().mockResolvedValue(null) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        JobSeekerService,
        { provide: AuthService, useValue: { getCurrentUserId: vi.fn().mockReturnValue(null), loading: signal(false) } },
        { provide: ProfileService, useValue: {} },
        { provide: JobSeekerProfileService, useValue: {} },
        { provide: JobsService, useValue: jobs },
        { provide: ApplicationsService, useValue: applications },
        { provide: MatchingService, useValue: matching },
        { provide: InterviewsService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: MessagesService, useValue: {} },
      ],
    });
    service = TestBed.inject(JobSeekerService);
    service.jobSeekerProfile.update((p) => ({ ...p, id: JSP_ID }));
    service.jobs.set([job()]);
  });

  describe('Like', () => {
    it('saves the swipe, creates exactly one real application, then removes the card', async () => {
      applications.getJobSeekerApplications.mockResolvedValue([
        { ...appRow(), companies: { name: 'Acme' }, jobs: { title: 'Angular Engineer' } },
      ]);

      const res = await service.swipeJob(job(), 'like');

      expect(res).toEqual({ ok: true });
      expect(matching.swipe).toHaveBeenCalledWith(JSP_ID, JOB_ID, 'like');
      expect(applications.applyToJob).toHaveBeenCalledTimes(1);
      expect(applications.applyToJob).toHaveBeenCalledWith(JOB_ID, JSP_ID, COMPANY_ID);
      expect(service.availableDeckJobs()).toEqual([]);
      expect(service.applications().map((a) => a.id)).toEqual([APP_ID]);
      expect(service.applications()[0].company_name).toBe('Acme');
    });

    it('fabricates no match or notification', async () => {
      const before = { matches: service.matches(), notifications: service.notifications() };

      await service.swipeJob(job(), 'like');

      expect(service.matches()).toBe(before.matches);
      expect(service.notifications()).toBe(before.notifications);
    });

    it('does not create an application when the swipe fails', async () => {
      matching.swipe.mockRejectedValue(new TypeError('Failed to fetch'));

      const res = await service.swipeJob(job(), 'like');

      expect(res.ok).toBe(false);
      expect(applications.getApplicationForJob).not.toHaveBeenCalled();
      expect(applications.applyToJob).not.toHaveBeenCalled();
      expect(service.availableDeckJobs()).toHaveLength(1);
    });
  });

  describe('Pass', () => {
    it('records the pass and never touches applications', async () => {
      const res = await service.swipeJob(job(), 'pass');

      expect(res.ok).toBe(true);
      expect(matching.swipe).toHaveBeenCalledWith(JSP_ID, JOB_ID, 'pass');
      expect(applications.getApplicationForJob).not.toHaveBeenCalled();
      expect(applications.applyToJob).not.toHaveBeenCalled();
      expect(applications.getJobSeekerApplications).not.toHaveBeenCalled();
      expect(service.swipedJobIds().has(JOB_ID)).toBe(true);
    });
  });

  describe('duplicates and retries', () => {
    it('treats an existing matching application as success without inserting another', async () => {
      matching.swipe.mockResolvedValue({ swipe: {}, alreadyRecorded: true });
      applications.getApplicationForJob.mockResolvedValue({ data: appRow(), error: null });

      const res = await service.swipeJob(job(), 'like');

      expect(res.ok).toBe(true);
      expect(applications.applyToJob).not.toHaveBeenCalled();
    });

    it('re-reads the application when the insert is rejected as a duplicate (23514 or 23505)', async () => {
      for (const code of ['23514', '23505']) {
        applications.getApplicationForJob
          .mockResolvedValueOnce({ data: null, error: null })
          .mockResolvedValueOnce({ data: appRow(), error: null });
        applications.applyToJob.mockResolvedValueOnce({
          data: null,
          error: 'Application not allowed: Candidate has already applied for this position (status: pending)',
          code,
        });
        service.swipedJobIds.set(new Set());

        const res = await service.swipeJob(job(), 'like');

        expect(res.ok).toBe(true);
      }
    });

    it('rejects an existing application whose job or candidate does not match', async () => {
      applications.getApplicationForJob.mockResolvedValue({
        data: appRow({ job_id: '99999999-9999-9999-9999-999999999999' }),
        error: null,
      });
      expect((await service.swipeJob(job(), 'like')).ok).toBe(false);

      applications.getApplicationForJob.mockResolvedValue({
        data: appRow({ job_seeker_id: '99999999-9999-9999-9999-999999999999' }),
        error: null,
      });
      expect((await service.swipeJob(job(), 'like')).ok).toBe(false);
      expect(service.availableDeckJobs()).toHaveLength(1);
    });

    it('does not report success for a withdrawn application', async () => {
      applications.getApplicationForJob.mockResolvedValue({ data: appRow({ status: 'withdrawn' }), error: null });

      const res = await service.swipeJob(job(), 'like');

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/withdrew/);
      expect(service.availableDeckJobs()).toHaveLength(1);
    });

    it('shares one request for concurrent Likes: one swipe, one application', async () => {
      let resolveApply!: (v: any) => void;
      applications.applyToJob.mockReturnValueOnce(new Promise((r) => (resolveApply = r)));

      const first = service.swipeJob(job(), 'like');
      const second = service.swipeJob(job(), 'like');
      expect(second).toBe(first);
      await vi.waitFor(() => expect(applications.applyToJob).toHaveBeenCalled());
      resolveApply({ data: appRow(), error: null });

      expect((await first).ok).toBe(true);
      expect(matching.swipe).toHaveBeenCalledTimes(1);
      expect(applications.applyToJob).toHaveBeenCalledTimes(1);
    });
  });

  describe('application failures', () => {
    it('shows an eligibility failure with the missing fields and keeps the card', async () => {
      applications.applyToJob.mockResolvedValue({
        data: null,
        error: 'Application not allowed: Missing mandatory profile fields: headline',
        code: '23514',
      });

      const res = await service.swipeJob(job(), 'like');

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/Complete your profile/);
      expect(res.error).toMatch(/headline/);
      expect(service.availableDeckJobs()).toHaveLength(1);
      expect(service.swipedJobIds().has(JOB_ID)).toBe(false);
    });

    it('explains a closed job or passed deadline', async () => {
      applications.applyToJob.mockResolvedValue({
        data: null,
        error: 'Application not allowed: Job is not currently accepting applications (status: paused)',
        code: '23514',
      });
      expect((await service.swipeJob(job(), 'like')).error).toMatch(/no longer accepting/);

      applications.applyToJob.mockResolvedValue({
        data: null,
        error: 'Application not allowed: Application deadline has passed',
        code: '23514',
      });
      expect((await service.swipeJob(job(), 'like')).error).toMatch(/deadline/);
    });

    it('does not show success for a database or network failure creating the application', async () => {
      applications.applyToJob.mockResolvedValue({ data: null, error: 'Failed to fetch' });

      const res = await service.swipeJob(job(), 'like');

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/Could not create your application/);
      expect(service.availableDeckJobs()).toHaveLength(1);
    });

    it('does not show success when the application lookup itself fails', async () => {
      applications.getApplicationForJob.mockResolvedValue({ data: null, error: 'rls denied' });

      const res = await service.swipeJob(job(), 'like');

      expect(res.ok).toBe(false);
      expect(applications.applyToJob).not.toHaveBeenCalled();
    });

    it('swipe saved but application failed: the retry finishes the application', async () => {
      applications.applyToJob.mockResolvedValueOnce({ data: null, error: 'Failed to fetch' });

      const first = await service.swipeJob(job(), 'like');
      expect(first.ok).toBe(false);
      expect(service.availableDeckJobs()).toHaveLength(1);

      // The stored swipe is confirmed by the 23505 path in MatchingService.swipe.
      matching.swipe.mockResolvedValueOnce({ swipe: {}, alreadyRecorded: true });
      const retry = await service.swipeJob(job(), 'like');

      expect(retry.ok).toBe(true);
      expect(matching.swipe).toHaveBeenCalledTimes(2);
      expect(applications.applyToJob).toHaveBeenCalledTimes(2);
      expect(service.availableDeckJobs()).toEqual([]);
    });
  });

  describe('invalid input and swipe errors', () => {
    it('sends nothing for non-UUID ids or a missing profile id', async () => {
      expect((await service.swipeJob({ ...job(), id: 'job-1' }, 'like')).ok).toBe(false);
      expect((await service.swipeJob({ ...job(), company_id: 'comp-101' }, 'like')).ok).toBe(false);

      service.jobSeekerProfile.update((p) => ({ ...p, id: '' }));
      expect((await service.swipeJob(job(), 'like')).ok).toBe(false);

      expect(matching.swipe).not.toHaveBeenCalled();
      expect(applications.applyToJob).not.toHaveBeenCalled();
    });

    it('keeps the card and explains an RLS denial or a conflicting earlier swipe', async () => {
      matching.swipe.mockRejectedValueOnce(new SwipeError('rls', '42501'));
      expect((await service.swipeJob(job(), 'pass')).error).toMatch(/permission/);

      matching.swipe.mockRejectedValueOnce(new SwipeError('already pass', 'SWIPE_CONFLICT'));
      expect((await service.swipeJob(job(), 'like')).ok).toBe(false);

      expect(service.availableDeckJobs()).toHaveLength(1);
      expect(applications.applyToJob).not.toHaveBeenCalled();
    });
  });

  describe('applyToJobById (Saved Jobs)', () => {
    it('uses the feed job when it is loaded', async () => {
      const res = await service.applyToJobById(JOB_ID);

      expect(res.ok).toBe(true);
      expect(jobs.getJob).not.toHaveBeenCalled();
      expect(applications.applyToJob).toHaveBeenCalledWith(JOB_ID, JSP_ID, COMPANY_ID);
    });

    it('loads a published job that is not in the feed', async () => {
      service.jobs.set([]);
      jobs.getJob.mockResolvedValue(jobRow());

      const res = await service.applyToJobById(JOB_ID);

      expect(res.ok).toBe(true);
      expect(jobs.getJob).toHaveBeenCalledWith(JOB_ID);
      expect(applications.applyToJob).toHaveBeenCalledTimes(1);
    });

    it('reports an unavailable job without creating anything', async () => {
      service.jobs.set([]);
      jobs.getJob.mockResolvedValue(jobRow({ status: 'closed' }));
      expect((await service.applyToJobById(JOB_ID)).error).toMatch(/no longer available/);

      jobs.getJob.mockRejectedValue(new Error('network'));
      expect((await service.applyToJobById(JOB_ID)).ok).toBe(false);

      expect(matching.swipe).not.toHaveBeenCalled();
      expect(applications.applyToJob).not.toHaveBeenCalled();
    });
  });
});
