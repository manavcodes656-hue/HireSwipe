import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * authGuard — prevents unauthenticated users from accessing protected routes.
 *
 * IMPORTANT: This guard is supplementary security.
 * The primary security layer is PostgreSQL RLS in the database.
 * Route guards alone are NOT sufficient security.
 */
export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for session restore so a refresh never lets an unauthenticated user through.
  await waitForAuth(authService);

  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  return true;
};

/**
 * jobSeekerGuard — ensures only job_seeker role can access job-seeker routes.
 */
export const jobSeekerGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await waitForAuth(authService);

  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  if (!authService.isJobSeeker()) {
    // Company or admin user trying to access job-seeker area
    router.navigate(['/company/dashboard']);
    return false;
  }

  return true;
};

/**
 * companyGuard — ensures only company role can access company routes.
 */
export const companyGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await waitForAuth(authService);

  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  if (!authService.isCompany()) {
    // Job seeker trying to access company area
    router.navigate(['/job-seeker/dashboard']);
    return false;
  }

  return true;
};

/**
 * guestGuard — prevents authenticated users from accessing login/signup pages.
 */
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);

  if (authService.isAuthenticated()) {
    authService.navigateAfterAuth('login');
    return false;
  }

  return true;
};

// ── Job Seeker Onboarding & Dashboard Access Control Guards ─────────────────

import { JobSeekerService } from '../../features/job-seeker/services/job-seeker.service';

/**
 * Safely awaits completion of the initial AuthService session load.
 */
async function waitForAuth(authService: AuthService, timeoutMs = 2000): Promise<void> {
  if (!authService.loading()) return;
  const start = Date.now();
  while (authService.loading() && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * Safely awaits completion of the JobSeekerService profile load.
 */
async function waitForJobSeeker(jobSeekerService: JobSeekerService, timeoutMs = 2000): Promise<void> {
  if (!jobSeekerService.loading()) return;
  const start = Date.now();
  while (jobSeekerService.loading() && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * jobSeekerDashboardGuard — protects Job Seeker dashboard and all child routes.
 *
 * Rules:
 * 1. Unauthenticated users -> redirected to /login.
 * 2. Non-Job Seekers (e.g. company users) -> redirected to /company/dashboard.
 * 3. Waits for authoritative profile load.
 * 4. Incomplete Job Seekers -> redirected to /job-seeker/onboarding.
 * 5. Failed profile loads -> redirected safely to /job-seeker/onboarding.
 * 6. Completed Job Seekers -> allowed access.
 */
export const jobSeekerDashboardGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const jobSeekerService = inject(JobSeekerService);
  const router = inject(Router);

  if (authService.loading()) {
    await waitForAuth(authService);
  }

  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  if (!authService.isJobSeeker()) {
    if (authService.isCompany()) {
      router.navigate(['/company/dashboard']);
    } else {
      router.navigate(['/']);
    }
    return false;
  }

  const userId = authService.getCurrentUserId();
  if (!userId) {
    router.navigate(['/login']);
    return false;
  }

  try {
    await jobSeekerService.ensureProfileLoaded(userId);
  } catch (err) {
    console.error('[jobSeekerDashboardGuard] Profile load error:', err);
    if (!jobSeekerService.isOnboardingCompleted()) {
      router.navigate(['/job-seeker/onboarding']);
      return false;
    }
    return true;
  }

  if (jobSeekerService.loading()) {
    await waitForJobSeeker(jobSeekerService);
  }

  if (!jobSeekerService.isOnboardingCompleted()) {
    router.navigate(['/job-seeker/onboarding']);
    return false;
  }

  return true;
};

/**
 * jobSeekerOnboardingGuard — protects the standalone /job-seeker/onboarding route.
 *
 * Rules:
 * 1. Unauthenticated users -> redirected to /login.
 * 2. Non-Job Seekers -> redirected to /company/onboarding or root.
 * 3. Authenticated Job Seekers with onboarding completed -> redirected to /job-seeker/dashboard.
 * 4. Authenticated Job Seekers with onboarding incomplete -> allowed access.
 */
export const jobSeekerOnboardingGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const jobSeekerService = inject(JobSeekerService);
  const router = inject(Router);

  if (authService.loading()) {
    await waitForAuth(authService);
  }

  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  if (!authService.isJobSeeker()) {
    if (authService.isCompany()) {
      router.navigate(['/company/onboarding']);
    } else {
      router.navigate(['/']);
    }
    return false;
  }

  const userId = authService.getCurrentUserId();
  if (userId) {
    try {
      await jobSeekerService.ensureProfileLoaded(userId);
    } catch {
      // On network failure, allow user to stay on onboarding so they can retry
      return true;
    }
  }

  if (jobSeekerService.loading()) {
    await waitForJobSeeker(jobSeekerService);
  }

  if (jobSeekerService.isOnboardingCompleted()) {
    router.navigate(['/job-seeker/dashboard']);
    return false;
  }

  return true;
};
