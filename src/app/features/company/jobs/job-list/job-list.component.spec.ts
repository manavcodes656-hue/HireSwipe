import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { JobListComponent } from './job-list.component';
import { CompanyDataService } from '../../services/company-data.service';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';
import { Job } from '../../models/company.models';

describe('JobListComponent — Edit, Pause, and Close Actions', () => {
  let component: JobListComponent;
  let fixture: ComponentFixture<JobListComponent>;
  let mockDataService: any;
  let jobsSubject: BehaviorSubject<Job[]>;

  const mockJobs: Job[] = [
    {
      id: 'job-1',
      company_id: 'comp-1',
      title: 'Senior Frontend Engineer',
      description: 'Building modern web applications using Angular.',
      status: 'active',
      employment_type: 'full_time',
      experience_level: 'senior',
      experience_min: 5,
      experience_max: 8,
      salary_min: 2500000,
      salary_max: 3500000,
      salary_currency: 'INR',
      location: 'Bengaluru, India',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      remote_type: 'hybrid',
      openings: 2,
      views_count: 42,
      applications_count: 5,
      matches_count: 12,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'job-2',
      company_id: 'comp-1',
      title: 'Backend Engineer',
      description: 'Node.js and PostgreSQL backend services.',
      status: 'paused',
      employment_type: 'full_time',
      experience_level: 'mid',
      experience_min: 3,
      experience_max: 5,
      salary_min: 1800000,
      salary_max: 2400000,
      salary_currency: 'INR',
      location: 'Remote',
      city: 'Remote',
      state: 'Remote',
      country: 'India',
      remote_type: 'remote',
      openings: 1,
      views_count: 15,
      applications_count: 2,
      matches_count: 6,
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    jobsSubject = new BehaviorSubject<Job[]>(mockJobs);
    mockDataService = {
      jobs$: jobsSubject.asObservable(),
      currentJobs: mockJobs,
      updateJobStatus: vi.fn().mockResolvedValue({ error: null }),
    };

    TestBed.configureTestingModule({
      imports: [JobListComponent, RouterTestingModule],
      providers: [{ provide: CompanyDataService, useValue: mockDataService }],
    });

    TestBed.overrideComponent(JobListComponent, {
      set: {
        template: `
          <div class="jobs-page">
            <p class="form-error" *ngIf="statusError()">{{ statusError() }}</p>
            <p class="form-success" *ngIf="statusSuccess()">{{ statusSuccess() }}</p>
            <div *ngFor="let job of filteredJobs" class="job-item">
              <span class="title">{{ job.title }}</span>
              <a class="btn-edit" [routerLink]="['/company/jobs', job.id, 'edit']">Edit</a>
              <button class="btn-pause" *ngIf="job.status === 'active' || job.status === 'published'" (click)="changeStatus(job, 'paused', $event)" [disabled]="isUpdating()">Pause</button>
              <button class="btn-publish" *ngIf="job.status === 'paused' || job.status === 'draft'" (click)="changeStatus(job, 'active', $event)" [disabled]="isUpdating()">Publish</button>
              <button class="btn-close" *ngIf="job.status !== 'closed'" (click)="changeStatus(job, 'closed', $event)" [disabled]="isUpdating()">Close</button>
            </div>
          </div>
        `,
      },
    });

    fixture = TestBed.createComponent(JobListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should initialize and display jobs from data service', () => {
    expect(component.jobs.length).toBe(2);
    expect(component.filteredJobs.length).toBe(2);
  });

  it('should pause an active job and display success feedback', async () => {
    const job = component.jobs[0];
    const event = new MouseEvent('click');
    vi.spyOn(event, 'stopPropagation');

    await component.changeStatus(job, 'paused', event);

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(mockDataService.updateJobStatus).toHaveBeenCalledWith('job-1', 'paused');
    expect(component.statusSuccess()).toContain('has been successfully paused');
    expect(component.statusError()).toBe('');
    expect(component.isUpdating()).toBe(false);
  });

  it('should ask confirmation before closing a job and proceed when confirmed', async () => {
    const job = component.jobs[0];
    const event = new MouseEvent('click');
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await component.changeStatus(job, 'closed', event);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('close the job "Senior Frontend Engineer"'));
    expect(mockDataService.updateJobStatus).toHaveBeenCalledWith('job-1', 'closed');
    expect(component.statusSuccess()).toContain('has been successfully closed');
    expect(component.isUpdating()).toBe(false);
  });

  it('should not call updateJobStatus if closing is cancelled by user', async () => {
    const job = component.jobs[0];
    const event = new MouseEvent('click');
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await component.changeStatus(job, 'closed', event);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockDataService.updateJobStatus).not.toHaveBeenCalled();
    expect(component.statusSuccess()).toBe('');
  });

  it('should display error message when updateJobStatus fails', async () => {
    mockDataService.updateJobStatus.mockResolvedValue({ error: 'Database update rejected' });
    const job = component.jobs[0];
    const event = new MouseEvent('click');

    await component.changeStatus(job, 'paused', event);

    expect(component.statusError()).toBe('Database update rejected');
    expect(component.statusSuccess()).toBe('');
    expect(component.isUpdating()).toBe(false);
  });
});
