import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CompanyDataService } from './company-data.service';
import { AuthService } from '../../../core/services/auth.service';
import { ProfileService } from '../../../core/services/profile.service';
import { CompanyService } from '../../../core/services/company.service';
import { JobsService } from '../../../core/services/jobs.service';
import { ApplicationsService } from '../../../core/services/applications.service';
import { MatchingService } from '../../../core/services/matching.service';
import { InterviewsService } from '../../../core/services/interviews.service';
import { NotificationsService } from '../../../core/services/notifications.service';
import { MessagesService } from '../../../core/services/messages.service';

describe('CompanyDataService company interest', () => {
  let applications: any;
  let service: CompanyDataService;

  beforeEach(() => {
    applications = {
      expressCompanyInterest: vi.fn(),
      getInterestedApplicationIds: vi.fn().mockResolvedValue([]),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        CompanyDataService,
        { provide: AuthService, useValue: {} },
        { provide: ProfileService, useValue: {} },
        { provide: CompanyService, useValue: {} },
        { provide: JobsService, useValue: {} },
        { provide: ApplicationsService, useValue: applications },
        { provide: MatchingService, useValue: {} },
        { provide: InterviewsService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: MessagesService, useValue: {} },
      ],
    });
    service = TestBed.inject(CompanyDataService);
  });

  const current = () => firstValueFrom(service.interestedApplicationIds$);

  it('loads the applications the company already expressed interest in', async () => {
    applications.getInterestedApplicationIds.mockResolvedValue(['a1', 'a2']);

    await service.loadInterest();

    expect(await current()).toEqual(new Set(['a1', 'a2']));
  });

  it('marks an application as interested only after the backend confirms it', async () => {
    applications.expressCompanyInterest.mockResolvedValue({ interest: {}, alreadyRecorded: false, error: null });

    const res = await service.expressInterest('app-1');

    expect(res).toEqual({ error: null });
    expect(applications.expressCompanyInterest).toHaveBeenCalledWith('app-1');
    expect((await current()).has('app-1')).toBe(true);
  });

  it('treats an already-recorded (duplicate) request as success without duplicating state', async () => {
    applications.expressCompanyInterest.mockResolvedValue({ interest: {}, alreadyRecorded: true, error: null });

    await service.expressInterest('app-1');
    await service.expressInterest('app-1');

    const ids = await current();
    expect(ids.size).toBe(1);
    expect(ids.has('app-1')).toBe(true);
  });

  it('does not mark the application when the backend rejects the request', async () => {
    applications.expressCompanyInterest.mockResolvedValue({
      interest: null,
      alreadyRecorded: false,
      error: 'The candidate withdrew this application',
    });

    const res = await service.expressInterest('app-1');

    expect(res).toEqual({ error: 'The candidate withdrew this application' });
    expect((await current()).has('app-1')).toBe(false);
  });
});
