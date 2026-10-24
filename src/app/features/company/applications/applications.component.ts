import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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

  statusError = '';

  constructor(
    private dataService: CompanyDataService,
    private router: Router
  ) {}

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
        (app.profile?.full_name || '').toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        (app.job?.title || '').toLowerCase().includes(this.searchQuery.toLowerCase());

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

  async updateStatus(newStatus: ApplicationStatus): Promise<void> {
    if (this.selectedApplication) {
      this.statusError = '';
      const { error } = await this.dataService.updateApplicationStatus(
        this.selectedApplication.id,
        newStatus,
        this.statusNotes
      );
      if (error) {
        this.statusError = error;
        return;
      }
      this.statusNotes = '';
    }
  }

  /** Open the interview scheduler pre-filled with this application (real date/link entered there). */
  scheduleInterviewForApp(): void {
    if (this.selectedApplication) {
      this.router.navigate(['/company/interviews'], {
        queryParams: { schedule: this.selectedApplication.id },
      });
    }
  }
}
