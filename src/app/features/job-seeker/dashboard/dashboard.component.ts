import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { JobSeekerService } from '../services/job-seeker.service';
import { Job } from '../models/job-seeker.models';

export interface AttentionItem {
  id: string;
  title: string;
  desc: string;
  link: string;
  btnText: string;
  icon: 'application' | 'interview' | 'profile';
  type: 'urgent' | 'action' | 'info';
}

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
    return this.jobSeekerService.interviews().filter((i) => i.status === 'upcoming' || i.status === 'scheduled');
  }

  get activeApplicationsCount(): number {
    return this.jobSeekerService.applications().filter((a) => a.status === 'pending' || a.status === 'reviewing' || a.status === 'shortlisted').length;
  }

  isJobSaved(jobId: string): boolean {
    return this.jobSeekerService.savedJobs().some((sj) => sj.job_id === jobId || sj.id === jobId);
  }

  formatMatchScore(score: string | number | null | undefined, fallback = '94%'): string {
    if (!score) return fallback;
    const s = score.toString();
    return s.includes('%') ? s : `${s}%`;
  }

  private formatStatus(status: string): string {
    if (!status) return 'In Review';
    return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Generates the 3 dedicated Job Seeker attention cards:
   * 1. New Application Update
   * 2. Upcoming Interview
   * 3. Complete Your Profile
   */
  get attentionItems(): AttentionItem[] {
    const items: AttentionItem[] = [];

    // 1. Application Update Card
    const apps = this.jobSeekerService.applications();
    const activeApp = apps.find((a) => a.status === 'interview' || a.status === 'shortlisted' || a.status === 'reviewing' || a.status === 'pending') || apps[0];
    if (activeApp) {
      const isUrgent = activeApp.status === 'interview' || activeApp.status === 'shortlisted';
      items.push({
        id: 'app-update',
        title: `Application Update: ${activeApp.company_name}`,
        desc: `${activeApp.job_title} is marked as ${this.formatStatus(activeApp.status)}. Track current recruiting progress.`,
        link: '/job-seeker/applications',
        btnText: 'Track Status →',
        icon: 'application',
        type: isUrgent ? 'urgent' : 'action',
      });
    } else {
      items.push({
        id: 'app-update',
        title: 'No Application Updates',
        desc: 'You have not submitted applications yet. Browse matched roles to apply directly.',
        link: '/job-seeker/swipe',
        btnText: 'Discover Roles →',
        icon: 'application',
        type: 'info',
      });
    }

    // 2. Upcoming Interview Card
    const upcoming = this.upcomingInterviewsList;
    if (upcoming.length > 0) {
      const nextInt = upcoming[0];
      items.push({
        id: 'interview-update',
        title: `Upcoming Interview: ${nextInt.company_name}`,
        desc: `${nextInt.job_title} on ${nextInt.date} at ${nextInt.time} (${nextInt.location}). Review your interview prep notes.`,
        link: '/job-seeker/interviews',
        btnText: 'View Interview →',
        icon: 'interview',
        type: 'urgent',
      });
    } else {
      items.push({
        id: 'interview-update',
        title: 'No Upcoming Interviews',
        desc: 'Scheduled technical screenings and calls with matched recruiters will appear here automatically.',
        link: '/job-seeker/matches',
        btnText: 'View Matches →',
        icon: 'interview',
        type: 'info',
      });
    }

    // 3. Complete Your Profile Card
    const jsp = this.jobSeekerService.jobSeekerProfile();
    const pct = jsp?.profile_completion_pct ?? 0;
    if (pct < 100) {
      items.push({
        id: 'profile-update',
        title: `Complete Your Profile (${pct}% Completed)`,
        desc: 'Add remaining skills, work experience, or resume to increase recruiter match recommendations by 4x.',
        link: '/job-seeker/onboarding',
        btnText: 'Complete Profile →',
        icon: 'profile',
        type: 'action',
      });
    } else {
      items.push({
        id: 'profile-update',
        title: 'Profile Strength is 100% Optimal',
        desc: 'Your candidate profile is fully completed and verified for high-priority recruiter discovery.',
        link: '/job-seeker/profile',
        btnText: 'View Profile →',
        icon: 'profile',
        type: 'info',
      });
    }

    return items;
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
