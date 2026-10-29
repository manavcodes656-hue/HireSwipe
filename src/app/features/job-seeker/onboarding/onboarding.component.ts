import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
  FormsModule,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { JobSeekerService } from '../services/job-seeker.service';

/**
 * Rejects required fields that are empty or whitespace-only.
 * Angular's Validators.required treats "   " as valid; this validator does not.
 */
export function trimmedRequiredValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const val = control.value;
    if (val === null || val === undefined) return { required: true };
    if (typeof val === 'string' && val.trim().length === 0) return { required: true };
    return null;
  };
}

/**
 * Enforces a minimum length on the trimmed value, so padded whitespace
 * cannot satisfy a minimum-length requirement.
 */
export function trimmedMinLengthValidator(min: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const val = control.value;
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'string' && val.trim().length < min) {
      return { minlength: { requiredLength: min, actualLength: val.trim().length } };
    }
    return null;
  };
}
import {
  Education,
  Experience,
  JobSeekerSkill,
  ProficiencyLevel,
  JobSeekerPreference,
} from '../models/job-seeker.models';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.css',
})
export class OnboardingComponent implements OnInit {
  jobSeekerService = inject(JobSeekerService);
  fb = inject(FormBuilder);
  router = inject(Router);

  // Zoneless app: values set after an await only re-render when they are signals.
  private readonly _currentStep = signal<number>(1);
  get currentStep(): number { return this._currentStep(); }
  set currentStep(v: number) { this._currentStep.set(v); }
  totalSteps = 6;

  // Tracks which steps have been genuinely completed (validated + persisted).
  private readonly _completedSteps = signal<Set<number>>(new Set<number>());
  get completedSteps(): Set<number> { return this._completedSteps(); }

  // Zoneless app: values set after an await only re-render when they are signals.
  private readonly _isSubmitting = signal<boolean>(false);
  get isSubmitting(): boolean { return this._isSubmitting(); }
  set isSubmitting(v: boolean) { this._isSubmitting.set(v); }
  // Zoneless app: values set after an await only re-render when they are signals.
  private readonly _errorMessage = signal<string | null>(null);
  get errorMessage(): string | null { return this._errorMessage(); }
  set errorMessage(v: string | null) { this._errorMessage.set(v); }
  saveSuccessMessage = signal<string>('');

  // Step 1: Personal Details & Contact
  step1Form!: FormGroup;

  // Step 2: Professional Background & Online Presence
  step2Form!: FormGroup;

  // Step 3: Education & Experience Modals
  educationForm!: FormGroup;
  editingEduId = signal<string | null>(null);
  showEduModal = signal(false);

  experienceForm!: FormGroup;
  editingExpId = signal<string | null>(null);
  showExpModal = signal(false);

  // Step 4: Skills, Resume & Preferences
  preferencesForm!: FormGroup;
  skillSearchQuery = signal('');
  selectedProficiency = signal<ProficiencyLevel>('advanced');
  selectedSkillYoe = signal<number>(3);
  resumeDragOver = signal(false);
  industryInput = signal('');

  readonly popularSkills = [
    'Angular',
    'React',
    'TypeScript',
    'Node.js',
    'Python',
    'Java',
    'PostgreSQL',
    'Docker',
    'AWS',
    'System Design',
    'Figma',
    'GraphQL',
  ];

  readonly availabilityOptions = [
    'Immediate',
    '15 Days',
    '30 Days',
    '60 Days',
    '90 Days',
  ];

  readonly remoteOptions: { value: 'remote' | 'hybrid' | 'on_site'; label: string; desc: string }[] = [
    { value: 'remote', label: 'Remote', desc: '100% remote flexibility' },
    { value: 'hybrid', label: 'Hybrid', desc: 'Mix of office and remote working' },
    { value: 'on_site', label: 'On-site', desc: 'Full-time at company location' },
  ];

  calculatedProgress = computed(() => this.jobSeekerService.calculateCompletionPercentage());

  readonly employmentTypeOptions: { value: 'full_time' | 'part_time' | 'contract' | 'internship'; label: string }[] = [
    { value: 'full_time', label: 'Full-time' },
    { value: 'contract', label: 'Contract' },
    { value: 'part_time', label: 'Part-time' },
    { value: 'internship', label: 'Internship' },
  ];

  readonly experienceLevelOptions: { value: 'entry' | 'mid' | 'senior' | 'lead'; label: string }[] = [
    { value: 'entry', label: 'Entry Level (0-2 yrs)' },
    { value: 'mid', label: 'Mid Level (3-5 yrs)' },
    { value: 'senior', label: 'Senior (5-8 yrs)' },
    { value: 'lead', label: 'Lead / Staff (8+ yrs)' },
  ];

  searchSkillResults = computed(() => {
    const q = this.skillSearchQuery().toLowerCase().trim();
    if (!q) return [];
    const userSkillNames = new Set(
      this.jobSeekerService.userSkills().map((s) => (s.skill_name || '').toLowerCase())
    );
    return this.jobSeekerService.catalogSkills().filter(
      (s) =>
        !userSkillNames.has(s.name.toLowerCase()) &&
        (s.name.toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q))
    );
  });

  ngOnInit(): void {
    this.initForms();
    this.loadExistingData();
    this.syncCompletedStepsFromData();
  }

  private initForms(): void {
    // Step 1: Personal Details
    this.step1Form = this.fb.group({
      full_name: ['', [Validators.required, trimmedRequiredValidator(), trimmedMinLengthValidator(2)]],
      phone: ['', [Validators.required, trimmedRequiredValidator(), Validators.pattern(/^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s./0-9]*$/)]],
      city: ['', [Validators.required, trimmedRequiredValidator()]],
      state: ['', [Validators.required, trimmedRequiredValidator()]],
      country: ['India', [Validators.required, trimmedRequiredValidator()]],
      location: ['', [Validators.required, trimmedRequiredValidator()]],
      avatar_url: [''],
    });

    // Step 2: Professional Details
    this.step2Form = this.fb.group({
      headline: ['', [Validators.required, trimmedRequiredValidator(), trimmedMinLengthValidator(5)]],
      bio: ['', [Validators.required, trimmedRequiredValidator(), trimmedMinLengthValidator(10)]],
      current_job_title: ['', [Validators.required, trimmedRequiredValidator()]],
      current_company: ['', [Validators.required, trimmedRequiredValidator()]],
      years_of_experience: [5, [Validators.required, Validators.min(0)]],
      availability: ['15 Days', Validators.required],
      linkedin_url: ['', [Validators.pattern(/^https?:\/\/.*/)]],
      github_url: ['', [Validators.pattern(/^https?:\/\/.*/)]],
      portfolio_url: [''],
    });

    // Step 3: Education Modal Form
    this.educationForm = this.fb.group({
      institution: ['', [Validators.required, trimmedRequiredValidator()]],
      degree: ['', [Validators.required, trimmedRequiredValidator()]],
      field_of_study: ['', [Validators.required, trimmedRequiredValidator()]],
      start_date: ['', [Validators.required, trimmedRequiredValidator()]],
      end_date: ['', [Validators.required, trimmedRequiredValidator()]],
      grade: [''],
      description: [''],
    });

    // Step 3: Experience Modal Form
    this.experienceForm = this.fb.group({
      company: ['', [Validators.required, trimmedRequiredValidator()]],
      job_title: ['', [Validators.required, trimmedRequiredValidator()]],
      employment_type: ['Full-time', Validators.required],
      location: ['', [Validators.required, trimmedRequiredValidator()]],
      start_date: ['', [Validators.required, trimmedRequiredValidator()]],
      end_date: [''],
      currently_working: [true],
      description: ['', [Validators.required, trimmedRequiredValidator()]],
    });

    // Step 4: Job Preferences Form
    this.preferencesForm = this.fb.group({
      preferred_job_title: ['', [Validators.required, trimmedRequiredValidator()]],
      preferred_location: ['', [Validators.required, trimmedRequiredValidator()]],
      remote_preference: ['hybrid', Validators.required],
      employment_type: ['full_time', Validators.required],
      min_salary: [2800000, [Validators.required, Validators.min(0)]],
      max_salary: [4500000, [Validators.required, Validators.min(0)]],
      experience_level: ['senior', Validators.required],
      willing_to_relocate: [true],
    });
  }

  private loadExistingData(): void {
    const prof = this.jobSeekerService.profile();
    const jsp = this.jobSeekerService.jobSeekerProfile();
    const pref = this.jobSeekerService.preferences();

    this.step1Form.patchValue({
      full_name: prof.full_name || '',
      phone: prof.phone || '',
      city: jsp.city || '',
      state: jsp.state || '',
      country: jsp.country || 'India',
      location: jsp.location || '',
      avatar_url: prof.avatar_url || '',
    });

    this.step2Form.patchValue({
      headline: jsp.headline || '',
      bio: jsp.bio || '',
      current_job_title: jsp.current_job_title || '',
      current_company: jsp.current_company || '',
      years_of_experience: jsp.years_of_experience ?? jsp.experience_years ?? 5,
      availability: jsp.availability || '15 Days',
      linkedin_url: jsp.linkedin_url || '',
      github_url: jsp.github_url || '',
      portfolio_url: jsp.portfolio_url || '',
    });

    this.preferencesForm.patchValue({
      preferred_job_title: pref.preferred_job_title || '',
      preferred_location: pref.preferred_location || '',
      remote_preference: pref.remote_preference || 'hybrid',
      employment_type: pref.employment_type || 'full_time',
      min_salary: pref.min_salary ?? pref.minimum_salary ?? 2800000,
      max_salary: pref.max_salary ?? pref.maximum_salary ?? 4500000,
      experience_level: pref.experience_level || 'senior',
      willing_to_relocate: pref.willing_to_relocate ?? true,
    });
  }

  // Auto-compose location string if user types city/state/country
  onCityStateChange(): void {
    const city = this.step1Form.get('city')?.value?.trim();
    const state = this.step1Form.get('state')?.value?.trim();
    const country = this.step1Form.get('country')?.value?.trim();
    const parts = [city, state, country].filter((p) => !!p);
    if (parts.length > 0 && !this.step1Form.get('location')?.dirty) {
      this.step1Form.patchValue({ location: parts.join(', ') });
    }
  }

  // Profile Photo Upload Handlers
  async onAvatarFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > 5 * 1024 * 1024) {
        this.errorMessage = 'Profile photo must be less than 5MB.';
        return;
      }
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!validTypes.includes(file.type)) {
        this.errorMessage = 'Profile photo must be a JPG, PNG, WEBP, or GIF image.';
        return;
      }

      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.step1Form.patchValue({ avatar_url: e.target.result });
      };
      reader.readAsDataURL(file);

      try {
        const uploadRes = await this.jobSeekerService.uploadAvatar(file);
        if (uploadRes?.publicUrl) {
          this.step1Form.patchValue({ avatar_url: uploadRes.publicUrl });
        }
      } catch (err) {
        // Non-blocking fallback
        console.warn('Avatar upload deferred:', err);
      }
    }
  }

  onAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.src = 'default-avatar.svg';
    }
  }

  removeAvatar(): void {
    this.step1Form.patchValue({ avatar_url: '' });
  }

  // ── Validation Helpers ──────────────────────────────────────────────

  isStep1Valid(): boolean {
    if (!this.step1Form || this.step1Form.invalid) return false;
    const v = this.step1Form.value;
    return Boolean(
      v.full_name?.trim() &&
        v.phone?.trim() &&
        v.city?.trim() &&
        v.state?.trim() &&
        v.country?.trim() &&
        v.location?.trim()
    );
  }

  isStep2Valid(): boolean {
    if (!this.step2Form || this.step2Form.invalid) return false;
    const v = this.step2Form.value;
    return Boolean(
      v.headline?.trim() &&
        v.bio?.trim() &&
        v.current_job_title?.trim() &&
        v.current_company?.trim()
    );
  }

  // Step 3 (Education & Experience) has no mandatory step-level fields;
  // records are optional and managed through their own modals.
  isStep3Valid(): boolean {
    return true;
  }

  isStep4Valid(): boolean {
    if (!this.preferencesForm || this.preferencesForm.invalid) return false;
    if (this.jobSeekerService.userSkills().length === 0) return false;
    const v = this.preferencesForm.value;
    return Boolean(v.preferred_job_title?.trim() && v.preferred_location?.trim());
  }

  isStep5Valid(): boolean {
    return this.isStep1Valid() && this.isStep2Valid() && this.isStep4Valid();
  }

  isStep6Valid(): boolean {
    return this.isStep5Valid() && this.completedSteps.has(5);
  }

  isStepCompleted(step: number): boolean {
    switch (step) {
      case 1:
        return this.completedSteps.has(1) && this.isStep1Valid();
      case 2:
        return this.isStepCompleted(1) && this.completedSteps.has(2) && this.isStep2Valid();
      case 3:
        return this.isStepCompleted(2) && this.completedSteps.has(3);
      case 4:
        return this.isStepCompleted(3) && this.completedSteps.has(4) && this.isStep4Valid();
      case 5:
        return this.isStepCompleted(4) && this.completedSteps.has(5) && this.isStep5Valid();
      case 6:
        return this.isStepCompleted(5) && this.completedSteps.has(6);
      default:
        return false;
    }
  }

  markStepCompleted(step: number): void {
    const updated = new Set(this.completedSteps);
    updated.add(step);
    this._completedSteps.set(updated);
  }

  /**
   * Reconstructs completed steps from persisted data so a refresh or
   * session restore lands the user on the first incomplete step.
   */
  private syncCompletedStepsFromData(): void {
    const completed = new Set<number>();

    if (this.isStep1Valid()) {
      completed.add(1);
    }
    if (completed.has(1) && this.isStep2Valid()) {
      completed.add(2);
      completed.add(3); // Step 3 is always valid once step 2 is done
    }
    if (completed.has(3) && this.isStep4Valid()) {
      completed.add(4);
    }
    if (completed.has(4) && this.isStep5Valid()) {
      completed.add(5);
    }

    this._completedSteps.set(completed);

    // Direct user to the first incomplete onboarding step
    if (!completed.has(1)) {
      this.currentStep = 1;
    } else if (!completed.has(2)) {
      this.currentStep = 2;
    } else if (!completed.has(3)) {
      this.currentStep = 3;
    } else if (!completed.has(4)) {
      this.currentStep = 4;
    } else {
      this.currentStep = 5;
    }
  }

  // ── Step Navigation & Protection ───────────────────────────────────

  canNavigateToStep(targetStep: number): boolean {
    if (targetStep < 1 || targetStep > this.totalSteps) return false;
    if (targetStep === this.currentStep) return true;

    // Backward navigation: allow reviewing previously completed steps
    if (targetStep < this.currentStep) {
      return this.isStepCompleted(targetStep) || targetStep === 1;
    }

    // Forward navigation: every preceding step must be genuinely completed
    for (let k = 1; k < targetStep; k++) {
      if (!this.isStepCompleted(k)) {
        return false;
      }
    }

    // Cannot skip ahead past the next step unless already completed
    return this.completedSteps.has(targetStep) || targetStep === this.currentStep + 1;
  }

  goToStep(step: number): void {
    this.errorMessage = null;

    if (!this.canNavigateToStep(step)) {
      return;
    }

    this.currentStep = step;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async nextStep(): Promise<void> {
    this.errorMessage = null;

    if (this.currentStep === 1) {
      if (!this.isStep1Valid()) {
        this.step1Form.markAllAsTouched();
        this.errorMessage = 'Please complete all required personal details.';
        return;
      }
      this.saveStepState();
      this.markStepCompleted(1);
      this.currentStep = 2;
    } else if (this.currentStep === 2) {
      if (!this.isStep2Valid()) {
        this.step2Form.markAllAsTouched();
        this.errorMessage = 'Please complete all required professional information.';
        return;
      }
      this.saveStepState();
      this.markStepCompleted(2);
      this.currentStep = 3;
    } else if (this.currentStep === 3) {
      this.saveStepState();
      this.markStepCompleted(3);
      this.currentStep = 4;
    } else if (this.currentStep === 4) {
      if (!this.isStep4Valid()) {
        this.preferencesForm.markAllAsTouched();
        this.errorMessage =
          'Please complete all required job preferences and add at least one technical skill.';
        return;
      }
      this.saveStepState();
      this.markStepCompleted(4);
      this.currentStep = 5;
    } else if (this.currentStep === 5) {
      // Step 5 (Review) is finished via finishOnboarding(), not here.
      return;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  prevStep(): void {
    this.errorMessage = null;
    if (this.currentStep > 1) {
      this.saveStepState();
      this.currentStep--;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  saveStepState(): void {
    if (this.step1Form?.valid) {
      this.jobSeekerService.updatePersonalProfile(this.step1Form.value);
    }
    if (this.step2Form?.valid) {
      this.jobSeekerService.updateProfessionalProfile(this.step2Form.value);
    }
    if (this.preferencesForm?.valid) {
      this.jobSeekerService.updatePreferences(this.preferencesForm.value);
    }
  }

  // Step 3: Education Modal & Records
  openAddEduModal(): void {
    this.editingEduId.set(null);
    this.educationForm.reset();
    this.showEduModal.set(true);
  }

  openEditEduModal(edu: Education): void {
    this.editingEduId.set(edu.id);
    this.educationForm.patchValue(edu);
    this.showEduModal.set(true);
  }

  saveEdu(): void {
    if (this.educationForm.invalid) {
      this.educationForm.markAllAsTouched();
      return;
    }
    const val = this.educationForm.value;
    if (this.editingEduId()) {
      this.jobSeekerService.updateEducation(this.editingEduId()!, val);
    } else {
      this.jobSeekerService.addEducation(val);
    }
    this.showEduModal.set(false);
  }

  deleteEdu(id: string): void {
    this.jobSeekerService.deleteEducation(id);
  }

  // Step 3: Experience Modal & Records
  openAddExpModal(): void {
    this.editingExpId.set(null);
    this.experienceForm.reset({ employment_type: 'Full-time', currently_working: true });
    this.showExpModal.set(true);
  }

  openEditExpModal(exp: Experience): void {
    this.editingExpId.set(exp.id);
    this.experienceForm.patchValue(exp);
    this.showExpModal.set(true);
  }

  saveExp(): void {
    if (this.experienceForm.invalid) {
      this.experienceForm.markAllAsTouched();
      return;
    }
    const val = { ...this.experienceForm.value };
    if (val.currently_working) {
      val.is_current = true;
      val.end_date = null;
    } else {
      val.is_current = false;
    }
    if (this.editingExpId()) {
      this.jobSeekerService.updateExperience(this.editingExpId()!, val);
    } else {
      this.jobSeekerService.addExperience(val);
    }
    this.showExpModal.set(false);
  }

  deleteExp(id: string): void {
    this.jobSeekerService.deleteExperience(id);
  }

  // Step 4: Skills Handlers
  addSkillFromCatalog(skillName: string): void {
    this.jobSeekerService.addUserSkill(skillName, this.selectedProficiency(), this.selectedSkillYoe());
    this.skillSearchQuery.set('');
  }

  addCustomSkill(): void {
    const q = this.skillSearchQuery().trim();
    if (q) {
      this.jobSeekerService.addUserSkill(q, this.selectedProficiency(), this.selectedSkillYoe());
      this.skillSearchQuery.set('');
    }
  }

  removeSkill(id?: string): void {
    if (id) {
      this.jobSeekerService.removeUserSkill(id);
    }
  }

  isSkillAlreadySelected(skillName: string): boolean {
    return this.jobSeekerService.userSkills().some((s) => (s.skill_name || '').toLowerCase() === skillName.toLowerCase());
  }

  // Step 4: Resume Handlers
  onFileDropped(event: DragEvent): void {
    event.preventDefault();
    this.resumeDragOver.set(false);
    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      this.handleResumeFile(event.dataTransfer.files[0]);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleResumeFile(input.files[0]);
    }
  }

  private async handleResumeFile(file: File): Promise<void> {
    if (file.size > 10 * 1024 * 1024) {
      this.errorMessage = 'Resume file must be less than 10MB.';
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'doc', 'docx'].includes(ext || '')) {
      this.errorMessage = 'Resume must be a PDF or Word document (.pdf, .doc, .docx).';
      return;
    }
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    try {
      await this.jobSeekerService.uploadResume(file, sizeMb);
    } catch (err: any) {
      this.errorMessage = err?.message || 'Failed to upload resume. Please try again.';
    }
  }

  setPrimaryResume(id: string): void {
    this.jobSeekerService.setPrimaryResume(id);
  }

  deleteResume(id: string): void {
    this.jobSeekerService.deleteResume(id);
  }

  // Step 4: Preferences Helpers
  selectRemotePref(value: 'hybrid' | 'remote' | 'on_site'): void {
    this.preferencesForm.patchValue({ remote_preference: value });
  }

  selectEmploymentType(value: 'full_time' | 'part_time' | 'contract' | 'internship'): void {
    this.preferencesForm.patchValue({ employment_type: value });
  }

  selectExperienceLevel(value: 'entry' | 'mid' | 'senior' | 'lead'): void {
    this.preferencesForm.patchValue({ experience_level: value });
  }

  addIndustry(): void {
    const tag = this.industryInput().trim();
    if (!tag) return;
    const current = this.jobSeekerService.preferences().preferred_industries ?? [];
    if (!current.includes(tag)) {
      this.jobSeekerService.updatePreferences({ preferred_industries: [...current, tag] });
    }
    this.industryInput.set('');
  }

  removeIndustry(tag: string): void {
    const current = this.jobSeekerService.preferences().preferred_industries ?? [];
    this.jobSeekerService.updatePreferences({
      preferred_industries: current.filter((i) => i !== tag),
    });
  }

  // Step 5: Final Submission & Complete
  async finishOnboarding(): Promise<void> {
    this.errorMessage = null;

    if (this.isSubmitting) {
      return;
    }

    if (!this.isStep1Valid() || !this.isStep2Valid() || !this.isStep4Valid()) {
      if (!this.isStep1Valid()) {
        this.step1Form.markAllAsTouched();
        this.currentStep = 1;
      } else if (!this.isStep2Valid()) {
        this.step2Form.markAllAsTouched();
        this.currentStep = 2;
      } else {
        this.preferencesForm.markAllAsTouched();
        this.currentStep = 4;
      }
      this.errorMessage = 'Please complete all required fields before finishing onboarding.';
      return;
    }
    if (this.jobSeekerService.userSkills().length === 0) {
      this.errorMessage = 'Please add at least one technical skill before completing onboarding.';
      this.currentStep = 4;
      return;
    }

    this.isSubmitting = true;

    try {
      const res = await this.jobSeekerService.submitCompleteOnboarding({
        personal: this.step1Form.value,
        professional: this.step2Form.value,
        preferences: this.preferencesForm.value,
      });

      // submitCompleteOnboarding persists every section and only marks
      // onboarding_completed = true after all writes succeed. A failed save
      // must not unlock step 6 or the dashboard.
      if (!res || !res.success) {
        this.errorMessage = res?.error || 'Failed to complete onboarding. Please try again.';
        return;
      }

      // Mark steps 5 and 6 complete only after successful, atomic persistence.
      this.markStepCompleted(5);
      this.markStepCompleted(6);
      this.currentStep = 6;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      this.errorMessage = err?.message || 'An error occurred while saving your profile. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  // Step 6: Navigation to Job Seeker Dashboard
  // Gated on the authoritative completion state; never marks onboarding
  // complete itself — that is done only by submitCompleteOnboarding.
  async goToDashboard(): Promise<void> {
    this.errorMessage = null;

    if (!this.jobSeekerService.isOnboardingCompleted()) {
      this.errorMessage =
        'Please complete all onboarding steps before opening the dashboard.';
      return;
    }

    try {
      const navSuccess = await this.router.navigate(['/job-seeker/dashboard']);
      if (!navSuccess) {
        console.warn('Navigation to /job-seeker/dashboard returned false; falling back to /job-seeker');
        await this.router.navigate(['/job-seeker']);
      }
    } catch (err: any) {
      console.error('Failed to navigate to dashboard:', err);
      this.errorMessage = 'Unable to navigate to dashboard. Please click again or reload.';
    }
  }
}
