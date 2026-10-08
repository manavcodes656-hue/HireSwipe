import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { JobSeekerService } from '../services/job-seeker.service';
import { Match } from '../models/job-seeker.models';

@Component({
  selector: 'app-matches',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './matches.component.html',
  styleUrl: './matches.component.css',
})
export class MatchesComponent {
  jobSeekerService = inject(JobSeekerService);
  router = inject(Router);

  activeTab = signal<'all' | 'active' | 'archived'>('all');
  selectedMatch = signal<Match | null>(null);

  filteredMatches = computed(() => {
    const tab = this.activeTab();
    const list = this.jobSeekerService.matches();
    if (tab === 'all') return list;
    return list.filter((m) => m.status === tab);
  });

  openConversation(match: Match) {
    this.router.navigate(['/job-seeker/messages'], { queryParams: { matchId: match.id } });
  }

  viewJobDetails(match: Match) {
    this.selectedMatch.set(match);
  }

  closeModal() {
    this.selectedMatch.set(null);
  }
}
