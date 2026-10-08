import { Routes } from '@angular/router';
import { LandingComponent } from './components/landing/landing.component';
import { AuthComponent } from './components/auth/auth.component';

// Job Seeker Imports
import { JobSeekerLayoutComponent } from './features/job-seeker/layout/job-seeker-layout.component';
import { OnboardingComponent as JobSeekerOnboardingComponent } from './features/job-seeker/onboarding/onboarding.component';
import { DashboardComponent as JobSeekerDashboardComponent } from './features/job-seeker/dashboard/dashboard.component';
import { SwipeComponent } from './features/job-seeker/swipe/swipe.component';
import { MatchesComponent as JobSeekerMatchesComponent } from './features/job-seeker/matches/matches.component';
import { ApplicationsComponent as JobSeekerApplicationsComponent } from './features/job-seeker/applications/applications.component';
import { SavedJobsComponent } from './features/job-seeker/saved-jobs/saved-jobs.component';
import { ProfileComponent as JobSeekerProfileComponent } from './features/job-seeker/profile/profile.component';
import { MessagesComponent as JobSeekerMessagesComponent } from './features/job-seeker/messages/messages.component';
import { InterviewsComponent as JobSeekerInterviewsComponent } from './features/job-seeker/interviews/interviews.component';
import { NotificationsComponent as JobSeekerNotificationsComponent } from './features/job-seeker/notifications/notifications.component';
import { SettingsComponent as JobSeekerSettingsComponent } from './features/job-seeker/settings/settings.component';

// Company Imports
import { CompanyLayoutComponent } from './features/company/company-layout/company-layout.component';
import { OnboardingComponent as CompanyOnboardingComponent } from './features/company/onboarding/onboarding.component';
import { DashboardComponent as CompanyDashboardComponent } from './features/company/dashboard/dashboard.component';
import { JobListComponent } from './features/company/jobs/job-list/job-list.component';
import { JobCreateComponent } from './features/company/jobs/job-create/job-create.component';
import { JobDetailsComponent } from './features/company/jobs/job-details/job-details.component';
import { CandidatesComponent } from './features/company/candidates/candidates.component';
import { ApplicationsComponent as CompanyApplicationsComponent } from './features/company/applications/applications.component';
import { MatchesComponent as CompanyMatchesComponent } from './features/company/matches/matches.component';
import { MessagesComponent as CompanyMessagesComponent } from './features/company/messages/messages.component';
import { InterviewsComponent as CompanyInterviewsComponent } from './features/company/interviews/interviews.component';
import { TeamComponent } from './features/company/team/team.component';
import { ProfileComponent as CompanyProfileComponent } from './features/company/profile/profile.component';
import { SettingsComponent as CompanySettingsComponent } from './features/company/settings/settings.component';

import { CompanySwipeComponent } from './features/company/swipe/swipe.component';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'login', component: AuthComponent },
  { path: 'signup', component: AuthComponent },
  { path: 'company/onboarding', component: CompanyOnboardingComponent },
  {
    path: 'company',
    component: CompanyLayoutComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: CompanyDashboardComponent },
      { path: 'swipe', component: CompanySwipeComponent },
      { path: 'jobs', component: JobListComponent },
      { path: 'jobs/create', component: JobCreateComponent },
      { path: 'jobs/:id/edit', component: JobCreateComponent },
      { path: 'jobs/:id', component: JobDetailsComponent },
      { path: 'candidates', component: CandidatesComponent },
      { path: 'applications', component: CompanyApplicationsComponent },
      { path: 'matches', component: CompanyMatchesComponent },
      { path: 'messages', component: CompanyMessagesComponent },
      { path: 'interviews', component: CompanyInterviewsComponent },
      { path: 'team', component: TeamComponent },
      { path: 'profile', component: CompanyProfileComponent },
      { path: 'settings', component: CompanySettingsComponent },
    ],
  },
  {
    path: 'job-seeker',
    component: JobSeekerLayoutComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'onboarding', component: JobSeekerOnboardingComponent },
      { path: 'dashboard', component: JobSeekerDashboardComponent },
      { path: 'swipe', component: SwipeComponent },
      { path: 'matches', component: JobSeekerMatchesComponent },
      { path: 'applications', component: JobSeekerApplicationsComponent },
      { path: 'saved-jobs', component: SavedJobsComponent },
      { path: 'profile', component: JobSeekerProfileComponent },
      { path: 'messages', component: JobSeekerMessagesComponent },
      { path: 'interviews', component: JobSeekerInterviewsComponent },
      { path: 'notifications', component: JobSeekerNotificationsComponent },
      { path: 'settings', component: JobSeekerSettingsComponent },
    ],
  },
  { path: '**', redirectTo: '' },
];

