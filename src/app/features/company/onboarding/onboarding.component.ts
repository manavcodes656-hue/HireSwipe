import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CompanyDataService } from '../services/company-data.service';
import { Company, Profile, CompanyRole } from '../models/company.models';

export function trimmedRequiredValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const val = control.value;
    if (val === null || val === undefined) return { required: true };
    if (typeof val === 'string' && val.trim().length === 0) return { required: true };
    return null;
  };
}

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

@Component({
  selector: 'app-company-onboarding',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.css',
})
export class OnboardingComponent implements OnInit, OnDestroy {
  // Zoneless app: values set after an await only re-render when they are signals.
  private readonly _currentStep = signal<number>(1);
  get currentStep(): number { return this._currentStep(); }
  set currentStep(v: number) { this._currentStep.set(v); }
  totalSteps = 6;

  private readonly _completedSteps = signal<Set<number>>(new Set<number>());
  get completedSteps(): Set<number> { return this._completedSteps(); }

  step1Form!: FormGroup;
  step2Form!: FormGroup;
  step3LogoUrl = '';
  step3BannerUrl = '';
  /** Selected logo file; uploaded to the company-logos bucket once the company exists. */
  private logoFile: File | null = null;

  // Zoneless app: values set after an await only re-render when they are signals.
  private readonly _onboardingError = signal<string>('');
  get onboardingError(): string { return this._onboardingError(); }
  set onboardingError(v: string) { this._onboardingError.set(v); }

  private readonly _isSaving = signal<boolean>(false);
  get isSaving(): boolean { return this._isSaving(); }
  set isSaving(v: boolean) { this._isSaving.set(v); }
  step4Form!: FormGroup;

  company!: Company;
  recruiterProfile!: Profile;
  completionPercentage = 0;

  // Zoneless app: values set after an await only re-render when they are signals.
  private readonly _isSubmitting = signal<boolean>(false);
  get isSubmitting(): boolean { return this._isSubmitting(); }
  set isSubmitting(v: boolean) { this._isSubmitting.set(v); }

  private readonly _errorMessage = signal<string | null>(null);
  get errorMessage(): string | null { return this._errorMessage(); }
  set errorMessage(v: string | null) { this._errorMessage.set(v); }

  private sub = new Subscription();

  industries = [
    'Software & Cloud Solutions',
    'Financial Technology (FinTech)',
    'E-Commerce & Retail Tech',
    'Artificial Intelligence & Data',
    'HealthTech & BioTech',
    'Cybersecurity',
    'EdTech & Learning',
    'Hardware & IoT',
  ];

  companySizes = ['1-10', '11-50', '51-200', '201-500', '500+'];

  recruiterRoles: { value: CompanyRole; label: string; desc: string }[] = [
    { value: 'owner', label: 'Company Owner', desc: 'Full administrative access and company ownership.' },
    { value: 'admin', label: 'Admin', desc: 'Can manage jobs, candidates, team members, and settings.' },
    { value: 'recruiter', label: 'Recruiter', desc: 'Can post jobs, manage applications, and conduct interviews.' },
    { value: 'hiring_manager', label: 'Hiring Manager', desc: 'Can review applications and interview candidates for assigned roles.' },
  ];

  constructor(
    private fb: FormBuilder,
    private dataService: CompanyDataService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const current = this.dataService.currentCompany;
    const recruiter = this.dataService.currentRecruiterProfile;

    // Use current company if present, or fallback defaults
    this.company = current ?? {
      id: '',
      name: '',
      industry: 'Software & Cloud Solutions',
      size: '11-50',
      company_size: '11-50',
      founded_year: 2022,
      website: 'https://',
      email: '',
      phone: '',
      location: '',
      city: '',
      state: '',
      country: 'India',
      description: '',
      culture: '',
      mission: '',
      values: [],
      logo_url: '',
      completion_percentage: 0,
      onboarding_completed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.recruiterProfile = recruiter ?? {
      id: '',
      email: '',
      full_name: '',
      role: 'company',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.initForms();
    this.syncCompletedStepsFromData();
    this.recalculateCompletion();

    // Subscribe to company stream in case it was loading asynchronously
    this.sub.add(
      this.dataService.company$.subscribe((c) => {
        if (c && (!this.company || !this.company.id)) {
          this.company = c;
          this.step1Form.patchValue({
            name: c.name || '',
            industry: c.industry || this.industries[0],
            size: c.size || c.company_size || '11-50',
            founded_year: c.founded_year || 2022,
            website: c.website || 'https://',
            email: c.email || '',
            phone: c.phone || '',
            location: c.location || '',
            city: c.city || '',
            state: c.state || '',
            country: c.country || 'India',
          });
          if (c.description) {
            this.step2Form.patchValue({ description: c.description });
          }
          if (c.logo_url) {
            this.step3LogoUrl = c.logo_url;
          }
          this.syncCompletedStepsFromData();
          this.recalculateCompletion();
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  private initForms(): void {
    // Step 1: Info
    this.step1Form = this.fb.group({
      name: [this.company.name || '', [Validators.required, trimmedRequiredValidator()]],
      industry: [this.company.industry || this.industries[0], [Validators.required, trimmedRequiredValidator()]],
      size: [this.company.size || this.company.company_size || '11-50', [Validators.required, trimmedRequiredValidator()]],
      founded_year: [
        this.company.founded_year || 2022,
        [Validators.required, Validators.min(1800), Validators.max(2026)],
      ],
      website: [
        this.company.website || 'https://',
        [Validators.required, trimmedRequiredValidator(), Validators.pattern(/^https?:\/\/.+/)],
      ],
      email: [this.company.email || '', [Validators.required, trimmedRequiredValidator(), Validators.email]],
      phone: [this.company.phone || '', [Validators.required, trimmedRequiredValidator()]],
      location: [this.company.location || '', [Validators.required, trimmedRequiredValidator()]],
      city: [this.company.city || '', [Validators.required, trimmedRequiredValidator()]],
      state: [this.company.state || '', [Validators.required, trimmedRequiredValidator()]],
      country: [this.company.country || 'India', [Validators.required, trimmedRequiredValidator()]],
    });

    // Step 2: Description
    this.step2Form = this.fb.group({
      description: [
        this.company.description || '',
        [Validators.required, trimmedRequiredValidator(), trimmedMinLengthValidator(20)],
      ],
      culture: [this.company.culture || ''],
      mission: [this.company.mission || ''],
      valuesInput: [(this.company.values || []).join(', ')],
    });

    // Step 3: Branding
    this.step3LogoUrl = this.company.logo_url || '';
    this.step3BannerUrl = this.company.banner_url || '';

    // Step 4: Recruiter
    this.step4Form = this.fb.group({
      full_name: [this.recruiterProfile.full_name || '', [Validators.required, trimmedRequiredValidator()]],
      role: ['owner', [Validators.required, trimmedRequiredValidator()]],
      email: [this.recruiterProfile.email || '', [Validators.required, trimmedRequiredValidator(), Validators.email]],
      phone: [this.recruiterProfile.phone || '', [Validators.required, trimmedRequiredValidator()]],
    });
  }

  // ── Validation Helpers ──────────────────────────────────────────────────

  isStep1Valid(): boolean {
    if (!this.step1Form || this.step1Form.invalid) return false;
    const v = this.step1Form.value;
    return Boolean(
      v.name?.trim() &&
      v.industry?.trim() &&
      v.size?.trim() &&
      v.founded_year &&
      v.website?.trim() &&
      v.email?.trim() &&
      v.phone?.trim() &&
      v.location?.trim() &&
      v.city?.trim() &&
      v.state?.trim() &&
      v.country?.trim()
    );
  }

  isStep2Valid(): boolean {
    if (!this.step2Form || this.step2Form.invalid) return false;
    const desc = this.step2Form.value.description;
    return typeof desc === 'string' && desc.trim().length >= 20;
  }

  isStep3Valid(): boolean {
    return true; // Branding / logo preview is valid
  }

  isStep4Valid(): boolean {
    if (!this.step4Form || this.step4Form.invalid) return false;
    const v = this.step4Form.value;
    return Boolean(
      v.full_name?.trim() &&
      v.role?.trim() &&
      v.email?.trim() &&
      v.phone?.trim()
    );
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

  private syncCompletedStepsFromData(): void {
    const completed = new Set<number>();

    if (this.isStep1Valid()) {
      completed.add(1);
    }
    if (completed.has(1) && this.isStep2Valid()) {
      completed.add(2);
    }
    if (completed.has(2)) {
      completed.add(3);
    }
    if (completed.has(3) && this.isStep4Valid()) {
      completed.add(4);
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

  // ── Step Navigation & Protection ─────────────────────────────────────────

  canNavigateToStep(targetStep: number): boolean {
    if (targetStep < 1 || targetStep > this.totalSteps) return false;
    if (targetStep === this.currentStep) return true;

    // Backward navigation: allow reviewing previously completed steps
    if (targetStep < this.currentStep) {
      return this.isStepCompleted(targetStep) || targetStep === 1;
    }

    // Forward navigation: all preceding steps must be genuinely completed and currently valid
    for (let k = 1; k < targetStep; k++) {
      if (!this.isStepCompleted(k)) {
        return false;
      }
    }

    // Target step cannot skip past the next step in line unless already completed
    return this.completedSteps.has(targetStep) || targetStep === this.currentStep + 1;
  }

  goToStep(step: number): void {
    this.errorMessage = null;
    this.onboardingError = '';

    if (!this.canNavigateToStep(step)) {
      return;
    }

    this.currentStep = step;
    this.recalculateCompletion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  recalculateCompletion(): void {
    const tempComp: Partial<Company> = {
      ...this.company,
      ...this.step1Form?.value,
      ...this.step2Form?.value,
      logo_url: this.step3LogoUrl,
    };
    this.completionPercentage = this.dataService.calculateCompanyCompletion(tempComp);
  }

  async nextStep(): Promise<void> {
    this.errorMessage = null;
    this.onboardingError = '';

    if (this.currentStep === 1) {
      if (!this.isStep1Valid()) {
        this.step1Form.markAllAsTouched();
        this.errorMessage = 'Please complete all required company details.';
        return;
      }

      this.isSaving = true;
      try {
        const companyPayload: Partial<Company> = {
          name: this.step1Form.value.name.trim(),
          industry: this.step1Form.value.industry.trim(),
          size: this.step1Form.value.size.trim(),
          company_size: this.step1Form.value.size.trim(),
          founded_year: this.step1Form.value.founded_year,
          website: this.step1Form.value.website.trim(),
          email: this.step1Form.value.email.trim(),
          phone: this.step1Form.value.phone.trim(),
          location: this.step1Form.value.location.trim(),
          city: this.step1Form.value.city.trim(),
          state: this.step1Form.value.state.trim(),
          country: this.step1Form.value.country.trim(),
        };

        const { error: ensureErr } = await this.dataService.ensureCompanyForOnboarding(companyPayload);
        if (ensureErr) {
          this.errorMessage = `Could not create company: ${ensureErr}`;
          return;
        }

        const { error: saveErr } = await this.dataService.updateCompanyProfile(companyPayload);
        if (saveErr) {
          this.errorMessage = `Could not save company details: ${saveErr}`;
          return;
        }

        this.markStepCompleted(1);
        this.currentStep = 2;
        this.recalculateCompletion();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err: any) {
        this.errorMessage = err?.message || 'Failed to save company information.';
      } finally {
        this.isSaving = false;
      }
      return;
    }

    if (this.currentStep === 2) {
      if (!this.isStep2Valid()) {
        this.step2Form.markAllAsTouched();
        this.errorMessage = 'Please provide a company description of at least 20 characters.';
        return;
      }

      this.isSaving = true;
      try {
        const desc = this.step2Form.value.description.trim();
        const { error: saveErr } = await this.dataService.updateCompanyProfile({ description: desc });
        if (saveErr) {
          this.errorMessage = `Could not save company description: ${saveErr}`;
          return;
        }

        this.markStepCompleted(2);
        this.currentStep = 3;
        this.recalculateCompletion();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err: any) {
        this.errorMessage = err?.message || 'Failed to save company description.';
      } finally {
        this.isSaving = false;
      }
      return;
    }

    if (this.currentStep === 3) {
      if (this.logoFile) {
        this.isSaving = true;
        try {
          const { error: logoErr } = await this.dataService.uploadCompanyLogo(this.logoFile);
          if (logoErr) {
            this.errorMessage = `Could not upload logo: ${logoErr}`;
            return;
          }
          this.logoFile = null;
        } catch (err: any) {
          this.errorMessage = err?.message || 'Failed to upload logo.';
          return;
        } finally {
          this.isSaving = false;
        }
      }

      this.markStepCompleted(3);
      this.currentStep = 4;
      this.recalculateCompletion();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (this.currentStep === 4) {
      if (!this.isStep4Valid()) {
        this.step4Form.markAllAsTouched();
        this.errorMessage = 'Please complete all required recruiter details.';
        return;
      }

      this.isSaving = true;
      try {
        const recruiterData = {
          full_name: this.step4Form.value.full_name.trim(),
          phone: this.step4Form.value.phone.trim(),
        };

        const { error: saveErr } = await this.dataService.updateRecruiterProfile(recruiterData);
        if (saveErr) {
          this.errorMessage = `Could not save recruiter details: ${saveErr}`;
          return;
        }

        this.markStepCompleted(4);
        this.currentStep = 5;
        this.recalculateCompletion();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err: any) {
        this.errorMessage = err?.message || 'Failed to save recruiter details.';
      } finally {
        this.isSaving = false;
      }
      return;
    }

    if (this.currentStep === 5) {
      if (!this.isStep1Valid() || !this.isStep2Valid() || !this.isStep4Valid()) {
        this.errorMessage = 'Some required fields are missing or invalid. Please review previous steps.';
        if (!this.isStep1Valid()) this.currentStep = 1;
        else if (!this.isStep2Valid()) this.currentStep = 2;
        else if (!this.isStep4Valid()) this.currentStep = 4;
        return;
      }

      this.markStepCompleted(5);
      this.currentStep = 6;
      this.recalculateCompletion();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
  }

  prevStep(): void {
    this.errorMessage = null;
    this.onboardingError = '';
    if (this.currentStep > 1) {
      this.currentStep--;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  onLogoUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.logoFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.step3LogoUrl = e.target?.result as string;
        this.recalculateCompletion();
      };
      reader.readAsDataURL(file);
    }
  }

  onBannerUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        this.step3BannerUrl = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  /**
   * Final Step 6 completion: validates all six steps, marks onboarding_completed in DB,
   * and opens the Company Dashboard.
   */
  async finishAndGoToDashboard(): Promise<void> {
    this.errorMessage = null;
    this.onboardingError = '';

    if (this.isSaving) return;

    if (!this.isStep1Valid() || !this.isStep2Valid() || !this.isStep4Valid() || !this.completedSteps.has(5)) {
      this.errorMessage = 'Please complete all previous onboarding steps before proceeding.';
      if (!this.isStep1Valid()) this.currentStep = 1;
      else if (!this.isStep2Valid()) this.currentStep = 2;
      else if (!this.isStep4Valid()) this.currentStep = 4;
      else this.currentStep = 5;
      return;
    }

    this.isSaving = true;
    try {
      await this.saveOnboarding();
    } finally {
      this.isSaving = false;
    }
  }

  async finishOnboarding(): Promise<void> {
    if (this.isSaving) return;
    if (!this.isStep1Valid() || !this.isStep2Valid() || !this.isStep4Valid()) {
      this.onboardingError = 'Some required fields are missing. Please review the previous steps.';
      this.errorMessage = 'Some required fields are missing. Please review the previous steps.';
      return;
    }
    this.isSaving = true;
    this.onboardingError = '';
    this.errorMessage = null;
    try {
      await this.saveOnboarding();
    } finally {
      this.isSaving = false;
    }
  }

  private async saveOnboarding(): Promise<void> {
    const companyFields: Partial<Company> = {
      ...this.step1Form.value,
      name: this.step1Form.value.name ? String(this.step1Form.value.name).trim() : '',
      company_size: this.step1Form.value.size,
      description: this.step2Form.value.description ? String(this.step2Form.value.description).trim() : '',
    };

    // Ensure company exists
    const { error: ensureError } = await this.dataService.ensureCompanyForOnboarding(companyFields);
    if (ensureError) return this.fail('Could not create your company', ensureError);

    // Save company profile with 100% completion
    const { error: companyError } = await this.dataService.updateCompanyProfile({
      ...companyFields,
      completion_percentage: 100,
      onboarding_completed: true,
    });
    if (companyError) return this.fail('Could not save company details', companyError);

    // Upload logo if selected
    if (this.logoFile) {
      const { error: logoError } = await this.dataService.uploadCompanyLogo(this.logoFile);
      if (logoError) return this.fail('Could not upload the logo', logoError);
    }

    // Save recruiter profile
    const { error: profileError } = await this.dataService.updateRecruiterProfile({
      full_name: this.step4Form.value.full_name ? String(this.step4Form.value.full_name).trim() : '',
      phone: this.step4Form.value.phone ? String(this.step4Form.value.phone).trim() : '',
    });
    if (profileError) return this.fail('Could not save your recruiter profile', profileError);

    // Authoritative onboarding completion flag
    const { error: flagError } = await this.dataService.setOnboardingCompleted(true);
    if (flagError) return this.fail('Could not mark onboarding as complete', flagError);

    this.markStepCompleted(6);
    await this.router.navigate(['/company/dashboard']);
  }

  private fail(step: string, error: string): void {
    console.error(`[onboarding] ${step}:`, error);
    this.onboardingError = `${step}: ${error}`;
    this.errorMessage = error;
  }
}
