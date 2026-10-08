import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.css',
})
export class OnboardingComponent implements OnInit {
  jobSeekerService = inject(JobSeekerService);
  fb = inject(FormBuilder);
  router = inject(Router);

  currentStep = signal(1); // 1 to 8
  totalSteps = 8;
  submittedStep = signal(false);
  saveSuccessMessage = signal('');

  // Step 1: Personal
  personalForm!: FormGroup;

  // Step 2: Professional
  professionalForm!: FormGroup;

  // Step 3: Education Modal/Form
  educationForm!: FormGroup;
  editingEduId = signal<string | null>(null);
  showEduModal = signal(false);

  // Step 4: Experience Modal/Form
  experienceForm!: FormGroup;
  editingExpId = signal<string | null>(null);
  showExpModal = signal(false);

  // Step 5: Skills & Popular skills
  skillSearchQuery = signal('');
  selectedProficiency = signal<ProficiencyLevel>('advanced');
  selectedSkillYoe = signal<number>(3);

  // Static popular skills list that NEVER changes during search
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

  // Dynamic search results dropdown items
  searchSkillResults = computed(() => {
    const q = this.skillSearchQuery().toLowerCase().trim();
    if (!q) return [];
    const userSkillNames = new Set(this.jobSeekerService.userSkills().map((s) => s.skill_name.toLowerCase()));
    return this.jobSeekerService.catalogSkills().filter(
      (s) => !userSkillNames.has(s.name.toLowerCase()) && (s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
    );
  });

  // Step 6: Resume Mock Upload
  resumeDragOver = signal(false);

  // Step 7: Preferences
  preferencesForm!: FormGroup;
  industryInput = signal('');

  stepTitles = [
    'Personal Information',
    'Professional Information',
    'Education History',
    'Work Experience',
    'Skills & Expertise',
    'Resume Upload',
    'Job Preferences',
    'Review Profile',
  ];

  stepSubtitles = [
    'Tell us your name, contact details, profile photo, and location.',
    'Highlight your professional headline, bio, and online portfolios.',
    'Add your academic background and qualifications.',
    'List your work experience, roles, and achievements.',
    'Tag your core engineering skills and proficiency levels.',
    'Upload your CV or resume PDF.',
    'Specify your ideal job titles, location, and salary expectations.',
    'Review your complete profile before launching into discovery!',
  ];

  ngOnInit(): void {
    this.initForms();
    this.loadExistingData();
  }

  private initForms() {
    this.personalForm = this.fb.group({
      full_name: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.required, Validators.pattern(/^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s./0-9]*$/)]],
      location: ['', Validators.required],
      city: ['', Validators.required],
      state: ['', Validators.required],
      country: ['India', Validators.required],
      avatar_url: ['https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80'],
    });

    this.professionalForm = this.fb.group({
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

    this.educationForm = this.fb.group({
      institution: ['', Validators.required],
      degree: ['', Validators.required],
      field_of_study: ['', Validators.required],
      start_date: ['', Validators.required],
      end_date: ['', Validators.required],
      grade: [''],
      description: [''],
    });

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

  private loadExistingData() {
    const prof = this.jobSeekerService.profile();
    const jsp = this.jobSeekerService.jobSeekerProfile();
    const pref = this.jobSeekerService.preferences();

    this.personalForm.patchValue({
      full_name: prof.full_name,
      phone: prof.phone,
      location: jsp.location,
      city: jsp.city,
      state: jsp.state,
      country: jsp.country,
      avatar_url: prof.avatar_url,
    });

    this.professionalForm.patchValue({
      headline: jsp.headline,
      bio: jsp.bio,
      current_job_title: jsp.current_job_title,
      current_company: jsp.current_company,
      years_of_experience: jsp.years_of_experience,
      availability: jsp.availability,
      linkedin_url: jsp.linkedin_url,
      github_url: jsp.github_url,
      portfolio_url: jsp.portfolio_url,
    });

    this.preferencesForm.patchValue({
      preferred_job_title: pref.preferred_job_title,
      preferred_location: pref.preferred_location,
      remote_preference: pref.remote_preference,
      employment_type: pref.employment_type,
      min_salary: pref.min_salary,
      max_salary: pref.max_salary,
      experience_level: pref.experience_level,
      willing_to_relocate: pref.willing_to_relocate,
    });
  }

  // Profile Photo Upload Handlers (Step 1)
  onAvatarFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.personalForm.patchValue({ avatar_url: e.target.result });
        this.jobSeekerService.updatePersonalProfile({ avatar_url: e.target.result });
      };
      reader.readAsDataURL(file);
    }
  }

  selectPresetAvatar(url: string) {
    this.personalForm.patchValue({ avatar_url: url });
    this.jobSeekerService.updatePersonalProfile({ avatar_url: url });
  }

  removeAvatar() {
    this.personalForm.patchValue({ avatar_url: '' });
    this.jobSeekerService.updatePersonalProfile({ avatar_url: '' });
  }

  // Navigation between steps
  goToStep(step: number) {
    if (step >= 1 && step <= this.totalSteps) {
      this.saveCurrentStepState();
      this.currentStep.set(step);
      this.submittedStep.set(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  nextStep() {
    this.submittedStep.set(true);

    if (this.currentStep() === 1 && this.personalForm.invalid) {
      this.personalForm.markAllAsTouched();
      return;
    }

    if (this.currentStep() === 2 && this.professionalForm.invalid) {
      this.professionalForm.markAllAsTouched();
      return;
    }

    if (this.currentStep() === 7 && this.preferencesForm.invalid) {
      this.preferencesForm.markAllAsTouched();
      return;
    }

    this.saveCurrentStepState();

    if (this.currentStep() < this.totalSteps) {
      this.currentStep.update((s) => s + 1);
      this.submittedStep.set(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  prevStep() {
    if (this.currentStep() > 1) {
      this.saveCurrentStepState();
      this.currentStep.update((s) => s - 1);
      this.submittedStep.set(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  saveCurrentStepState() {
    if (this.currentStep() === 1 && this.personalForm.valid) {
      this.jobSeekerService.updatePersonalProfile(this.personalForm.value);
    } else if (this.currentStep() === 2 && this.professionalForm.valid) {
      this.jobSeekerService.updateProfessionalProfile(this.professionalForm.value);
    } else if (this.currentStep() === 7 && this.preferencesForm.valid) {
      this.jobSeekerService.updatePreferences(this.preferencesForm.value);
    }
    this.showTransientSuccess('Progress auto-saved.');
  }

  showTransientSuccess(msg: string) {
    this.saveSuccessMessage.set(msg);
    setTimeout(() => this.saveSuccessMessage.set(''), 2500);
  }

  // Step 3: Education handlers
  openAddEduModal() {
    this.editingEduId.set(null);
    this.educationForm.reset();
    this.showEduModal.set(true);
  }

  openEditEduModal(edu: Education) {
    this.editingEduId.set(edu.id);
    this.educationForm.patchValue(edu);
    this.showEduModal.set(true);
  }

  saveEdu() {
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

  deleteEdu(id: string) {
    this.jobSeekerService.deleteEducation(id);
  }

  // Step 4: Experience handlers
  openAddExpModal() {
    this.editingExpId.set(null);
    this.experienceForm.reset({ employment_type: 'Full-time', currently_working: true });
    this.showExpModal.set(true);
  }

  openEditExpModal(exp: Experience) {
    this.editingExpId.set(exp.id);
    this.experienceForm.patchValue(exp);
    this.showExpModal.set(true);
  }

  saveExp() {
    if (this.experienceForm.invalid) {
      this.experienceForm.markAllAsTouched();
      return;
    }
    const val = this.experienceForm.value;
    if (val.currently_working) {
      val.end_date = 'Present';
    }
    if (this.editingExpId()) {
      this.jobSeekerService.updateExperience(this.editingExpId()!, val);
    } else {
      this.jobSeekerService.addExperience(val);
    }
    this.showExpModal.set(false);
  }

  deleteExp(id: string) {
    this.jobSeekerService.deleteExperience(id);
  }

  // Step 5: Skills Handlers
  addSkillFromCatalog(skillName: string) {
    this.jobSeekerService.addUserSkill(skillName, this.selectedProficiency(), this.selectedSkillYoe());
    this.skillSearchQuery.set('');
  }

  addCustomSkill() {
    const q = this.skillSearchQuery().trim();
    if (q) {
      this.jobSeekerService.addUserSkill(q, this.selectedProficiency(), this.selectedSkillYoe());
      this.skillSearchQuery.set('');
    }
  }

  removeSkill(id: string) {
    this.jobSeekerService.removeUserSkill(id);
  }

  isSkillAlreadySelected(skillName: string): boolean {
    return this.jobSeekerService.userSkills().some((s) => s.skill_name.toLowerCase() === skillName.toLowerCase());
  }

  // Step 6: Resume Upload Simulation
  onFileDropped(event: Event) {
    event.preventDefault();
    this.resumeDragOver.set(false);
    this.simulateResumeUpload('Krish_Sharma_Senior_CV_2026.pdf', '2.6 MB');
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
      this.simulateResumeUpload(file.name, sizeMb);
    }
  }

  simulateResumeUpload(name: string, size: string) {
    this.jobSeekerService.uploadResume(name, size);
    this.showTransientSuccess(`Uploaded ${name}`);
  }

  setPrimaryResume(id: string) {
    this.jobSeekerService.setPrimaryResume(id);
  }

  deleteResume(id: string) {
    this.jobSeekerService.deleteResume(id);
  }

  // Step 7: Preferences choice cards helpers
  selectRemotePref(value: 'hybrid' | 'remote' | 'on_site' | 'any') {
    this.preferencesForm.patchValue({ remote_preference: value });
  }

  selectEmploymentType(value: 'full_time' | 'part_time' | 'contract' | 'internship') {
    this.preferencesForm.patchValue({ employment_type: value });
  }

  selectExperienceLevel(value: 'entry' | 'mid' | 'senior' | 'lead' | 'executive') {
    this.preferencesForm.patchValue({ experience_level: value });
  }

  addIndustry() {
    const tag = this.industryInput().trim();
    if (!tag) return;
    const current = this.jobSeekerService.preferences().preferred_industries;
    if (!current.includes(tag)) {
      this.jobSeekerService.updatePreferences({ preferred_industries: [...current, tag] });
    }
    this.industryInput.set('');
  }

  removeIndustry(tag: string) {
    const current = this.jobSeekerService.preferences().preferred_industries;
    this.jobSeekerService.updatePreferences({
      preferred_industries: current.filter((i) => i !== tag),
    });
  }

  // Step 8: Complete Onboarding
  completeOnboarding() {
    this.saveCurrentStepState();
    this.jobSeekerService.completeOnboarding();
    this.router.navigate(['/job-seeker/dashboard']);
  }
}
