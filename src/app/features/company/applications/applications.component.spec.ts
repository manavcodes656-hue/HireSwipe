import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ApplicationsComponent } from './applications.component';
import { CompanyDataService } from '../services/company-data.service';

const APP_ID = '33333333-3333-4333-8333-333333333333';

const application = (over: any = {}): any => ({
  id: APP_ID,
  job_id: 'job-1',
  job_seeker_id: 'seeker-1',
  company_id: 'company-1',
  status: 'pending',
  applied_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  job: { id: 'job-1', title: 'Angular Engineer' },
  profile: { id: 'seeker-1', full_name: 'Priya Sharma', email: 'p@x.test', headline: 'Engineer' },
  status_history: [],
  ...over,
});

describe('Company ApplicationsComponent — express interest', () => {
  let interested$: BehaviorSubject<ReadonlySet<string>>;
  let expressInterest: any;

  const setup = (app = application()) => {
    interested$ = new BehaviorSubject<ReadonlySet<string>>(new Set());
    expressInterest = vi.fn().mockResolvedValue({ error: null });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ApplicationsComponent],
      providers: [
        provideRouter([]),
        {
          provide: CompanyDataService,
          useValue: {
            applications$: new BehaviorSubject([app]),
            jobs$: new BehaviorSubject([]),
            interestedApplicationIds$: interested$.asObservable(),
            expressInterest,
            updateApplicationStatus: vi.fn(),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ApplicationsComponent);
    refresh(fixture);
    fixture.componentInstance.openReviewDrawer(app);
    refresh(fixture);
    return fixture;
  };

  /** Components here use plain properties; mark the view dirty so a manual pass always re-renders. */
  const refresh = (f: any) => {
    f.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    f.detectChanges();
  };

  const likeButton = (fixture: any): HTMLButtonElement => {
    const el = fixture.nativeElement.querySelector('.action-buttons-grid .act-btn.shortlist');
    return el;
  };

  beforeEach(() => vi.restoreAllMocks());

  it('sends the real application id and marks interest only after confirmation', async () => {
    const fixture = setup();
    const c = fixture.componentInstance;

    await c.expressInterest();
    interested$.next(new Set([APP_ID])); // the data service publishes this after the backend confirms
    refresh(fixture);

    expect(expressInterest).toHaveBeenCalledTimes(1);
    expect(expressInterest).toHaveBeenCalledWith(APP_ID);
    expect(c.interestError).toBe('');
    expect(c.interestPending).toBe(false);
    expect(likeButton(fixture).textContent).toContain('Interest sent');
    expect(likeButton(fixture).disabled).toBe(true);
  });

  it('shows the backend error, does not claim success and allows a retry', async () => {
    const fixture = setup();
    expressInterest.mockResolvedValueOnce({ error: 'Company interest is not available yet.' });

    await fixture.componentInstance.expressInterest();
    refresh(fixture);

    expect(fixture.nativeElement.textContent).toContain('Company interest is not available yet.');
    expect(likeButton(fixture).textContent).not.toContain('Interest sent');
    expect(likeButton(fixture).disabled).toBe(false);

    await fixture.componentInstance.expressInterest();
    expect(expressInterest).toHaveBeenCalledTimes(2);
  });

  it('ignores repeated clicks while a request is pending and disables the button', async () => {
    const fixture = setup();
    let resolve!: (v: { error: null }) => void;
    expressInterest.mockReturnValue(new Promise((r) => (resolve = r)));

    const first = fixture.componentInstance.expressInterest();
    void fixture.componentInstance.expressInterest();
    void fixture.componentInstance.expressInterest();
    refresh(fixture);

    expect(expressInterest).toHaveBeenCalledTimes(1);
    expect(likeButton(fixture).disabled).toBe(true);
    expect(likeButton(fixture).textContent).toContain('Sending');

    resolve({ error: null });
    await first;
    expect(fixture.componentInstance.interestPending).toBe(false);
  });

  it('does not send another request for an application that already has interest', async () => {
    const fixture = setup();
    interested$.next(new Set([APP_ID]));

    await fixture.componentInstance.expressInterest();

    expect(expressInterest).not.toHaveBeenCalled();
  });

  it('disables the Like for a withdrawn application', () => {
    const fixture = setup(application({ status: 'withdrawn' }));
    expect(likeButton(fixture).disabled).toBe(true);
  });

  it('keeps Reject as the Pass action: it changes the status and never records interest', async () => {
    const fixture = setup();
    const dataService = TestBed.inject(CompanyDataService) as any;
    dataService.updateApplicationStatus.mockResolvedValue({ error: null });

    await fixture.componentInstance.updateStatus('rejected');

    expect(dataService.updateApplicationStatus).toHaveBeenCalledWith(APP_ID, 'rejected', '');
    expect(expressInterest).not.toHaveBeenCalled();
  });
});
