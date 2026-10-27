import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CompanyDataService } from '../services/company-data.service';
import { Profile, Job, Match } from '../models/company.models';

@Component({
  selector: 'app-company-swipe',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './swipe.component.html',
  styleUrl: './swipe.component.css',
})
export class CompanySwipeComponent implements OnInit, OnDestroy {
  jobs: Job[] = [];
  selectedJobId = signal<string>('');
  
  swipedCandidateIds = signal<Set<string>>(new Set());
  currentCandidateIndex = signal<number>(0);
  
  selectedCandidateForModal = signal<Profile | null>(null);
  recentMatchObj = signal<Match | null>(null);
  showMatchModal = signal<boolean>(false);
  
  swipeDirection = signal<'like' | 'pass' | null>(null);
  
  filterSkill = signal<string>('all');
  toastMessage = signal<string>('');

  get isSampleData(): boolean {
    return this.dataService.candidatesAreSamples;
  }
  readonly sampleNote = 'Sample profiles for preview only. Candidate discovery is not supported by the current database schema, so actions here are not saved. Real candidates appear in Applications and Matches.';
  
  private subs = new Subscription();

  constructor(
    public dataService: CompanyDataService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.dataService.jobs$.subscribe((jList) => {
        this.jobs = jList.filter((j) => j.status === 'active');
        if (this.jobs.length > 0 && !this.selectedJobId()) {
          this.selectedJobId.set(this.jobs[0].id);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  get selectedJob(): Job | undefined {
    return this.jobs.find((j) => j.id === this.selectedJobId());
  }

  availableDeck = computed(() => {
    let list = this.dataService.allCandidates;
    const swiped = this.swipedCandidateIds();
    list = list.filter((c) => !swiped.has(c.id));

    const skill = this.filterSkill();
    if (skill !== 'all') {
      list = list.filter(
        (c) => c.skills && c.skills.some((s) => s.toLowerCase().includes(skill.toLowerCase()))
      );
    }
    return list;
  });

  currentCandidate = computed(() => {
    const deck = this.availableDeck();
    if (deck.length === 0) return null;
    return deck[this.currentCandidateIndex() % deck.length] || deck[0];
  });

  onJobSelectChange(jobId: string): void {
    this.selectedJobId.set(jobId);
  }

  onSkillFilterChange(skill: string): void {
    this.filterSkill.set(skill);
  }

  handleSwipe(direction: 'like' | 'pass'): void {
    const candidate = this.currentCandidate();
    if (!candidate) return;

    this.swipeDirection.set(direction);

    setTimeout(() => {
      this.swipedCandidateIds.update((set) => new Set(set).add(candidate.id));
      this.swipeDirection.set(null);

      if (direction === 'like') {
        // No company-side swipe/match exists in the schema (matches are created only
        // when a job seeker likes a job), so do not show a fabricated "match".
        this.toastMessage.set(`Not saved: ${candidate.full_name} is a sample profile.`);
        setTimeout(() => this.toastMessage.set(''), 3000);
      }
    }, 250);
  }

  openCandidateDetails(candidate: Profile): void {
    this.selectedCandidateForModal.set(candidate);
  }

  closeCandidateDetails(): void {
    this.selectedCandidateForModal.set(null);
  }

  closeMatchModal(): void {
    this.showMatchModal.set(false);
  }

  async openMatchMessage(): Promise<void> {
    const match = this.recentMatchObj();
    this.showMatchModal.set(false);
    if (match) {
      const candidateId = match.job_seeker_id || (match as any).profile?.id;
      const conv = await this.dataService.startConversationWithCandidate(candidateId, match.job_id);
      this.router.navigate(['/company/messages'], conv ? { queryParams: { conversation: conv.id } } : {});
    }
  }

  resetDeck(): void {
    this.swipedCandidateIds.set(new Set());
    this.currentCandidateIndex.set(0);
  }
}
