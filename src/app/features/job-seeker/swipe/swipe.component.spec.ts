import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { SwipeComponent } from './swipe.component';
import { JobSeekerService } from '../services/job-seeker.service';

const JOB = {
  id: '22222222-2222-2222-2222-222222222222',
  title: 'Angular Engineer',
  company_id: 'c1',
  company_name: 'Acme',
  employment_type: 'full time',
  salary_currency: 'USD',
  remote_type: 'remote',
  description: 'Build',
  status: 'published',
  created_at: '',
  updated_at: '',
};

describe('SwipeComponent Like/Pass', () => {
  let swipeJob: any;

  const setup = () => {
    swipeJob = vi.fn().mockResolvedValue({ ok: true });
    const mock = {
      availableDeckJobs: signal([JOB]),
      jobs: signal([JOB]),
      feedLoading: signal(false),
      feedError: signal<string | null>(null),
      profile: signal({}),
      swipeJob,
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SwipeComponent],
      providers: [provideRouter([]), { provide: JobSeekerService, useValue: mock }],
    });
    return TestBed.createComponent(SwipeComponent);
  };

  beforeEach(() => vi.restoreAllMocks());

  it('awaits persistence for a Like and shows no error on success', async () => {
    const fixture = setup();
    const c = fixture.componentInstance;

    await c.handleSwipe('like');

    expect(swipeJob).toHaveBeenCalledWith(JOB, 'like');
    expect(c.swipeError()).toBeNull();
    expect(c.swipePending()).toBe(false);
  });

  it('records a Pass', async () => {
    const c = setup().componentInstance;
    await c.handleSwipe('pass');
    expect(swipeJob).toHaveBeenCalledWith(JOB, 'pass');
  });

  it('shows the error, keeps the card and re-enables swiping after a failure', async () => {
    const fixture = setup();
    const c = fixture.componentInstance;
    swipeJob.mockResolvedValue({ ok: false, error: 'Could not save your swipe.' });

    await c.handleSwipe('like');
    fixture.detectChanges();

    expect(c.currentJob()?.id).toBe(JOB.id);
    expect(c.swipePending()).toBe(false);
    expect(fixture.nativeElement.querySelector('.swipe-error-banner')?.textContent).toContain('Could not save');
    expect(fixture.nativeElement.querySelector('.like-btn').disabled).toBe(false);
  });

  it('ignores clicks while a swipe is pending and disables the buttons', async () => {
    const fixture = setup();
    const c = fixture.componentInstance;
    let resolve!: (v: { ok: boolean }) => void;
    swipeJob.mockReturnValue(new Promise((r) => (resolve = r)));

    const first = c.handleSwipe('like');
    void c.handleSwipe('like');
    void c.handleSwipe('pass');
    fixture.detectChanges();

    expect(swipeJob).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.like-btn').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.pass-btn').disabled).toBe(true);

    resolve({ ok: true });
    await first;
    expect(c.swipePending()).toBe(false);
  });
});
