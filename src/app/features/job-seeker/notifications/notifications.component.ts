import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { JobSeekerService } from '../services/job-seeker.service';
import { Notification, NotificationType } from '../models/job-seeker.models';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.css',
})
export class NotificationsComponent {
  jobSeekerService = inject(JobSeekerService);
  router = inject(Router);

  selectedFilter = signal<NotificationType | 'all'>('all');

  filterList: Array<{ label: string; value: NotificationType | 'all' }> = [
    { label: 'All Notifications', value: 'all' },
    { label: 'Matches', value: 'new_match' },
    { label: 'Applications', value: 'application_update' },
    { label: 'Messages', value: 'new_message' },
    { label: 'Interviews', value: 'interview' },
    { label: 'Recommendations', value: 'job_recommendation' },
  ];

  filteredNotifications = computed(() => {
    const f = this.selectedFilter();
    const list = this.jobSeekerService.notifications();
    if (f === 'all') return list;
    return list.filter((n) => n.type === f);
  });

  markAsRead(n: Notification) {
    this.jobSeekerService.markNotificationRead(n.id);
    if (n.link_route) {
      this.router.navigateByUrl(n.link_route);
    }
  }

  markAllAsRead() {
    this.jobSeekerService.markAllNotificationsRead();
  }
}
