import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { CompanyDataService } from '../services/company-data.service';
import { Match } from '../models/company.models';

@Component({
  selector: 'app-company-matches',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './matches.component.html',
  styleUrl: './matches.component.css',
})
export class MatchesComponent implements OnInit, OnDestroy {
  matches: Match[] = [];
  chatError = '';
  private subs = new Subscription();

  constructor(
    private dataService: CompanyDataService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.dataService.matches$.subscribe((mList) => {
        this.matches = mList;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

 feature/backend-foundation
  startChat(match: Match): void {
    this.chatError = '';
    // Conversations are created by the database when a match is created.
    const conv = this.dataService.startConversationWithCandidate(match.job_seeker_id, match.job_id);
    if (!conv) {
      this.chatError = 'No conversation was found for this match. You may not be a member of it yet.';
      return;

  async startChat(match: Match): Promise<void> {
    if (match.profile_id) {
      await this.dataService.startConversationWithCandidate(match.profile_id, match.job_id);
      this.router.navigate(['/company/messages']);
 main
    }
    this.router.navigate(['/company/messages'], { queryParams: { conversation: conv.id } });
  }
}
