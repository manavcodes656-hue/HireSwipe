import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { JobSeekerService } from '../services/job-seeker.service';
import { Job, Match } from '../models/job-seeker.models';

@Component({
  selector: 'app-swipe',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './swipe.component.html',
  styleUrl: './swipe.component.css',
})
export class SwipeComponent {
  jobSeekerService = inject(JobSeekerService);
  router = inject(Router);

  // Deck state
  currentJobIndex = signal(0);
  selectedJobForModal = signal<Job | null>(null);

  // Match celebration modal state
  recentMatchObj = signal<Match | null>(null);
  showMatchModal = signal(false);

  // Swipe animation states
  swipeDirection = signal<'like' | 'pass' | null>(null);

  // Filters
  filterRemote = signal<'all' | 'remote' | 'hybrid' | 'on_site'>('all');
  filterLocation = signal<string>('all');

  availableDeck = computed(() => {
    let list = this.jobSeekerService.availableDeckJobs();
    const rem = this.filterRemote();
    if (rem !== 'all') {
      list = list.filter((j) => j.remote_option.toLowerCase().includes(rem));
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

  handleSwipe(direction: 'like' | 'pass') {
    const job = this.currentJob();
    if (!job) return;

    this.swipeDirection.set(direction);

    setTimeout(() => {
      const res = this.jobSeekerService.swipeJob(job, direction);
      this.swipeDirection.set(null);

      if (res.isMatch && res.matchObj) {
        this.recentMatchObj.set(res.matchObj);
        this.showMatchModal.set(true);
      }
    }, 250);
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

  closeMatchModal() {
    this.showMatchModal.set(false);
  }

  openMatchMessage() {
    const match = this.recentMatchObj();
    this.showMatchModal.set(false);
    if (match) {
      this.router.navigate(['/job-seeker/messages'], { queryParams: { matchId: match.id } });
    }
  }

  resetDeck() {
    this.jobSeekerService.swipedJobIds.set(new Set());
    this.currentJobIndex.set(0);
  }
}
