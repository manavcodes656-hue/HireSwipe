import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { JobSeekerService, mapPublishedJob } from './job-seeker.service';
import { JobSeekerProfileService } from '../../../core/services/job-seeker-profile.service';
import { ProfileService } from '../../../core/services/profile.service';
import { AuthService } from '../../../core/services/auth.service';
import { JobsService } from '../../../core/services/jobs.service';
import { ApplicationsService } from '../../../core/services/applications.service';
import { MatchingService } from '../../../core/services/matching.service';
import { InterviewsService } from '../../../core/services/interviews.service';
import { NotificationsService } from '../../../core/services/notifications.service';
import { MessagesService } from '../../../core/services/messages.service';

const jobRow = (over: any = {}) => ({
  id: '22222222-2222-2222-2222-222222222222',
  company_id: '11111111-1111-1111-1111-111111111111',
  title: 'Angular Engineer',
  description: 'Build things',
  employment_type: 'full_time',
  experience_level: 'senior',
  salary_min: 100000,
  salary_max: 150000,
  salary_currency: 'USD',
  location: 'Remote',
  remote_type: 'remote',
  status: 'published',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  companies: { name: 'Acme', logo_url: 'https://x/logo.png', industry: 'SaaS' },
  job_skills: [{ is_required: true, skills: { name: 'Angular' } }, { is_required: false, skills: null }],
  job_requirements: [{ requirement: '5 years TS' }],
  ...over,
});

describe('Job Seeker real job feed', () => {
  let jobs: any;
  let matching: any;
  let applications: any;
  let service: JobSeekerService;

  beforeEach(() => {
    jobs = { getPublishedJobs: vi.fn().mockResolvedValue([]), getSavedJobs: vi.fn().mockResolvedValue([]) };
    matching = {
      getSwipedJobIds: vi.fn().mockResolvedValue([]),
      getLikedJobIds: vi.fn().mockResolvedValue([]),
      getJobSeekerMatches: vi.fn().mockResolvedValue([]),
    };
    applications = { getAppliedJobIds: vi.fn().mockResolvedValue([]) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        JobSeekerService,
        // No signed-in user: the constructor must not start a background load.
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
  });

  it('starts with no seeded fake jobs or swiped ids', () => {
    expect(service.jobs()).toEqual([]);
    expect(service.swipedJobIds().size).toBe(0);
    expect(service.availableDeckJobs()).toEqual([]);
  });

  it('maps a database row without inventing fields', () => {
    const job = mapPublishedJob(jobRow());
    expect(job).toMatchObject({
      id: '22222222-2222-2222-2222-222222222222',
      company_name: 'Acme',
      company_logo: 'https://x/logo.png',
      company_type: 'SaaS',
      employment_type: 'full time',
      remote_option: 'remote',
      skills: ['Angular'],
      requirements: ['5 years TS'],
      salary_display: 'USD 100K–150K',
    });
    expect(job.match_score).toBeUndefined();
  });

  it('tolerates missing company and relations', () => {
    const job = mapPublishedJob(jobRow({ companies: null, job_skills: null, job_requirements: undefined, salary_min: null, salary_max: null }));
    expect(job.company_name).toBeUndefined();
    expect(job.company_logo).toBeNull();
    expect(job.skills).toEqual([]);
    expect(job.requirements).toEqual([]);
    expect(job.salary_display).toBe('Not disclosed');
  });

  it('loads real jobs and passes swiped ids to the query', async () => {
    matching.getSwipedJobIds.mockResolvedValue(['s1', 's2']);
    jobs.getPublishedJobs.mockResolvedValue([jobRow()]);

    await service.loadJobFeed('jsp-real');

    expect(matching.getSwipedJobIds).toHaveBeenCalledWith('jsp-real');
    expect(jobs.getPublishedJobs).toHaveBeenCalledWith(30, 0, ['s1', 's2']);
    expect(service.jobs().map((j) => j.title)).toEqual(['Angular Engineer']);
    expect(service.swipedJobIds()).toEqual(new Set(['s1', 's2']));
    expect(service.feedError()).toBeNull();
    expect(service.feedLoading()).toBe(false);
  });

  it('keeps a Like without an application in the feed so it can be retried', async () => {
    matching.getSwipedJobIds.mockResolvedValue(['pass-1', 'liked-ok', 'liked-no-app']);
    matching.getLikedJobIds.mockResolvedValue(['liked-ok', 'liked-no-app']);
    applications.getAppliedJobIds.mockResolvedValue(['liked-ok']);
    jobs.getPublishedJobs.mockResolvedValue([jobRow({ id: 'liked-no-app' })]);

    await service.loadJobFeed('jsp-real');

    expect(jobs.getPublishedJobs).toHaveBeenCalledWith(30, 0, ['pass-1', 'liked-ok']);
    expect(service.swipedJobIds()).toEqual(new Set(['pass-1', 'liked-ok']));
    expect(service.availableDeckJobs().map((j) => j.id)).toEqual(['liked-no-app']);
  });

  it('surfaces an applications query error instead of showing unfinished jobs as done', async () => {
    applications.getAppliedJobIds.mockRejectedValue(new Error('applications unavailable'));

    await service.loadJobFeed('jsp-real');

    expect(jobs.getPublishedJobs).not.toHaveBeenCalled();
    expect(service.feedError()).toBe('applications unavailable');
  });

  it('keeps a swiped job out of the deck even if the query returned it', async () => {
    const row = jobRow();
    matching.getSwipedJobIds.mockResolvedValue([row.id]);
    jobs.getPublishedJobs.mockResolvedValue([row]);

    await service.loadJobFeed('jsp-real');

    expect(service.availableDeckJobs()).toEqual([]);
  });

  it('yields an empty feed with no error and no fake jobs when the database has none', async () => {
    await service.loadJobFeed('jsp-real');

    expect(service.jobs()).toEqual([]);
    expect(service.feedError()).toBeNull();
    expect(service.availableDeckJobs().some((j) => /^job-\d/.test(j.id))).toBe(false);
  });

  it('surfaces a job query error and clears the deck', async () => {
    jobs.getPublishedJobs.mockRejectedValue(new Error('permission denied for table jobs'));

    await service.loadJobFeed('jsp-real');

    expect(service.feedError()).toBe('permission denied for table jobs');
    expect(service.jobs()).toEqual([]);
    expect(service.feedLoading()).toBe(false);
  });

  it('surfaces a swiped-ids error instead of re-showing swiped jobs', async () => {
    matching.getSwipedJobIds.mockRejectedValue(new Error('network down'));

    await service.loadJobFeed('jsp-real');

    expect(jobs.getPublishedJobs).not.toHaveBeenCalled();
    expect(service.feedError()).toBe('network down');
  });

  it('does nothing without a job seeker profile id', async () => {
    await service.loadJobFeed('');
    expect(matching.getSwipedJobIds).not.toHaveBeenCalled();
    expect(service.feedLoading()).toBe(false);
  });

  it('clears a previous error on a successful retry', async () => {
    jobs.getPublishedJobs.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([jobRow()]);

    await service.loadJobFeed('jsp-real');
    expect(service.feedError()).toBe('boom');
    await service.loadJobFeed('jsp-real');

    expect(service.feedError()).toBeNull();
    expect(service.jobs()).toHaveLength(1);
  });
});
