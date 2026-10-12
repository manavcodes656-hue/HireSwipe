import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterOutlet, RouterLinkActive } from '@angular/router';
import { JobSeekerService } from '../services/job-seeker.service';

import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-job-seeker-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './job-seeker-layout.component.html',
  styleUrl: './job-seeker-layout.component.css',
})
export class JobSeekerLayoutComponent {
  jobSeekerService = inject(JobSeekerService);
  authService = inject(AuthService);
  router = inject(Router);

  sidebarCollapsed = signal(false);
  mobileMenuOpen = signal(false);
  isProfileMenuOpen = signal(false);
  isNotifMenuOpen = signal(false);

  constructor() {
    const userId = this.authService.getCurrentUserId();
    if (userId) {
      this.jobSeekerService.initialize(userId);
    }
  }

  toggleSidebar() {
    this.sidebarCollapsed.update((v) => !v);
  }

  toggleMobileMenu() {
    this.mobileMenuOpen.update((v) => !v);
  }

  closeMobileMenu() {
    this.mobileMenuOpen.set(false);
  }

  toggleProfileMenu() {
    this.isProfileMenuOpen.update((v) => !v);
    if (this.isProfileMenuOpen()) this.isNotifMenuOpen.set(false);
  }

  toggleNotifMenu() {
    this.isNotifMenuOpen.update((v) => !v);
    if (this.isNotifMenuOpen()) this.isProfileMenuOpen.set(false);
  }

  async logout() {
    this.isProfileMenuOpen.set(false);
    await this.authService.signOut();
    this.router.navigate(['/login']);
  }
}
