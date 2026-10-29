import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { JobSeekerService } from '../services/job-seeker.service';
import { Job } from '../models/job-seeker.models';

@Component({
  selector: 'app-swipe',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './swipe.component.html',
  styleUrl: './swipe.component.css',
})
export class SwipeComponent {
  jobSeekerService = inject(JobSeekerService);

  // Deck state
  currentJobIndex = signal(0);
  selectedJobForModal = signal<Job | null>(null);

  // Swipe animation / request states
  swipeDirection = signal<'like' | 'pass' | null>(null);
  swipePending = signal(false);
  swipeError = signal<string | null>(null);

  // Filters
  filterRemote = signal<'all' | 'remote' | 'hybrid' | 'on_site'>('all');
  filterLocation = signal<string>('all');

  availableDeck = computed(() => {
    let list = this.jobSeekerService.availableDeckJobs();
    const rem = this.filterRemote();
    if (rem !== 'all') {
      list = list.filter((j) => (j.remote_option || j.remote_type || '').toLowerCase().includes(rem));
    }
    return list;
  });

  currentJob = computed(() => {
    const deck = this.availableDeck();
    if (deck.length === 0) return null;
    return deck[this.currentJobIndex() % deck.length] || deck[0];
  });

  onFilterRemoteChange(val: 'all' | 'remote' | 'hybrid' | 'on_site') {
    this.filterRemote.set(val);
  }

  async handleSwipe(direction: 'like' | 'pass') {
    const job = this.currentJob();
    if (!job || this.swipePending()) return;

    this.swipePending.set(true);
    this.swipeError.set(null);
    this.swipeDirection.set(direction);
    try {
      const res = await this.jobSeekerService.swipeJob(job, direction);
      if (!res.ok) this.swipeError.set(res.error ?? 'Could not save your swipe. Please try again.');
    } finally {
      this.swipeDirection.set(null);
      this.swipePending.set(false);
    }
  }

  saveJob(job: Job, event: Event) {
    event.stopPropagation();
    this.jobSeekerService.saveJob(job);
  }

  openJobDetails(job: Job) {
    this.selectedJobForModal.set(job);
  }

  closeJobDetails() {
    this.selectedJobForModal.set(null);
  }

  reloadFeed() {
    this.currentJobIndex.set(0);
    return this.jobSeekerService.loadJobFeed();
  }
}
