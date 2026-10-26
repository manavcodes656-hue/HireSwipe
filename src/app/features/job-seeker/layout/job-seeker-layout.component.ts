import { Component, inject, signal, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterOutlet, RouterLinkActive } from '@angular/router';
import { JobSeekerService } from '../services/job-seeker.service';
import { AuthService } from '../../../core/services/auth.service';
import { Notification } from '../models/job-seeker.models';

@Component({
  selector: 'app-job-seeker-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './job-seeker-layout.component.html',
  styleUrl: './job-seeker-layout.component.css',
})
export class JobSeekerLayoutComponent {
  @ViewChild('notifWrapper') notifWrapper?: ElementRef;
  @ViewChild('profileWrapper') profileWrapper?: ElementRef;

  jobSeekerService = inject(JobSeekerService);
  authService = inject(AuthService);
  router = inject(Router);

  sidebarCollapsed = signal(false);
  mobileMenuOpen = signal(false);
  isProfileMenuOpen = signal(false);
  isNotifMenuOpen = signal(false);
  avatarError = signal(false);

  get userInitials(): string {
    const name = this.jobSeekerService.profile().full_name || 'JS';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  onAvatarError(): void {
    this.avatarError.set(true);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node;
    if (this.isNotifMenuOpen() && this.notifWrapper && !this.notifWrapper.nativeElement.contains(target)) {
      this.isNotifMenuOpen.set(false);
    }
    if (this.isProfileMenuOpen() && this.profileWrapper && !this.profileWrapper.nativeElement.contains(target)) {
      this.isProfileMenuOpen.set(false);
    }
  }

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

  markNotifRead(n: Notification, event: MouseEvent) {
    event.stopPropagation();
    this.jobSeekerService.markNotificationRead(n.id);
    this.isNotifMenuOpen.set(false);
    if (n.link_route) {
      this.router.navigateByUrl(n.link_route);
    }
  }

  markAllRead() {
    this.jobSeekerService.markAllNotificationsRead();
  }

  async logout() {
    this.isProfileMenuOpen.set(false);
    await this.authService.signOut();
    this.router.navigate(['/login']);
  }
}

