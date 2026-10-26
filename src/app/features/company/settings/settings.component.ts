import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CompanyDataService } from '../services/company-data.service';
import { AuthService } from '../../../core/services/auth.service';
import { Company, Profile } from '../models/company.models';

@Component({
  selector: 'app-company-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);

  activeTab: 'general' | 'notifications' | 'security' | 'billing' | 'integrations' = 'general';

  company!: Company;
  recruiterProfile!: Profile;

  generalForm!: FormGroup;
  securityForm!: FormGroup;

  isSaving = false;
  saveSuccess = false;
  saveError = '';

  /** Local UI prefs only — no notification_preferences table in schema. */
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

  /** Display-only — third-party integrations are not backed by the schema. */
  integrations = [
    { name: 'Slack', icon: '💬', connected: false, description: 'Not connected — integration not available yet', available: false },
    { name: 'Google Calendar', icon: '📅', connected: false, description: 'Not connected — integration not available yet', available: false },
    { name: 'LinkedIn', icon: '🔗', connected: false, description: 'Not connected — integration not available yet', available: false },
    { name: 'Greenhouse', icon: '🌿', connected: false, description: 'Not connected — integration not available yet', available: false },
    { name: 'Zoom', icon: '📹', connected: false, description: 'Not connected — integration not available yet', available: false },
    { name: 'Zapier', icon: '⚡', connected: false, description: 'Not connected — integration not available yet', available: false },
  ];

  private subs = new Subscription();

  constructor(
    private fb: FormBuilder,
    private dataService: CompanyDataService
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.dataService.company$.subscribe((c) => {
        if (c) {
          this.company = c;
          this.initForms();
        }
      })
    );

    this.subs.add(
      this.dataService.recruiterProfile$.subscribe((p) => {
        if (p) {
          this.recruiterProfile = p;
        }
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
      size: [this.company.size ?? this.company.company_size, Validators.required],
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

  async saveGeneral(): Promise<void> {
    if (this.generalForm.invalid) {
      this.generalForm.markAllAsTouched();
      return;
    }
    // RLS (migration 004) allows company profile edits only for active owners
    // and admins. Fail closed so a recruiter/hiring manager never sees a fake
    // saved state when the DB updates zero rows.
    const memberRole = this.dataService.currentMemberRole;
    if (memberRole !== 'owner' && memberRole !== 'admin') {
      this.isSaving = false;
      this.saveError = 'Only company owners and admins can edit the company profile.';
      return;
    }
    this.isSaving = true;
    this.saveError = '';
    this.saveSuccess = false;
    const value = this.generalForm.value;
    const { error } = await this.dataService.updateCompanyProfile({
      ...value,
      company_size: value.size,
    });
    this.isSaving = false;
    if (error) {
      this.saveError = error;
      return;
    }
    this.saveSuccess = true;
    setTimeout(() => (this.saveSuccess = false), 3000);
  }

  saveNotifications(): void {
    this.saveSuccess = false;
    this.saveError =
      'Notification preferences are not stored yet (no preferences table in the schema). Changes were not saved.';
  }

  async changePassword(): Promise<void> {
    if (this.securityForm.invalid) {
      this.securityForm.markAllAsTouched();
      return;
    }
    const email = this.recruiterProfile?.email || this.authService.user()?.email;
    if (!email) {
      this.saveError = 'Cannot change password: no signed-in email.';
      return;
    }
    this.isSaving = true;
    this.saveError = '';
    this.saveSuccess = false;
    const { currentPassword, newPassword } = this.securityForm.value;
    const { error } = await this.authService.changePassword(email, currentPassword, newPassword);
    this.isSaving = false;
    if (error) {
      this.saveError = error;
      return;
    }
    this.saveSuccess = true;
    this.securityForm.reset();
    setTimeout(() => (this.saveSuccess = false), 3000);
  }

  toggleIntegration(integration: { connected: boolean; available?: boolean }): void {
    if (!integration.available) {
      this.saveError = 'Third-party integrations are not available in the current schema.';
      this.saveSuccess = false;
      return;
    }
    integration.connected = !integration.connected;
  }

  toggleNotif(key: keyof typeof this.notifPrefs): void {
    this.notifPrefs[key] = !this.notifPrefs[key];
  }

  get f() {
    return this.generalForm.controls;
  }
  get sf() {
    return this.securityForm.controls;
  }
}
