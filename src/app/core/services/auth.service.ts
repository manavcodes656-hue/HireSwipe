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
    const meta = u?.user_metadata?.['role'];
    return meta === 'job_seeker' || meta === 'company' ? meta : null;
  });
  readonly isJobSeeker = computed(() => this.userRole() === 'job_seeker');
  readonly isCompany = computed(() => this.userRole() === 'company');
  readonly isAdmin = computed(() => this.userRole() === 'admin');

  constructor() {
    this.supabase.client.auth
      .getSession()
      .then(async ({ data }) => {
        if (data?.session) {
          await this.applySession(data.session);
        }
      })
      .catch(() => {})
      .finally(() => this.loading.set(false));

    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      // Not awaited: Supabase forbids awaiting other auth calls inside this callback.
      void this.applySession(session).finally(() => this.loading.set(false));
    });
  }

  /** Single place where a real Supabase session becomes app state. */
  private async applySession(session: AuthSession | null): Promise<void> {
    this.session.set(session);
    this.user.set(session?.user ?? null);
    await this.refreshProfileRole(session?.user?.id);
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

  /**
   * Registers a user. The public.profiles row is created by the
   * on_auth_user_created DB trigger (handle_new_user), not by the client.
   * `needsEmailVerification` is true when Supabase created the user but issued
   * no session (email confirmation enabled); the user is NOT signed in then.
   */
  async signUp(
    email: string,
    password: string,
    fullName: string,
    role: Exclude<UserRole, 'admin'>
  ): Promise<{ error: AuthError | null; needsEmailVerification?: boolean }> {
    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ') || null;

    const { data, error } = await this.supabase.client.auth.signUp({
      email,
      password,
      options: {
        data: { role, first_name: firstName, last_name: lastName, full_name: fullName },
      },
    });
    if (error) return { error };

    // Supabase returns an obfuscated user with no identities for an already-registered email.
    if (!data?.user || data.user.identities?.length === 0) {
      return { error: { message: 'An account with this email already exists.' } as AuthError };
    }

    if (!data.session) {
      return { error: null, needsEmailVerification: true };
    }

    await this.applySession(data.session);
    this.loading.set(false);
    if (!this.profileRole()) {
      // Never report success if the trigger did not provision the profile.
      await this.clearSession();
      return { error: { message: 'Account was created but your profile could not be set up. Please contact support.' } as AuthError };
    }
    return { error: null };
  }

  async signIn(email: string, password: string): Promise<{ error: AuthError | null }> {
    const { data, error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    if (error) return { error };
    if (!data?.session) {
      return { error: { message: 'Sign in failed. Please try again.' } as AuthError };
    }
    await this.applySession(data.session);
    this.loading.set(false);
    if (!this.profileRole()) {
      await this.clearSession();
      return { error: { message: 'Signed in, but your profile could not be loaded. Please try again or contact support.' } as AuthError };
    }
    return { error: null };
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

  /** Ends the Supabase session and clears app state, without navigating. */
  private async clearSession(): Promise<void> {
    try {
      await this.supabase.client.auth.signOut();
    } catch {}
    this.session.set(null);
    this.user.set(null);
    this.profileRole.set(null);
    this.loading.set(false);
  }

  async signOut(): Promise<void> {
    await this.clearSession();
    this.router.navigate(['/']);
  }

  getCurrentUserId(): string | null {
    return this.user()?.id ?? null;
  }

  /**
   * Get the current user's Supabase Auth access token.
   * Checks the reactive session signal first, and falls back to
   * Supabase Auth getSession() if not yet populated.
   */
  async getAccessToken(): Promise<string | null> {
    const currentSession = this.session();
    if (currentSession?.access_token) {
      return currentSession.access_token;
    }
    const { data } = await this.supabase.client.auth.getSession();
    return data.session?.access_token ?? null;
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
