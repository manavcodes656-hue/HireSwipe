import { Component, OnInit, OnDestroy, ChangeDetectorRef, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CompanyDataService } from '../../services/company-data.service';
import { Job, JobStatus } from '../../models/company.models';

@Component({
  selector: 'app-job-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './job-list.component.html',
  styleUrl: './job-list.component.css',
})
export class JobListComponent implements OnInit, OnDestroy {
  jobs: Job[] = [];
  activeTab: JobStatus | 'all' = 'all';
  searchQuery = '';
  private subs = new Subscription();

  readonly statusError: WritableSignal<string> = signal('');
  readonly statusSuccess: WritableSignal<string> = signal('');
  readonly isUpdating: WritableSignal<boolean> = signal(false);

  constructor(
    private dataService: CompanyDataService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.dataService.jobs$.subscribe((jList) => {
        this.jobs = jList;
        this.cdr.markForCheck();
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  setTab(tab: JobStatus | 'all'): void {
    this.activeTab = tab;
  }

  get filteredJobs(): Job[] {
    return this.jobs.filter((job) => {
      const matchesTab = this.activeTab === 'all' || job.status === this.activeTab;
      const matchesSearch =
        !this.searchQuery ||
        (job.title || '').toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        (job.location || '').toLowerCase().includes(this.searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    });
  }

  getTabCount(status: JobStatus | 'all'): number {
    if (status === 'all') return this.jobs.length;
    return this.jobs.filter((j) => j.status === status).length;
  }

  async changeStatus(job: Job, newStatus: JobStatus, event: Event): Promise<void> {
    event.stopPropagation();

    if (newStatus === 'closed') {
      const confirmed = window.confirm(`Are you sure you want to close the job "${job.title}"? Candidates will no longer be able to apply.`);
      if (!confirmed) return;
    }

    this.isUpdating.set(true);
    this.statusError.set('');
    this.statusSuccess.set('');
    this.cdr.markForCheck();

    try {
      const { error } = await this.dataService.updateJobStatus(job.id, newStatus);
      this.isUpdating.set(false);

      if (error) {
        this.statusError.set(error);
      } else {
        const actionLabel = newStatus === 'paused' ? 'paused' : newStatus === 'closed' ? 'closed' : 'published';
        this.statusSuccess.set(`Job "${job.title}" has been successfully ${actionLabel}.`);
        setTimeout(() => {
          this.statusSuccess.set('');
          this.cdr.markForCheck();
        }, 5000);
      }
      this.cdr.markForCheck();
    } catch (e: any) {
      this.isUpdating.set(false);
      this.statusError.set(e?.message || 'Failed to update job status.');
      this.cdr.markForCheck();
    }
  }
}
