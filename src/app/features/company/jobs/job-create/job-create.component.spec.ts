import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { FormBuilder, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { JobCreateComponent } from './job-create.component';
import { CompanyDataService } from '../../services/company-data.service';

describe('JobCreateComponent — Post Job Button Bug Regression Tests', () => {
  let component: JobCreateComponent;
  let fixture: ComponentFixture<JobCreateComponent>;
  let mockDataService: any;
  let mockRouter: any;

  beforeEach(async () => {
    mockDataService = {
      createJob: vi.fn(),
      updateJob: vi.fn(),
      jobs$: of([]),
    };
    mockRouter = {
      navigate: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, FormsModule],
      providers: [
        { provide: CompanyDataService, useValue: mockDataService },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: { params: of({}) },
        },
      ],
    });

    TestBed.overrideComponent(JobCreateComponent, {
      set: {
        template: '<button id="publishBtn" (click)="saveJob(\'active\')" [disabled]="isSaving()">Publish</button><p class="form-error" *ngIf="saveError()">{{ saveError() }}</p>',
      },
    });

    fixture = TestBed.createComponent(JobCreateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function fillValidForm(): void {
    component.jobForm.patchValue({
      title: 'Senior Angular Engineer',
      description: 'We need a senior engineer with 5+ years of Angular experience to build scalable apps.',
      employment_type: 'full_time',
      experience_level: 'senior',
      experience_min: 5,
      experience_max: 9,
      salary_min: 2800000,
      salary_max: 4200000,
      salary_currency: 'INR',
      location: 'Bengaluru, India',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      remote_type: 'hybrid',
      openings: 2,
      application_deadline: '2026-12-31',
    });
  }

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should not call createJob when form is invalid', async () => {
    component.jobForm.patchValue({ title: '', description: '' });
    await component.saveJob('active');

    expect(mockDataService.createJob).not.toHaveBeenCalled();
    expect(component.saveError()).toContain('fill out all required fields');
  });

  it('should mark all fields as touched and show visible error when form is invalid', async () => {
    component.jobForm.patchValue({ title: '', description: '' });
    await component.saveJob('active');

    expect(component.jobForm.get('title')?.touched).toBe(true);
    expect(component.jobForm.get('description')?.touched).toBe(true);
    expect(component.saveError()).toBe('Please fill out all required fields marked with * before publishing.');
  });

  it('should call createJob and navigate to /company/jobs on successful submission', async () => {
    fillValidForm();
    mockDataService.createJob.mockResolvedValue({ jobId: 'new-job-id', error: null });

    await component.saveJob('active');

    expect(mockDataService.createJob).toHaveBeenCalledTimes(1);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/company/jobs']);
    expect(component.isSaving()).toBe(false);
    expect(component.saveError()).toBe('');
  });

  it('should display visible error message when createJob fails', async () => {
    fillValidForm();
    mockDataService.createJob.mockResolvedValue({
      jobId: null,
      error: 'Company not initialized. Please ensure your company profile is set up.',
    });

    await component.saveJob('active');

    expect(component.saveError()).toBe('Company not initialized. Please ensure your company profile is set up.');
    expect(component.isSaving()).toBe(false);
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('should set isSaving to true during save and false after', async () => {
    fillValidForm();
    let resolvePromise: (value: any) => void;
    const pending = new Promise((resolve) => { resolvePromise = resolve; });
    mockDataService.createJob.mockReturnValue(pending);

    const savePromise = component.saveJob('active');
    expect(component.isSaving()).toBe(true);

    resolvePromise!({ jobId: 'new-job-id', error: null });
    await savePromise;

    expect(component.isSaving()).toBe(false);
  });

  it('should handle unexpected network exceptions gracefully', async () => {
    fillValidForm();
    mockDataService.createJob.mockRejectedValue(new Error('Connection failed'));

    await component.saveJob('active');

    expect(component.saveError()).toBe('Connection failed');
    expect(component.isSaving()).toBe(false);
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('should stay on page with partial error when job created but children fail', async () => {
    fillValidForm();
    mockDataService.createJob.mockResolvedValue({
      jobId: 'new-job-id',
      error: 'Job saved, but some details were not: skills not in the skills catalog were not saved: CustomSkill',
    });

    await component.saveJob('active');

    expect(component.isEditMode).toBe(true);
    expect(component.editingJobId).toBe('new-job-id');
    expect(component.saveError()).toContain('skills not in the skills catalog');
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('should use updateJob when in edit mode', async () => {
    fillValidForm();
    component.isEditMode = true;
    component.editingJobId = 'existing-job-id';
    mockDataService.updateJob.mockResolvedValue({ error: null });

    await component.saveJob('active');

    expect(mockDataService.updateJob).toHaveBeenCalledWith('existing-job-id', expect.any(Object));
    expect(mockDataService.createJob).not.toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/company/jobs']);
  });

  it('should use signals for isSaving and saveError for zoneless change detection', () => {
    expect(typeof component.isSaving).toBe('function');
    expect(typeof component.saveError).toBe('function');
    expect(component.isSaving()).toBe(false);
    expect(component.saveError()).toBe('');
  });
});
