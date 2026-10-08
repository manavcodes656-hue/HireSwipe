import { Component, OnInit, OnDestroy } from '@angular/core';
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

  constructor(private dataService: CompanyDataService) {}

  ngOnInit(): void {
    this.subs.add(
      this.dataService.jobs$.subscribe((jList) => {
        this.jobs = jList;
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
        job.title.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        job.location.toLowerCase().includes(this.searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    });
  }

  getTabCount(status: JobStatus | 'all'): number {
    if (status === 'all') return this.jobs.length;
    return this.jobs.filter((j) => j.status === status).length;
  }

  changeStatus(job: Job, newStatus: JobStatus, event: Event): void {
    event.stopPropagation();
    this.dataService.updateJobStatus(job.id, newStatus);
  }
}
