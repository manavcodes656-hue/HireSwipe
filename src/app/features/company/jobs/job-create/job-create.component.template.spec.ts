// Renders the REAL template (the sibling job-create.component.spec.ts replaces it with a stub), so
// button states, banners and zoneless re-rendering are exercised as a user sees them.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { JobCreateComponent } from './job-create.component';
import { CompanyDataService } from '../../services/company-data.service';

const VALID = { title: 'Senior Full Stack Engineer', description: 'Build and ship the hiring platform end to end.' };

describe('JobCreateComponent — real template', () => {
  let dataService: { jobs$: BehaviorSubject<any[]>; createJob: any; updateJob: any };
  let navigate: any;

  const setup = () => {
    dataService = {
      jobs$: new BehaviorSubject<any[]>([]),
      createJob: vi.fn().mockResolvedValue({ jobId: 'job-1', error: null }),
      updateJob: vi.fn().mockResolvedValue({ error: null }),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [JobCreateComponent],
      providers: [provideRouter([]), { provide: CompanyDataService, useValue: dataService }],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(JobCreateComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  };

  const text = (fixture: any) => fixture.nativeElement.textContent as string;
  const headerPublish = (fixture: any): HTMLButtonElement => fixture.nativeElement.querySelector('.header-actions .btn-primary');
  const sidePublish = (fixture: any): HTMLButtonElement => fixture.nativeElement.querySelector('.publishing-card .btn-primary');

  beforeEach(() => vi.restoreAllMocks());

  it('shows which required fields are missing when an incomplete form is submitted', async () => {
    const { fixture, component } = setup();

    await component.saveJob('active');
    await fixture.whenStable();

    expect(dataService.createJob).not.toHaveBeenCalled();
    expect(text(fixture)).toContain('Job Title');
    expect(text(fixture)).toContain('Job Description (at least 30 characters)');
  });

  it('shows an API failure on screen after the request completes and re-enables both Publish buttons', async () => {
    const { fixture, component } = setup();
    component.jobForm.patchValue(VALID);
    dataService.createJob.mockResolvedValue({ jobId: null, error: 'Must be an active company member to post jobs' });

    await component.saveJob('active');
    await fixture.whenStable();

    expect(text(fixture)).toContain('Must be an active company member to post jobs');
    expect(headerPublish(fixture).disabled).toBe(false);
    expect(sidePublish(fixture).disabled).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('disables every Publish/Draft button while saving and sends exactly one request', async () => {
    const { fixture, component } = setup();
    component.jobForm.patchValue(VALID);
    let resolve!: (v: { jobId: string; error: null }) => void;
    dataService.createJob.mockReturnValue(new Promise((r) => (resolve = r)));

    const first = component.saveJob('active');
    void component.saveJob('active');
    await fixture.whenStable();

    expect(dataService.createJob).toHaveBeenCalledTimes(1);
    expect(headerPublish(fixture).disabled).toBe(true);
    expect(headerPublish(fixture).textContent).toContain('Saving');
    expect(sidePublish(fixture).disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.publishing-card .btn-outline').disabled).toBe(true);

    resolve({ jobId: 'job-1', error: null });
    await first;
    expect(navigate).toHaveBeenCalledWith(['/company/jobs']);
  });

  // Regression: the app runs without zone.js, so state changed after an awaited request is only
  // rendered if Angular is notified. Signals/markForCheck do that; this guards against regressions.
  it('re-renders by itself after a failed save (no manual change detection)', async () => {
    const { fixture, component } = setup();
    component.jobForm.patchValue(VALID);
    dataService.createJob.mockRejectedValueOnce(new Error('Network down'));

    await component.saveJob('active');
    await fixture.whenStable();

    expect(text(fixture)).toContain('Network down');
    expect(component.isSaving()).toBe(false);
  });
});
