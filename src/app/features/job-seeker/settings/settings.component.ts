import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { JobSeekerService } from '../services/job-seeker.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent {
  jobSeekerService = inject(JobSeekerService);
  router = inject(Router);

  // Settings State
  profilePublic = signal(true);
  hideCurrentEmployer = signal(true);
  searchIndexable = signal(false);

  emailAlerts = signal(true);
  pushNotifs = signal(true);
  weeklyDigest = signal(true);
  matchSMS = signal(false);

  toastMsg = signal('');

  saveSettings() {
    this.toastMsg.set('Settings saved successfully.');
    setTimeout(() => this.toastMsg.set(''), 3000);
  }

  exportData() {
    alert('Exporting full candidate data payload as JSON file...');
  }

  logout() {
    this.router.navigate(['/login']);
  }
}
