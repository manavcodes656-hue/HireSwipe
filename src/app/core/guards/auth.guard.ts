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
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.loading()) {
    // Session is still loading — allow through (component handles loading state)
    return true;
  }

  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  return true;
};

/**
 * jobSeekerGuard — ensures only job_seeker role can access job-seeker routes.
 */
export const jobSeekerGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

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
export const companyGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

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
