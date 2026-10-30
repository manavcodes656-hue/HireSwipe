import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { JobDetailsComponent } from './job-details.component';
import { CompanyDataService } from '../../services/company-data.service';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of } from 'rxjs';
import { Job, Application } from '../../models/company.models';

describe('JobDetailsComponent — Edit, Pause, and Close Actions', () => {
  let component: JobDetailsComponent;
  let fixture: ComponentFixture<JobDetailsComponent>;
  let mockDataService: any;
  let jobsSubject: BehaviorSubject<Job[]>;
  let appsSubject: BehaviorSubject<Application[]>;

  const mockJob: Job = {
    id: 'job-100',
    company_id: 'comp-1',
    title: 'Staff Platform Engineer',
    description: 'Lead infrastructure, observability, and distributed systems.',
    status: 'active',
    employment_type: 'full_time',
    experience_level: 'lead',
    experience_min: 7,
    experience_max: 10,
    salary_min: 4000000,
    salary_max: 5500000,
    salary_currency: 'INR',
    location: 'Bengaluru, India',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    remote_type: 'hybrid',
    openings: 1,
    views_count: 85,
    applications_count: 8,
    matches_count: 14,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    jobsSubject = new BehaviorSubject<Job[]>([mockJob]);
    appsSubject = new BehaviorSubject<Application[]>([]);
    mockDataService = {
      jobs$: jobsSubject.asObservable(),
      applications$: appsSubject.asObservable(),
      currentJobs: [mockJob],
      getJobById: vi.fn().mockResolvedValue(mockJob),
      updateJobStatus: vi.fn().mockResolvedValue({ error: null }),
    };

    TestBed.configureTestingModule({
      imports: [JobDetailsComponent, RouterTestingModule],
      providers: [
        { provide: CompanyDataService, useValue: mockDataService },
        {
          provide: ActivatedRoute,
          useValue: { params: of({ id: 'job-100' }) },
        },
      ],
    });

    TestBed.overrideComponent(JobDetailsComponent, {
      set: {
        template: `
          <div class="job-details-page" *ngIf="job">
            <p class="form-error" *ngIf="statusError()">{{ statusError() }}</p>
            <p class="form-success" *ngIf="statusSuccess()">{{ statusSuccess() }}</p>
            <h1>{{ job.title }}</h1>
            <a class="btn-edit" [routerLink]="['/company/jobs', job.id, 'edit']">Edit Role</a>
            <button class="btn-pause" *ngIf="job.status === 'active' || job.status === 'published'" (click)="changeStatus('paused')" [disabled]="isUpdating()">Pause Listing</button>
            <button class="btn-publish" *ngIf="job.status === 'paused' || job.status === 'draft'" (click)="changeStatus('active')" [disabled]="isUpdating()">Publish Role</button>
            <button class="btn-close" *ngIf="job.status !== 'closed'" (click)="changeStatus('closed')" [disabled]="isUpdating()">Close Listing</button>
          </div>
        `,
      },
    });

    fixture = TestBed.createComponent(JobDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should load job details from route params', () => {
    expect(component.job).toBeTruthy();
    expect(component.job?.id).toBe('job-100');
    expect(component.job?.title).toBe('Staff Platform Engineer');
  });

  it('should pause an active job listing and show feedback', async () => {
    await component.changeStatus('paused');

    expect(mockDataService.updateJobStatus).toHaveBeenCalledWith('job-100', 'paused');
    expect(component.statusSuccess()).toContain('has been successfully paused');
    expect(component.statusError()).toBe('');
    expect(component.isUpdating()).toBe(false);
  });

  it('should ask confirmation before closing and proceed when confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await component.changeStatus('closed');

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('close the job "Staff Platform Engineer"'));
    expect(mockDataService.updateJobStatus).toHaveBeenCalledWith('job-100', 'closed');
    expect(component.statusSuccess()).toContain('has been successfully closed');
    expect(component.isUpdating()).toBe(false);
  });

  it('should cancel closing if user denies confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await component.changeStatus('closed');

    expect(window.confirm).toHaveBeenCalled();
    expect(mockDataService.updateJobStatus).not.toHaveBeenCalled();
    expect(component.statusSuccess()).toBe('');
  });

  it('should show error when updating job status fails', async () => {
    mockDataService.updateJobStatus.mockResolvedValue({ error: 'Server unavailable' });

    await component.changeStatus('paused');

    expect(component.statusError()).toBe('Server unavailable');
    expect(component.statusSuccess()).toBe('');
  });
});
