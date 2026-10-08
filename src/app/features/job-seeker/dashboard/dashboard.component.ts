import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { JobSeekerService } from '../services/job-seeker.service';
import { Job } from '../models/job-seeker.models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  jobSeekerService = inject(JobSeekerService);
  router = inject(Router);

  quickLikeJob(job: Job) {
    const res = this.jobSeekerService.swipeJob(job, 'like');
    if (res.isMatch) {
      this.router.navigate(['/job-seeker/matches']);
    }
  }

  saveJob(job: Job) {
    this.jobSeekerService.saveJob(job);
  }

  openMatchChat(matchId: string) {
    this.router.navigate(['/job-seeker/messages'], { queryParams: { matchId } });
  }

  get upcomingInterviewsList() {
    return this.jobSeekerService.interviews().filter((i) => i.status === 'upcoming');
  }

  get nextActionSuggestion(): { title: string; desc: string; buttonText: string; route: string } {
    const jsp = this.jobSeekerService.jobSeekerProfile();
    if (jsp.profile_completion_pct < 100) {
      return {
        title: 'Complete your candidate profile',
        desc: 'Your profile is currently at ' + jsp.profile_completion_pct + '%. Completing education & skills boosts matches by 4x.',
        buttonText: 'Complete Setup',
        route: '/job-seeker/onboarding',
      };
    }

    const upcoming = this.upcomingInterviewsList;
    if (upcoming.length > 0) {
      return {
        title: 'Prepare for upcoming interview with ' + upcoming[0].company_name,
        desc: 'Scheduled for ' + upcoming[0].date + ' (' + upcoming[0].time + '). Review your prep notes and system design basics.',
        buttonText: 'View Interview Details',
        route: '/job-seeker/interviews',
      };
    }

    const unreadMsgs = this.jobSeekerService.unreadMessageCount();
    if (unreadMsgs > 0) {
      return {
        title: 'Respond to recruiter messages',
        desc: `You have ${unreadMsgs} unread message(s) from hiring teams.`,
        buttonText: 'Open Chat',
        route: '/job-seeker/messages',
      };
    }

    return {
      title: 'Swipe & discover high-match opportunities',
      desc: 'Top hiring teams in Bengaluru and Remote are actively looking for Senior Engineers matching your stack.',
      buttonText: 'Start Swiping Jobs',
      route: '/job-seeker/swipe',
    };
  }
}
