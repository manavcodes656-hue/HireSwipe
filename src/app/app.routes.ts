import { Routes } from '@angular/router';
import { LandingComponent } from './components/landing/landing.component';
import { AuthComponent } from './components/auth/auth.component';
import { CompanyLayoutComponent } from './features/company/company-layout/company-layout.component';
import { OnboardingComponent } from './features/company/onboarding/onboarding.component';
import { DashboardComponent } from './features/company/dashboard/dashboard.component';
import { JobListComponent } from './features/company/jobs/job-list/job-list.component';
import { JobCreateComponent } from './features/company/jobs/job-create/job-create.component';
import { JobDetailsComponent } from './features/company/jobs/job-details/job-details.component';
import { CandidatesComponent } from './features/company/candidates/candidates.component';
import { ApplicationsComponent } from './features/company/applications/applications.component';
import { MatchesComponent } from './features/company/matches/matches.component';
import { MessagesComponent } from './features/company/messages/messages.component';
import { InterviewsComponent } from './features/company/interviews/interviews.component';
import { TeamComponent } from './features/company/team/team.component';
import { ProfileComponent } from './features/company/profile/profile.component';
import { SettingsComponent } from './features/company/settings/settings.component';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'login', component: AuthComponent },
  { path: 'company/onboarding', component: OnboardingComponent },
  {
    path: 'company',
    component: CompanyLayoutComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'jobs', component: JobListComponent },
      { path: 'jobs/create', component: JobCreateComponent },
      { path: 'jobs/:id/edit', component: JobCreateComponent },
      { path: 'jobs/:id', component: JobDetailsComponent },
      { path: 'candidates', component: CandidatesComponent },
      { path: 'applications', component: ApplicationsComponent },
      { path: 'matches', component: MatchesComponent },
      { path: 'messages', component: MessagesComponent },
      { path: 'interviews', component: InterviewsComponent },
      { path: 'team', component: TeamComponent },
      { path: 'profile', component: ProfileComponent },
      { path: 'settings', component: SettingsComponent },
    ],
  },
  { path: '**', redirectTo: '' },
];
