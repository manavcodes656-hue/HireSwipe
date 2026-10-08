import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { JobSeekerService } from '../services/job-seeker.service';
import { SavedJob } from '../models/job-seeker.models';

@Component({
  selector: 'app-saved-jobs',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './saved-jobs.component.html',
  styleUrl: './saved-jobs.component.css',
})
export class SavedJobsComponent {
  jobSeekerService = inject(JobSeekerService);
  router = inject(Router);

  searchQuery = signal('');

  filteredSavedJobs = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const list = this.jobSeekerService.savedJobs();
    if (!q) return list;
    return list.filter(
      (j) =>
        j.job_title.toLowerCase().includes(q) ||
        j.company_name.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q)
    );
  });

  onSearchChange(val: string) {
    this.searchQuery.set(val);
  }

  removeSavedJob(id: string) {
    this.jobSeekerService.removeSavedJob(id);
  }

  applyJob(savedJob: SavedJob) {
    const jobObj = this.jobSeekerService.jobs().find((j) => j.id === savedJob.job_id);
    if (jobObj) {
      this.jobSeekerService.swipeJob(jobObj, 'like');
    }
    this.router.navigate(['/job-seeker/applications']);
  }
}
