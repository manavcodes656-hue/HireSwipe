import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CompanyDataService } from '../services/company-data.service';
import { Company, Profile, CompanyRole } from '../models/company.models';

@Component({
  selector: 'app-company-onboarding',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.css',
})
export class OnboardingComponent implements OnInit {
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
    this.company = this.dataService.currentCompany;
    this.recruiterProfile = this.dataService.currentRecruiterProfile;

    this.initForms();
    this.recalculateCompletion();
  }

  private initForms(): void {
    // Step 1: Info
    this.step1Form = this.fb.group({
      name: [this.company.name, Validators.required],
      industry: [this.company.industry, Validators.required],
      size: [this.company.size, Validators.required],
      founded_year: [this.company.founded_year, [Validators.required, Validators.min(1800), Validators.max(2026)]],
      website: [this.company.website, [Validators.required, Validators.pattern('https?://.+')]],
      email: [this.company.email, [Validators.required, Validators.email]],
      phone: [this.company.phone, Validators.required],
      location: [this.company.location, Validators.required],
      city: [this.company.city, Validators.required],
      state: [this.company.state, Validators.required],
      country: [this.company.country, Validators.required],
    });

    // Step 2: Description
    this.step2Form = this.fb.group({
      description: [this.company.description, [Validators.required, Validators.minLength(20)]],
      culture: [this.company.culture, Validators.required],
      mission: [this.company.mission, Validators.required],
      valuesInput: [this.company.values.join(', '), Validators.required],
    });

    // Step 3: Branding
    this.step3LogoUrl = this.company.logo_url;
    this.step3BannerUrl = this.company.banner_url || '';

    // Step 4: Recruiter
    this.step4Form = this.fb.group({
      full_name: [this.recruiterProfile.full_name, Validators.required],
      role: ['owner', Validators.required],
      email: [this.recruiterProfile.email, [Validators.required, Validators.email]],
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

  finishOnboarding(): void {
    const valuesArray = this.step2Form.value.valuesInput
      ? this.step2Form.value.valuesInput.split(',').map((v: string) => v.trim()).filter((v: string) => v.length > 0)
      : this.company.values;

    this.dataService.updateCompanyProfile({
      ...this.step1Form.value,
      description: this.step2Form.value.description,
      culture: this.step2Form.value.culture,
      mission: this.step2Form.value.mission,
      values: valuesArray,
      logo_url: this.step3LogoUrl,
      banner_url: this.step3BannerUrl,
    });

    this.dataService.updateRecruiterProfile({
      full_name: this.step4Form.value.full_name,
      email: this.step4Form.value.email,
      phone: this.step4Form.value.phone,
    });

    this.router.navigate(['/company/dashboard']);
  }
}
