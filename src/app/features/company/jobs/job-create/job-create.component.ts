import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CompanyDataService } from '../../services/company-data.service';
import { Job, EmploymentType, ExperienceLevel, RemoteType } from '../../models/company.models';

@Component({
  selector: 'app-job-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './job-create.component.html',
  styleUrl: './job-create.component.css',
})
export class JobCreateComponent implements OnInit {
  isEditMode = false;
  editingJobId: string | null = null;
  jobForm!: FormGroup;

  skillsList: string[] = ['Angular', 'TypeScript', 'Node.js', 'RxJS', 'PostgreSQL', 'AWS', 'Docker', 'Kubernetes', 'Figma', 'Python', 'PyTorch'];
  selectedSkills: string[] = ['Angular', 'TypeScript', 'Node.js'];
  customSkillInput = '';

  requirementsList: string[] = [
    '5+ years of experience building scalable web applications.',
    'Strong knowledge of TypeScript, modular CSS, and state management.',
    'Proven experience designing microservices and REST/GraphQL APIs.',
  ];
  customRequirementInput = '';

  benefitsList: string[] = [
    'Competitive salary + stock options',
    'Comprehensive family health coverage',
    'Flexible remote/hybrid work setup',
    'Annual $2,000 USD learning stipend',
  ];
  customBenefitInput = '';

  employmentTypes: { value: EmploymentType; label: string }[] = [
    { value: 'full_time', label: 'Full Time' },
    { value: 'part_time', label: 'Part Time' },
    { value: 'contract', label: 'Contract' },
    { value: 'internship', label: 'Internship' },
    { value: 'freelance', label: 'Freelance' },
  ];

  experienceLevels: { value: ExperienceLevel; label: string }[] = [
    { value: 'entry', label: 'Entry Level (0-2 Yrs)' },
    { value: 'mid', label: 'Mid Level (2-5 Yrs)' },
    { value: 'senior', label: 'Senior Level (5-8 Yrs)' },
    { value: 'lead', label: 'Lead / Principal (8+ Yrs)' },
    { value: 'executive', label: 'Executive' },
  ];

  remoteTypes: { value: RemoteType; label: string }[] = [
    { value: 'on_site', label: 'On-Site Office' },
    { value: 'hybrid', label: 'Hybrid Work' },
    { value: 'remote', label: 'Fully Remote' },
  ];

  constructor(
    private fb: FormBuilder,
    private dataService: CompanyDataService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();

    this.route.params.subscribe((params) => {
      if (params['id']) {
        this.isEditMode = true;
        this.editingJobId = params['id'];
        this.loadJobForEdit(params['id']);
      }
    });
  }

  private initForm(): void {
    this.jobForm = this.fb.group({
      title: ['', Validators.required],
      description: ['', [Validators.required, Validators.minLength(30)]],
      employment_type: ['full_time', Validators.required],
      experience_level: ['senior', Validators.required],
      experience_min: [5, [Validators.required, Validators.min(0)]],
      experience_max: [9, [Validators.required, Validators.min(0)]],
      salary_min: [2800000, [Validators.required, Validators.min(0)]],
      salary_max: [4200000, [Validators.required, Validators.min(0)]],
      salary_currency: ['INR', Validators.required],
      location: ['Bengaluru, India', Validators.required],
      city: ['Bengaluru', Validators.required],
      state: ['Karnataka', Validators.required],
      country: ['India', Validators.required],
      remote_type: ['hybrid', Validators.required],
      openings: [2, [Validators.required, Validators.min(1)]],
      application_deadline: ['2026-12-31', Validators.required],
    });
  }

  private loadJobForEdit(id: string): void {
    let job: Job | undefined;
    this.dataService.jobs$.subscribe((jobs) => {
      job = jobs.find((j) => j.id === id);
    }).unsubscribe();

    if (job) {
      this.jobForm.patchValue({
        title: job.title,
        description: job.description,
        employment_type: job.employment_type,
        experience_level: job.experience_level,
        experience_min: job.experience_min,
        experience_max: job.experience_max,
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        salary_currency: job.salary_currency,
        location: job.location,
        city: job.city,
        state: job.state,
        country: job.country,
        remote_type: job.remote_type,
        openings: job.openings,
        application_deadline: job.application_deadline,
      });

      if (job.skills) {
        this.selectedSkills = job.skills.map((s) => s.skill_name || '').filter((name): name is string => !!name);
      }
      if (job.requirements) {
        this.requirementsList = job.requirements.map((r) => r.requirement_text || r.requirement || '').filter(Boolean);
      }
      if (job.benefits) {
        this.benefitsList = job.benefits.map((b) => b.benefit_text || b.benefit || '').filter(Boolean);
      }
    }
  }

  // Skills handlers
  toggleSkill(skill: string): void {
    const idx = this.selectedSkills.indexOf(skill);
    if (idx > -1) {
      this.selectedSkills.splice(idx, 1);
    } else {
      this.selectedSkills.push(skill);
    }
  }

  addCustomSkill(): void {
    if (this.customSkillInput.trim()) {
      const val = this.customSkillInput.trim();
      if (!this.selectedSkills.includes(val)) {
        this.selectedSkills.push(val);
      }
      this.customSkillInput = '';
    }
  }

  // Requirements handlers
  addRequirement(): void {
    if (this.customRequirementInput.trim()) {
      this.requirementsList.push(this.customRequirementInput.trim());
      this.customRequirementInput = '';
    }
  }

  removeRequirement(index: number): void {
    this.requirementsList.splice(index, 1);
  }

  // Benefits handlers
  addBenefit(): void {
    if (this.customBenefitInput.trim()) {
      this.benefitsList.push(this.customBenefitInput.trim());
      this.customBenefitInput = '';
    }
  }

  removeBenefit(index: number): void {
    this.benefitsList.splice(index, 1);
  }

  saveError = '';
  isSaving = false;

  async saveJob(status: 'active' | 'draft'): Promise<void> {
    if (this.jobForm.invalid) {
      this.jobForm.markAllAsTouched();
      return;
    }

    const payload = {
      ...this.jobForm.value,
      status: status,
      skills: this.selectedSkills.map((s, idx) => ({ id: `s-${idx}`, job_id: '', skill_name: s, is_required: true })),
      requirements: this.requirementsList.map((r, idx) => ({ id: `r-${idx}`, job_id: '', requirement_text: r, order_index: idx + 1 })),
      benefits: this.benefitsList.map((b, idx) => ({ id: `b-${idx}`, job_id: '', benefit_text: b })),
    };

    this.isSaving = true;
    this.saveError = '';
    let error: string | null;
    let saved: boolean;
    if (this.isEditMode && this.editingJobId) {
      const result = await this.dataService.updateJob(this.editingJobId, payload);
      error = result.error;
      // updateJob only reports child-row problems after the job row itself saved.
      saved = !error || error.startsWith('Job saved');
    } else {
      const result = await this.dataService.createJob(payload);
      error = result.error;
      saved = !!result.jobId;
      if (result.jobId && error) {
        // The job row exists; further saves must update it, not insert a duplicate.
        this.isEditMode = true;
        this.editingJobId = result.jobId;
      }
    }
    this.isSaving = false;

    if (!saved) {
      this.saveError = error ?? 'The job could not be saved.';
      return;
    }
    if (error) {
      // Job row persisted but some details (e.g. unknown skills) did not; stay and tell the user.
      this.saveError = error;
      return;
    }
    this.router.navigate(['/company/jobs']);
  }
}
