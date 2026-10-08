import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthError, AuthSession, User } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';

export type UserRole = 'job_seeker' | 'company' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * AuthService — wraps Supabase Auth for HireSwipe.
 *
 * Single authentication system for both job seekers and companies.
 * Role is stored in auth.users.raw_user_meta_data and mirrored
 * into public.profiles via the on_auth_user_created database trigger.
 *
 * SECURITY NOTE:
 * - Passwords are NEVER stored in PostgreSQL application tables.
 * - Supabase Auth owns all credentials.
 * - Route guards in Angular are supplementary; RLS at the DB level is the
 *   authoritative security layer.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  // Reactive signals
  readonly session = signal<AuthSession | null>(null);
  readonly user = signal<User | null>(null);
  readonly loading = signal<boolean>(true);

  readonly isAuthenticated = computed(() => !!this.session());
  readonly userRole = computed<UserRole | null>(() => {
    const u = this.user();
    return (u?.user_metadata?.['role'] as UserRole) ?? null;
  });
  readonly isJobSeeker = computed(() => this.userRole() === 'job_seeker');
  readonly isCompany = computed(() => this.userRole() === 'company');
  readonly isAdmin = computed(() => this.userRole() === 'admin');

  constructor() {
    // Initialize session from storage on startup
    this.supabase.client.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
      this.user.set(data.session?.user ?? null);
      this.loading.set(false);
    });

    // Listen for auth state changes
    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
      this.user.set(session?.user ?? null);
      this.loading.set(false);
    });
  }

  /**
   * Sign up with email, password, full name, and role.
   * The role is passed as user metadata so the database trigger
   * can set it correctly in public.profiles.
   */
  async signUp(
    email: string,
    password: string,
    fullName: string,
    role: UserRole
  ): Promise<{ error: AuthError | null }> {
    // Split full name into first/last for the profiles trigger
    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ') || null;

    const { error } = await this.supabase.client.auth.signUp({
      email,
      password,
      options: {
        data: {
          role,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
        },
      },
    });
    return { error };
  }

  /**
   * Sign in with email and password.
   */
  async signIn(
    email: string,
    password: string
  ): Promise<{ error: AuthError | null }> {
    const { error } = await this.supabase.client.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  }

  /**
   * Sign in with Google OAuth.
   * Role is passed so the profile trigger can set it on first OAuth login.
   */
  async signInWithGoogle(role: UserRole): Promise<{ error: AuthError | null }> {
    const { error } = await this.supabase.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    return { error };
  }

  /**
   * Sign out and redirect to home.
   */
  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    this.router.navigate(['/']);
  }

  /**
   * Get the current user's Supabase Auth ID.
   */
  getCurrentUserId(): string | null {
    return this.user()?.id ?? null;
  }

  /**
   * Navigate to the correct dashboard/onboarding based on role.
   * Call after successful login or signup.
   */
  navigateAfterAuth(mode: 'login' | 'signup'): void {
    const role = this.userRole();
    if (role === 'job_seeker') {
      this.router.navigate(mode === 'signup' ? ['/job-seeker/onboarding'] : ['/job-seeker/dashboard']);
    } else if (role === 'company') {
      this.router.navigate(mode === 'signup' ? ['/company/onboarding'] : ['/company/dashboard']);
    } else {
      this.router.navigate(['/']);
    }
  }
}
