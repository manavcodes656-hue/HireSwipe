import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CompanyDataService } from '../services/company-data.service';
import { Company } from '../models/company.models';

@Component({
  selector: 'app-company-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent implements OnInit, OnDestroy {
  company!: Company;
  profileForm!: FormGroup;
  isSavedToast = false;
  private subs = new Subscription();

  constructor(
    private dataService: CompanyDataService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.dataService.company$.subscribe((c) => {
        this.company = c;
        this.initForm(c);
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private initForm(c: Company): void {
    this.profileForm = this.fb.group({
      name: [c.name, Validators.required],
      industry: [c.industry, Validators.required],
      size: [c.size, Validators.required],
      founded_year: [c.founded_year, Validators.required],
      website: [c.website, Validators.required],
      email: [c.email, [Validators.required, Validators.email]],
      phone: [c.phone, Validators.required],
      location: [c.location, Validators.required],
      city: [c.city, Validators.required],
      state: [c.state, Validators.required],
      country: [c.country, Validators.required],
      description: [c.description, Validators.required],
      culture: [c.culture, Validators.required],
      mission: [c.mission, Validators.required],
      valuesInput: [c.values ? c.values.join(', ') : ''],
      logo_url: [c.logo_url],
      banner_url: [c.banner_url || ''],
    });
  }

  onLogoFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const logoDataUrl = e.target.result as string;
        this.profileForm.patchValue({ logo_url: logoDataUrl });
        if (this.company) {
          this.company = { ...this.company, logo_url: logoDataUrl };
        }
      };
      reader.readAsDataURL(file);
    }
  }

  removeLogo(): void {
    this.profileForm.patchValue({ logo_url: '' });
    if (this.company) {
      this.company = { ...this.company, logo_url: '' };
    }
  }

  saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const val = this.profileForm.value;
    const valuesArray = val.valuesInput
      ? val.valuesInput.split(',').map((v: string) => v.trim()).filter((v: string) => v.length > 0)
      : this.company.values;

    this.dataService.updateCompanyProfile({
      ...val,
      values: valuesArray,
    });

    this.isSavedToast = true;
    setTimeout(() => {
      this.isSavedToast = false;
    }, 3000);
  }
}
