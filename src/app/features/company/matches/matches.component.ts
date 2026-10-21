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

  async startChat(match: Match): Promise<void> {
    if (match.profile_id) {
      await this.dataService.startConversationWithCandidate(match.profile_id, match.job_id);
      this.router.navigate(['/company/messages']);
    }
  }
}
