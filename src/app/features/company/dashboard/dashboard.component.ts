import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CompanyDataService } from '../services/company-data.service';
import { Job, Application, Match, Interview, Company } from '../models/company.models';

@Component({
  selector: 'app-company-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit, OnDestroy {
  company!: Company;
  jobs: Job[] = [];
  applications: Application[] = [];
  matches: Match[] = [];
  interviews: Interview[] = [];

  // Metrics
  activeJobsCount = 0;
  totalAppsCount = 0;
  shortlistedCount = 0;
  matchesCount = 0;
  upcomingInterviewsCount = 0;

  // Attention Items
  attentionItems: { title: string; desc: string; link: string; icon: string; type: 'urgent' | 'info' | 'action' }[] = [];

  private subs = new Subscription();

  constructor(private dataService: CompanyDataService) {}

  ngOnInit(): void {
    this.subs.add(
      this.dataService.company$.subscribe((c) => {
        this.company = c;
      })
    );

    this.subs.add(
      this.dataService.jobs$.subscribe((jList) => {
        this.jobs = jList;
        this.activeJobsCount = jList.filter((j) => j.status === 'active').length;
        this.buildAttentionItems();
      })
    );

    this.subs.add(
      this.dataService.applications$.subscribe((aList) => {
        this.applications = aList;
        this.totalAppsCount = aList.length;
        this.shortlistedCount = aList.filter((a) => a.status === 'shortlisted').length;
        this.buildAttentionItems();
      })
    );

    this.subs.add(
      this.dataService.matches$.subscribe((mList) => {
        this.matches = mList;
        this.matchesCount = mList.length;
      })
    );

    this.subs.add(
      this.dataService.interviews$.subscribe((iList) => {
        this.interviews = iList;
        this.upcomingInterviewsCount = iList.filter((i) => i.status === 'scheduled').length;
        this.buildAttentionItems();
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private buildAttentionItems(): void {
    const items: { title: string; desc: string; link: string; icon: string; type: 'urgent' | 'info' | 'action' }[] = [];

    const pendingApps = this.applications.filter((a) => a.status === 'pending');
    if (pendingApps.length > 0) {
      items.push({
        title: `${pendingApps.length} New Application${pendingApps.length > 1 ? 's' : ''} Awaiting Review`,
        desc: `Candidates have swiped right for ${pendingApps[0]?.job?.title || 'your open roles'}.`,
        link: '/company/applications',
        icon: 'applications',
        type: 'urgent',
      });
    }

    const scheduledInts = this.interviews.filter((i) => i.status === 'scheduled');
    if (scheduledInts.length > 0) {
      items.push({
        title: `Upcoming Interview: ${scheduledInts[0].candidate_name}`,
        desc: `Scheduled for ${scheduledInts[0].date} at ${scheduledInts[0].time} (${scheduledInts[0].job_title}).`,
        link: '/company/interviews',
        icon: 'interviews',
        type: 'action',
      });
    }

    if (this.company && this.company.completion_percentage < 100) {
      items.push({
        title: `Company Profile is ${this.company.completion_percentage}% Complete`,
        desc: 'Add company mission and culture details to boost application volume by 35%.',
        link: '/company/onboarding',
        icon: 'profile',
        type: 'info',
      });
    }

    this.attentionItems = items;
  }
}
