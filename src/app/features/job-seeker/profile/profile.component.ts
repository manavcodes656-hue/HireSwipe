import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { JobSeekerService } from '../services/job-seeker.service';
import { Education, Experience, JobSeekerSkill } from '../models/job-seeker.models';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent {
  jobSeekerService = inject(JobSeekerService);
  fb = inject(FormBuilder);

  activeSection = signal<string>('all');
  editingSection = signal<string | null>(null);
  toastMessage = signal<string>('');

  personalForm: FormGroup = this.fb.group({
    full_name: [this.jobSeekerService.profile().full_name, Validators.required],
    phone: [this.jobSeekerService.profile().phone, Validators.required],
    location: [this.jobSeekerService.jobSeekerProfile().location, Validators.required],
    city: [this.jobSeekerService.jobSeekerProfile().city, Validators.required],
    state: [this.jobSeekerService.jobSeekerProfile().state, Validators.required],
    country: [this.jobSeekerService.jobSeekerProfile().country, Validators.required],
  });

  professionalForm: FormGroup = this.fb.group({
    headline: [this.jobSeekerService.jobSeekerProfile().headline, Validators.required],
    bio: [this.jobSeekerService.jobSeekerProfile().bio, Validators.required],
    current_job_title: [this.jobSeekerService.jobSeekerProfile().current_job_title, Validators.required],
    current_company: [this.jobSeekerService.jobSeekerProfile().current_company, Validators.required],
    years_of_experience: [this.jobSeekerService.jobSeekerProfile().years_of_experience, Validators.required],
    availability: [this.jobSeekerService.jobSeekerProfile().availability, Validators.required],
    linkedin_url: [this.jobSeekerService.jobSeekerProfile().linkedin_url],
    github_url: [this.jobSeekerService.jobSeekerProfile().github_url],
    portfolio_url: [this.jobSeekerService.jobSeekerProfile().portfolio_url],
  });

  openEditSection(sectionName: string) {
    this.editingSection.set(sectionName);
  }

  closeEditSection() {
    this.editingSection.set(null);
  }

  savePersonal() {
    if (this.personalForm.invalid) return;
    this.jobSeekerService.updatePersonalProfile(this.personalForm.value);
    this.showToast('Personal information saved!');
    this.closeEditSection();
  }

  saveProfessional() {
    if (this.professionalForm.invalid) return;
    this.jobSeekerService.updateProfessionalProfile(this.professionalForm.value);
    this.showToast('Professional details updated!');
    this.closeEditSection();
  }

  onAvatarFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const resultUrl = e.target.result as string;
        this.jobSeekerService.updatePersonalProfile({ avatar_url: resultUrl });
        this.showToast('Profile photo updated successfully!');
      };
      reader.readAsDataURL(file);
    }
  }

  showToast(msg: string) {
    this.toastMessage.set(msg);
    setTimeout(() => this.toastMessage.set(''), 3000);
  }
}
