import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CompanyDataService } from '../services/company-data.service';
import { Company, Profile, CompanyRole } from '../models/company.models';

@Component({
  selector: 'app-company-onboarding',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.css',
})
export class OnboardingComponent implements OnInit, OnDestroy {
  currentStep = 1;
  totalSteps = 6;

  step1Form!: FormGroup;
  step2Form!: FormGroup;
  step3LogoUrl = '';
  step3BannerUrl = '';
  step4Form!: FormGroup;

  company!: Company;
  recruiterProfile!: Profile;
  completionPercentage = 0;

  isSubmitting = false;
  errorMessage: string | null = null;

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
      name: [this.company.name || '', Validators.required],
      industry: [this.company.industry || this.industries[0], Validators.required],
      size: [this.company.size || this.company.company_size || '11-50', Validators.required],
      founded_year: [this.company.founded_year || 2022, [Validators.required, Validators.min(1800), Validators.max(2026)]],
      website: [this.company.website || 'https://', [Validators.required, Validators.pattern('https?://.+')]],
      email: [this.company.email || '', [Validators.required, Validators.email]],
      phone: [this.company.phone || '', Validators.required],
      location: [this.company.location || '', Validators.required],
      city: [this.company.city || '', Validators.required],
      state: [this.company.state || '', Validators.required],
      country: [this.company.country || 'India', Validators.required],
    });

    // Step 2: Description
    this.step2Form = this.fb.group({
      description: [this.company.description || '', [Validators.required, Validators.minLength(20)]],
      culture: [this.company.culture || '', Validators.required],
      mission: [this.company.mission || '', Validators.required],
      valuesInput: [(this.company.values || []).join(', '), Validators.required],
    });

    // Step 3: Branding
    this.step3LogoUrl = this.company.logo_url || '';
    this.step3BannerUrl = this.company.banner_url || '';

    // Step 4: Recruiter
    this.step4Form = this.fb.group({
      full_name: [this.recruiterProfile.full_name || '', Validators.required],
      role: ['owner', Validators.required],
      email: [this.recruiterProfile.email || '', [Validators.required, Validators.email]],
      phone: [this.recruiterProfile.phone || '', Validators.required],
    });
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

  goToStep(step: number): void {
    if (step >= 1 && step <= this.totalSteps) {
      this.currentStep = step;
      this.recalculateCompletion();
    }
  }

  nextStep(): void {
    this.errorMessage = null;

    if (this.currentStep === 1 && this.step1Form.invalid) {
      this.step1Form.markAllAsTouched();
      return;
    }
    if (this.currentStep === 2 && this.step2Form.invalid) {
      this.step2Form.markAllAsTouched();
      return;
    }
    if (this.currentStep === 4 && this.step4Form.invalid) {
      this.step4Form.markAllAsTouched();
      return;
    }

    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
      this.recalculateCompletion();
    }
  }

  prevStep(): void {
    this.errorMessage = null;
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  onLogoUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
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

  async finishOnboarding(): Promise<void> {
    this.errorMessage = null;

    if (this.step1Form.invalid || this.step2Form.invalid || this.step4Form.invalid) {
      this.step1Form.markAllAsTouched();
      this.step2Form.markAllAsTouched();
      this.step4Form.markAllAsTouched();
      this.errorMessage = 'Please complete all required fields before completing setup.';
      return;
    }

    this.isSubmitting = true;

    try {
      const valuesArray = this.step2Form.value.valuesInput
        ? this.step2Form.value.valuesInput.split(',').map((v: string) => v.trim()).filter((v: string) => v.length > 0)
        : (this.company.values || []);

      const currentCompany = this.dataService.currentCompany;
      const companyExists = Boolean(currentCompany?.id && currentCompany.id.trim().length > 0);

      // Base profile payload matching backend allowed schema
      const companyPayload = {
        name: this.step1Form.value.name,
        industry: this.step1Form.value.industry,
        company_size: this.step1Form.value.size,
        founded_year: this.step1Form.value.founded_year,
        website: this.step1Form.value.website,
        email: this.step1Form.value.email,
        phone: this.step1Form.value.phone,
        location: this.step1Form.value.location,
        city: this.step1Form.value.city,
        state: this.step1Form.value.state,
        country: this.step1Form.value.country,
        description: this.step2Form.value.description,
        culture: this.step2Form.value.culture,
        mission: this.step2Form.value.mission,
        values: valuesArray,
        logo_url: this.step3LogoUrl,
        banner_url: this.step3BannerUrl,
      };

      if (!companyExists) {
        // Create company via POST /api/company/profile
        const createResult = await this.dataService.createCompany(companyPayload);
        if (createResult.error) {
          // If already exists under this account (409 conflict), reload and proceed to update
          if (createResult.code === 'COMPANY_EXISTS') {
            await this.dataService.reloadCompany();
            if (!this.dataService.currentCompany?.id) {
              this.errorMessage = 'Company already exists under this account, but could not load profile. Please refresh the page.';
              this.isSubmitting = false;
              return;
            }
          } else {
            this.errorMessage = createResult.error;
            this.isSubmitting = false;
            return;
          }
        }
      }

      // Update company profile and mark onboarding completed via PATCH /api/company/:companyId/profile
      const updateResult = await this.dataService.updateCompanyProfile({
        ...companyPayload,
        onboarding_completed: true,
        completion_percentage: 100,
      });

      if (updateResult.error) {
        this.errorMessage = updateResult.error;
        this.isSubmitting = false;
        return;
      }

      // Update recruiter profile
      await this.dataService.updateRecruiterProfile({
        full_name: this.step4Form.value.full_name,
        email: this.step4Form.value.email,
        phone: this.step4Form.value.phone,
      });

      this.dataService.setOnboardingCompleted(true);
      this.currentStep = 6;
      this.recalculateCompletion();
      this.router.navigate(['/company/dashboard']);
    } catch (err: any) {
      this.errorMessage = err?.message || 'An unexpected error occurred while completing onboarding.';
    } finally {
      this.isSubmitting = false;
    }
  }
}
