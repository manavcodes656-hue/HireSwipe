import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { CompanyDataService } from '../services/company-data.service';
import { Company, Profile, Notification } from '../models/company.models';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-company-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './company-layout.component.html',
  styleUrl: './company-layout.component.css',
})
export class CompanyLayoutComponent implements OnInit, OnDestroy {
  company: Company | null = null;
  recruiterProfile: Profile | null = null;
  notifications: Notification[] = [];
  unreadNotifCount = 0;
  pendingAppsCount = 0;
  unreadMsgCount = 0;

  isProfileMenuOpen = false;
  isNotifMenuOpen = false;
  isMobileMenuOpen = false;

  private subs = new Subscription();

  constructor(
    private dataService: CompanyDataService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const userId = this.authService.getCurrentUserId();
    if (userId) {
      this.dataService.initialize(userId);
    }

    this.subs.add(
      this.dataService.company$.subscribe((c) => {
        this.company = c;
      })
    );

    this.subs.add(
      this.dataService.recruiterProfile$.subscribe((p) => {
        this.recruiterProfile = p;
      })
    );

    this.subs.add(
      this.dataService.notifications$.subscribe((nList) => {
        this.notifications = nList;
        this.unreadNotifCount = nList.filter((n) => !n.is_read).length;
      })
    );

    this.subs.add(
      this.dataService.applications$.subscribe((apps) => {
        this.pendingAppsCount = apps.filter((a) => a.status === 'pending' || a.status === 'reviewing').length;
      })
    );

    this.subs.add(
      this.dataService.conversations$.subscribe((convs) => {
        this.unreadMsgCount = convs.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  toggleProfileMenu(): void {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
    if (this.isProfileMenuOpen) this.isNotifMenuOpen = false;
  }

  toggleNotifMenu(): void {
    this.isNotifMenuOpen = !this.isNotifMenuOpen;
    if (this.isNotifMenuOpen) this.isProfileMenuOpen = false;
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  markAllRead(): void {
    this.dataService.markAllNotificationsRead();
  }

  markNotifRead(notif: Notification, event: Event): void {
    event.stopPropagation();
    this.dataService.markNotificationRead(notif.id);
    if (notif.link) {
      this.isNotifMenuOpen = false;
      this.router.navigateByUrl(notif.link);
    }
  }

  async logout(): Promise<void> {
    this.isProfileMenuOpen = false;
    await this.authService.signOut();
    this.router.navigate(['/login']);
  }
}
