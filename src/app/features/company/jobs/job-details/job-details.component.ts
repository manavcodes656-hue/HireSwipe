import { Component, OnInit, OnDestroy } from '@angular/core';
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

  constructor(
    private route: ActivatedRoute,
    private dataService: CompanyDataService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const jobId = params['id'];
      if (jobId) {
        this.loadJobDetails(jobId);
      }
    });
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private loadJobDetails(jobId: string): void {
    this.subs.add(
      this.dataService.jobs$.subscribe((jList) => {
        const found = jList.find((j) => j.id === jobId);
        if (found) {
          this.job = found;
        }
      })
    );

    this.subs.add(
      this.dataService.applications$.subscribe((aList) => {
        this.jobApplications = aList.filter((a) => a.job_id === jobId);
      })
    );
  }

  changeStatus(status: JobStatus): void {
    if (this.job) {
      this.dataService.updateJobStatus(this.job.id, status);
    }
  }
}
