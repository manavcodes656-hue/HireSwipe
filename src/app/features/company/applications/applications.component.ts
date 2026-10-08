import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CompanyDataService } from '../services/company-data.service';
import { Application, ApplicationStatus, Job } from '../models/company.models';

@Component({
  selector: 'app-company-applications',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './applications.component.html',
  styleUrl: './applications.component.css',
})
export class ApplicationsComponent implements OnInit, OnDestroy {
  applications: Application[] = [];
  jobs: Job[] = [];

  activeStatusFilter: ApplicationStatus | 'all' = 'all';
  selectedJobIdFilter = '';
  searchQuery = '';

  selectedApplication: Application | null = null;
  isReviewDrawerOpen = false;
  statusNotes = '';

  private subs = new Subscription();

  constructor(private dataService: CompanyDataService) {}

  ngOnInit(): void {
    this.subs.add(
      this.dataService.applications$.subscribe((aList) => {
        this.applications = aList;
        if (this.selectedApplication) {
          const updated = aList.find((a) => a.id === this.selectedApplication?.id);
          if (updated) this.selectedApplication = updated;
        }
      })
    );

    this.subs.add(
      this.dataService.jobs$.subscribe((jList) => {
        this.jobs = jList;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  get filteredApplications(): Application[] {
    return this.applications.filter((app) => {
      const matchStatus = this.activeStatusFilter === 'all' || app.status === this.activeStatusFilter;
      const matchJob = !this.selectedJobIdFilter || app.job_id === this.selectedJobIdFilter;
      const matchSearch =
        !this.searchQuery ||
        app.profile?.full_name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        app.job?.title.toLowerCase().includes(this.searchQuery.toLowerCase());

      return matchStatus && matchJob && matchSearch;
    });
  }

  setStatusFilter(status: ApplicationStatus | 'all'): void {
    this.activeStatusFilter = status;
  }

  getStatusCount(status: ApplicationStatus | 'all'): number {
    if (status === 'all') return this.applications.length;
    return this.applications.filter((a) => a.status === status).length;
  }

  openReviewDrawer(app: Application): void {
    this.selectedApplication = app;
    this.statusNotes = '';
    this.isReviewDrawerOpen = true;
  }

  closeReviewDrawer(): void {
    this.isReviewDrawerOpen = false;
  }

  updateStatus(newStatus: ApplicationStatus): void {
    if (this.selectedApplication) {
      this.dataService.updateApplicationStatus(this.selectedApplication.id, newStatus, this.statusNotes);
      this.statusNotes = '';
    }
  }

  scheduleInterviewForApp(): void {
    if (this.selectedApplication) {
      this.dataService.scheduleInterview({
        application_id: this.selectedApplication.id,
        job_id: this.selectedApplication.job_id,
        candidate_id: this.selectedApplication.profile_id,
        candidate_name: this.selectedApplication.profile?.full_name || 'Candidate',
        date: '2026-10-08',
        time: '14:00',
        duration_minutes: 45,
        meeting_link: 'https://meet.google.com/hireswipe-live-round',
        location: 'Google Meet',
        notes: 'Technical assessment round.',
      });
    }
  }
}
