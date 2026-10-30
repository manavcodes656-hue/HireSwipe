import { Component, OnInit, OnDestroy, ChangeDetectorRef, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CompanyDataService } from '../../services/company-data.service';
import { Job, Application, JobStatus } from '../../models/company.models';

@Component({
  selector: 'app-job-details',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './job-details.component.html',
  styleUrl: './job-details.component.css',
})
export class JobDetailsComponent implements OnInit, OnDestroy {
  job: Job | null = null;
  jobApplications: Application[] = [];
  private subs = new Subscription();

  readonly statusError: WritableSignal<string> = signal('');
  readonly statusSuccess: WritableSignal<string> = signal('');
  readonly isUpdating: WritableSignal<boolean> = signal(false);

  constructor(
    private route: ActivatedRoute,
    private dataService: CompanyDataService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.route.params.subscribe((params) => {
        const jobId = params['id'];
        if (jobId) {
          void this.loadJobDetails(jobId);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private async loadJobDetails(jobId: string): Promise<void> {
    const existing = this.dataService.currentJobs.find((j) => j.id === jobId);
    if (existing) {
      this.job = existing;
      this.cdr.markForCheck();
    } else {
      try {
        const fetched = await this.dataService.getJobById(jobId);
        if (fetched) {
          this.job = fetched;
          this.cdr.markForCheck();
        }
      } catch (e) {
        console.error('[JobDetailsComponent] Error fetching job details:', e);
      }
    }

    this.subs.add(
      this.dataService.jobs$.subscribe((jList) => {
        const found = jList.find((j) => j.id === jobId);
        if (found) {
          this.job = found;
          this.cdr.markForCheck();
        }
      })
    );

    this.subs.add(
      this.dataService.applications$.subscribe((aList) => {
        this.jobApplications = aList.filter((a) => a.job_id === jobId);
        this.cdr.markForCheck();
      })
    );
  }

  async changeStatus(status: JobStatus): Promise<void> {
    if (!this.job) return;

    if (status === 'closed') {
      const confirmed = window.confirm(
        `Are you sure you want to close the job "${this.job.title}"? Candidates will no longer be able to apply.`
      );
      if (!confirmed) return;
    }

    this.isUpdating.set(true);
    this.statusError.set('');
    this.statusSuccess.set('');
    this.cdr.markForCheck();

    try {
      const { error } = await this.dataService.updateJobStatus(this.job.id, status);
      this.isUpdating.set(false);

      if (error) {
        this.statusError.set(error);
      } else {
        const actionLabel = status === 'paused' ? 'paused' : status === 'closed' ? 'closed' : 'published';
        this.statusSuccess.set(`Job "${this.job.title}" has been successfully ${actionLabel}.`);
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
