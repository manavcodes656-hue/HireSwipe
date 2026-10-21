import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { JobSeekerService } from '../services/job-seeker.service';
import { Application, ApplicationStatus } from '../models/job-seeker.models';

@Component({
  selector: 'app-applications',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './applications.component.html',
  styleUrl: './applications.component.css',
})
export class ApplicationsComponent {
  jobSeekerService = inject(JobSeekerService);

  selectedStatus = signal<ApplicationStatus | 'all'>('all');
  selectedAppForModal = signal<Application | null>(null);

  statusList: Array<{ label: string; value: ApplicationStatus | 'all' }> = [
    { label: 'All Applications', value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'Reviewing', value: 'reviewing' },
    { label: 'Shortlisted', value: 'shortlisted' },
    { label: 'Interview', value: 'interview' },
    { label: 'Accepted', value: 'accepted' },
    { label: 'Rejected', value: 'rejected' },
    { label: 'Withdrawn', value: 'withdrawn' },
  ];

  filteredApplications = computed(() => {
    const status = this.selectedStatus();
    const list = this.jobSeekerService.applications();
    if (status === 'all') return list;
    return list.filter((a) => a.status === status);
  });

  openDetailsModal(app: Application) {
    this.selectedAppForModal.set(app);
  }

  closeModal() {
    this.selectedAppForModal.set(null);
  }

  withdrawApplication(appId: string) {
    if (confirm('Are you sure you want to withdraw this application?')) {
      this.jobSeekerService.withdrawApplication(appId);
      this.closeModal();
    }
  }
}
