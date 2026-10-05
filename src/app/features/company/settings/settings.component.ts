import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CompanyDataService } from '../services/company-data.service';
import { Company, Profile } from '../models/company.models';

@Component({
  selector: 'app-company-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent implements OnInit, OnDestroy {
  activeTab: 'general' | 'notifications' | 'security' | 'billing' | 'integrations' = 'general';

  company!: Company;
  recruiterProfile!: Profile;

  generalForm!: FormGroup;
  securityForm!: FormGroup;

  isSaving = false;
  saveSuccess = false;
  saveError = '';

  notifPrefs = {
    new_application: true,
    new_match: true,
    message_received: true,
    interview_reminder: true,
    job_expiry: true,
    team_updates: false,
    weekly_digest: true,
    marketing: false,
  };

  currentPlan = 'Professional';
  billingCycle = 'Monthly';
  nextBillingDate = '2026-11-05';
  seats = 5;
  usedSeats = 3;

  integrations = [
    { name: 'Slack', icon: '💬', connected: true, description: 'Get notifications in your Slack workspace' },
    { name: 'Google Calendar', icon: '📅', connected: true, description: 'Sync interviews with Google Calendar' },
    { name: 'LinkedIn', icon: '🔗', connected: false, description: 'Post jobs directly to LinkedIn' },
    { name: 'Greenhouse', icon: '🌿', connected: false, description: 'Sync candidates with Greenhouse ATS' },
    { name: 'Zoom', icon: '📹', connected: true, description: 'Auto-generate Zoom links for interviews' },
    { name: 'Zapier', icon: '⚡', connected: false, description: 'Connect HireSwipe with 5000+ apps' },
  ];

  private subs = new Subscription();

  constructor(
    private fb: FormBuilder,
    private dataService: CompanyDataService
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.dataService.company$.subscribe((c) => {
        this.company = c;
        this.initForms();
      })
    );

    this.subs.add(
      this.dataService.recruiterProfile$.subscribe((p) => {
        this.recruiterProfile = p;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private initForms(): void {
    this.generalForm = this.fb.group({
      name: [this.company.name, Validators.required],
      industry: [this.company.industry, Validators.required],
      size: [this.company.size, Validators.required],
      website: [this.company.website, [Validators.required, Validators.pattern('https?://.+')]],
      email: [this.company.email, [Validators.required, Validators.email]],
      phone: [this.company.phone, Validators.required],
      location: [this.company.location, Validators.required],
      city: [this.company.city, Validators.required],
      state: [this.company.state, Validators.required],
      country: [this.company.country, Validators.required],
    });

    this.securityForm = this.fb.group(
      {
        currentPassword: ['', Validators.required],
        newPassword: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', Validators.required],
      },
      { validators: this.passwordMatchValidator }
    );
  }

  private passwordMatchValidator(group: FormGroup): { [key: string]: boolean } | null {
    const newPass = group.get('newPassword')?.value;
    const confirmPass = group.get('confirmPassword')?.value;
    return newPass === confirmPass ? null : { passwordMismatch: true };
  }

  setTab(tab: typeof this.activeTab): void {
    this.activeTab = tab;
    this.saveSuccess = false;
    this.saveError = '';
  }

  saveGeneral(): void {
    if (this.generalForm.invalid) {
      this.generalForm.markAllAsTouched();
      return;
    }
    this.isSaving = true;
    setTimeout(() => {
      this.dataService.updateCompanyProfile(this.generalForm.value);
      this.isSaving = false;
      this.saveSuccess = true;
      setTimeout(() => (this.saveSuccess = false), 3000);
    }, 800);
  }

  saveNotifications(): void {
    this.isSaving = true;
    setTimeout(() => {
      this.isSaving = false;
      this.saveSuccess = true;
      setTimeout(() => (this.saveSuccess = false), 3000);
    }, 600);
  }

  changePassword(): void {
    if (this.securityForm.invalid) {
      this.securityForm.markAllAsTouched();
      return;
    }
    this.isSaving = true;
    setTimeout(() => {
      this.isSaving = false;
      this.saveSuccess = true;
      this.securityForm.reset();
      setTimeout(() => (this.saveSuccess = false), 3000);
    }, 800);
  }

  toggleIntegration(integration: { connected: boolean }): void {
    integration.connected = !integration.connected;
  }

  toggleNotif(key: keyof typeof this.notifPrefs): void {
    this.notifPrefs[key] = !this.notifPrefs[key];
  }

  get f() { return this.generalForm.controls; }
  get sf() { return this.securityForm.controls; }
}
