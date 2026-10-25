import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { JobSeekerService } from '../services/job-seeker.service';
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

  currentStep = 1;
  totalSteps = 6;

  isSubmitting = false;
  errorMessage: string | null = null;
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
  }

  private initForms(): void {
    // Step 1: Personal Details
    this.step1Form = this.fb.group({
      full_name: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.required, Validators.pattern(/^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s./0-9]*$/)]],
      city: ['', Validators.required],
      state: ['', Validators.required],
      country: ['India', Validators.required],
      location: ['', Validators.required],
      avatar_url: [''],
    });

    // Step 2: Professional Details
    this.step2Form = this.fb.group({
      headline: ['', [Validators.required, Validators.minLength(5)]],
      bio: ['', [Validators.required, Validators.minLength(10)]],
      current_job_title: ['', Validators.required],
      current_company: ['', Validators.required],
      years_of_experience: [5, [Validators.required, Validators.min(0)]],
      availability: ['15 Days', Validators.required],
      linkedin_url: ['', [Validators.pattern(/^https?:\/\/.*/)]],
      github_url: ['', [Validators.pattern(/^https?:\/\/.*/)]],
      portfolio_url: [''],
    });

    // Step 3: Education Modal Form
    this.educationForm = this.fb.group({
      institution: ['', Validators.required],
      degree: ['', Validators.required],
      field_of_study: ['', Validators.required],
      start_date: ['', Validators.required],
      end_date: ['', Validators.required],
      grade: [''],
      description: [''],
    });

    // Step 3: Experience Modal Form
    this.experienceForm = this.fb.group({
      company: ['', Validators.required],
      job_title: ['', Validators.required],
      employment_type: ['Full-time', Validators.required],
      location: ['', Validators.required],
      start_date: ['', Validators.required],
      end_date: [''],
      currently_working: [true],
      description: ['', Validators.required],
    });

    // Step 4: Job Preferences Form
    this.preferencesForm = this.fb.group({
      preferred_job_title: ['', Validators.required],
      preferred_location: ['', Validators.required],
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

  // Stepper Navigation
  goToStep(step: number): void {
    if (step >= 1 && step <= this.totalSteps) {
      this.saveStepState();
      this.currentStep = step;
      this.errorMessage = null;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  nextStep(): void {
    this.errorMessage = null;

    if (this.currentStep === 1) {
      if (this.step1Form.invalid) {
        this.step1Form.markAllAsTouched();
        this.errorMessage = 'Please complete all required personal details.';
        return;
      }
    } else if (this.currentStep === 2) {
      if (this.step2Form.invalid) {
        this.step2Form.markAllAsTouched();
        this.errorMessage = 'Please complete all required professional information.';
        return;
      }
    } else if (this.currentStep === 4) {
      if (this.preferencesForm.invalid) {
        this.preferencesForm.markAllAsTouched();
        this.errorMessage = 'Please complete all required job preferences.';
        return;
      }
      if (this.jobSeekerService.userSkills().length === 0) {
        this.errorMessage = 'Please add at least one technical skill to your profile.';
        return;
      }
    }

    this.saveStepState();

    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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

    if (this.step1Form.invalid) {
      this.step1Form.markAllAsTouched();
      this.errorMessage = 'Please complete all required personal details.';
      this.currentStep = 1;
      return;
    }
    if (this.step2Form.invalid) {
      this.step2Form.markAllAsTouched();
      this.errorMessage = 'Please complete all required professional information.';
      this.currentStep = 2;
      return;
    }
    if (this.preferencesForm.invalid) {
      this.preferencesForm.markAllAsTouched();
      this.errorMessage = 'Please complete all required job preferences.';
      this.currentStep = 4;
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

      if (res && res.error) {
        this.errorMessage = res.error;
        return;
      }

      // Advance to celebration step only after all saves succeed
      this.currentStep = 6;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      this.errorMessage = err?.message || 'An error occurred while saving your profile. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  // Step 6: Direct navigation to Job Seeker Dashboard
  async goToDashboard(): Promise<void> {
    this.errorMessage = null;
    try {
      this.jobSeekerService.setOnboardingCompleted(true);
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
