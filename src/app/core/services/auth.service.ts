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
 * Role authority:
 * - Trusted source for authorization is public.profiles.role (same as Express).
 * - user_metadata.role is only used as a temporary bootstrap until the profile loads.
 * - Privileges must never be taken from request bodies or unverified client claims.
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

  readonly session = signal<AuthSession | null>(null);
  readonly user = signal<User | null>(null);
  readonly loading = signal<boolean>(true);
  /** Role from public.profiles — preferred over JWT metadata. */
  readonly profileRole = signal<UserRole | null>(null);

  readonly isAuthenticated = computed(() => !!this.session());
  readonly userRole = computed<UserRole | null>(() => {
    const fromProfile = this.profileRole();
    if (fromProfile) return fromProfile;
    const u = this.user();
    return (u?.user_metadata?.['role'] as UserRole) ?? null;
  });
  readonly isJobSeeker = computed(() => this.userRole() === 'job_seeker');
  readonly isCompany = computed(() => this.userRole() === 'company');
  readonly isAdmin = computed(() => this.userRole() === 'admin');

  constructor() {
    this.supabase.client.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
      this.user.set(data.session?.user ?? null);
      void this.refreshProfileRole(data.session?.user?.id);
      this.loading.set(false);
    });

    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
      this.user.set(session?.user ?? null);
      void this.refreshProfileRole(session?.user?.id);
      this.loading.set(false);
    });
  }

  /**
   * Load role from profiles table. Clears role when logged out.
   */
  private async refreshProfileRole(userId: string | undefined): Promise<void> {
    if (!userId) {
      this.profileRole.set(null);
      return;
    }
    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data?.role) {
      this.profileRole.set(null);
      return;
    }
    this.profileRole.set(data.role as UserRole);
  }

  async signUp(
    email: string,
    password: string,
    fullName: string,
    role: UserRole
  ): Promise<{ error: AuthError | null }> {
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

  async signInWithGoogle(_role: UserRole): Promise<{ error: AuthError | null }> {
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
   * Change password after verifying the current password.
   */
  async changePassword(
    email: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ error: string | null }> {
    const { error: reauthError } = await this.supabase.client.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (reauthError) {
      return { error: reauthError.message };
    }
    const { error } = await this.supabase.client.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    return { error: null };
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    // Clear every local auth/role signal immediately so no stale session,
    // user, or role survives sign-out (onAuthStateChange also fires, but we
    // must not rely on it for a clean signed-out state).
    this.session.set(null);
    this.user.set(null);
    this.profileRole.set(null);
    this.router.navigate(['/']);
  }

  getCurrentUserId(): string | null {
    return this.user()?.id ?? null;
  }

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
