import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('AuthService (security)', () => {
  let mockSupabase: any;
  let mockRouter: any;
  let service: AuthService;

  let profile: { role: string } | null = { role: 'job_seeker' };

  function clientWith(session: { user: { id: string } | null } | null) {
    mockSupabase = {
      client: {
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session } }),
          signInWithPassword: vi.fn(),
          signUp: vi.fn(),
          signOut: vi.fn().mockResolvedValue({ error: null }),
          onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        },
        from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: profile, error: null }) }) }) })),
        rpc: vi.fn(),
      },
    };
    mockRouter = { navigate: vi.fn() };
  }

  beforeEach(() => {
    profile = { role: 'job_seeker' };
    clientWith(null);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client: mockSupabase.client } },
        { provide: Router, useValue: mockRouter },
      ],
    });
    service = TestBed.inject(AuthService);
  });

  it('returns the Supabase error for an invalid password and does not create a session', async () => {
    mockSupabase.client.auth.signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    });

    const result = await service.signIn('alex@example.com', 'wrong-password');

    expect(mockSupabase.client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'alex@example.com',
      password: 'wrong-password',
    });
    expect(result.error).toEqual({ message: 'Invalid login credentials' });
    expect(service.session()).toBeNull();
    expect(service.user()).toBeNull();
  });

  it('signs in with valid credentials and loads the profile role', async () => {
    const session = { access_token: 't', user: { id: 'u-1' } };
    mockSupabase.client.auth.signInWithPassword.mockResolvedValue({ data: { session }, error: null });

    const result = await service.signIn('alex@example.com', 'password123');

    expect(result.error).toBeNull();
    expect(service.session()).toBe(session);
    expect(service.profileRole()).toBe('job_seeker');
  });

  it('signIn with no profile row fails closed and leaves nobody authenticated', async () => {
    profile = null;
    mockSupabase.client.auth.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 't', user: { id: 'u-5' } } },
      error: null,
    });
    const result = await service.signIn('a@b.co', 'password123');
    expect(result.error?.message).toMatch(/profile/);
    expect(service.isAuthenticated()).toBe(false);
  });

  it('does not fake a session for @example.com / @hireswipe.io when signIn fails', async () => {
    mockSupabase.client.auth.signInWithPassword.mockResolvedValue({ error: { message: 'bad' } });
    const result = await service.signIn('x@hireswipe.io', 'password123');
    expect(result.error).toBeTruthy();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('signUp failure returns the error and creates no session', async () => {
    mockSupabase.client.auth.signUp.mockResolvedValue({ data: {}, error: { message: 'weak password' } });
    const result = await service.signUp('a@b.co', 'x', 'Al Ex', 'job_seeker');
    expect(result.error).toEqual({ message: 'weak password' });
    expect(service.isAuthenticated()).toBe(false);
  });

  it('signUp passes role metadata and, with email verification on, signs nobody in', async () => {
    mockSupabase.client.auth.signUp.mockResolvedValue({
      data: { user: { id: 'u-2', identities: [{}] }, session: null },
      error: null,
    });
    const result = await service.signUp('a@b.co', 'password123', 'Al Ex', 'company');
    expect(mockSupabase.client.auth.signUp.mock.calls[0][0].options.data.role).toBe('company');
    expect(result).toEqual({ error: null, needsEmailVerification: true });
    expect(service.isAuthenticated()).toBe(false);
  });

  it('signUp rejects an already-registered email', async () => {
    mockSupabase.client.auth.signUp.mockResolvedValue({
      data: { user: { id: 'u-3', identities: [] }, session: null },
      error: null,
    });
    const result = await service.signUp('a@b.co', 'password123', 'Al Ex', 'job_seeker');
    expect(result.error?.message).toMatch(/already exists/);
  });

  it('signUp with a session succeeds only when the trigger-provisioned profile exists', async () => {
    const session = { access_token: 't', user: { id: 'u-4' } };
    mockSupabase.client.auth.signUp.mockResolvedValue({
      data: { user: { id: 'u-4', identities: [{}] }, session },
      error: null,
    });
    expect((await service.signUp('a@b.co', 'password123', 'Al Ex', 'job_seeker')).error).toBeNull();
    expect(service.profileRole()).toBe('job_seeker');

    profile = null;
    const missing = await service.signUp('c@d.co', 'password123', 'Cy D', 'job_seeker');
    expect(missing.error?.message).toMatch(/profile/);
    expect(service.isAuthenticated()).toBe(false);
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('never trusts admin from user_metadata', () => {
    service.user.set({ id: 'u', user_metadata: { role: 'admin' } } as never);
    expect(service.userRole()).toBeNull();
  });

  it('propagates a network/auth-service failure instead of treating it as success', async () => {
    const networkError = new TypeError('fetch failed');
    mockSupabase.client.auth.signInWithPassword.mockRejectedValue(networkError);

    // signIn does not catch transport errors: they must surface to the caller.
    await expect(service.signIn('alex@example.com', 'password123')).rejects.toBe(networkError);
    expect(service.session()).toBeNull();
    expect(service.user()).toBeNull();
  });

  it('clears session, user and role on sign-out and navigates home', async () => {
    // Seed a signed-in state.
    service.session.set({} as never);
    service.user.set({ id: 'u-1', email: 'a@b.c' } as never);
    service['profileRole'].set('company');

    await service.signOut();

    expect(mockSupabase.client.auth.signOut).toHaveBeenCalled();
    expect(service.session()).toBeNull();
    expect(service.user()).toBeNull();
    expect(service.profileRole()).toBeNull();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/']);
  });

  it('restores a real session on refresh via getSession (no localStorage fake)', async () => {
    const session = { access_token: 't', user: { id: 'u-9' } };
    clientWith(session);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client: mockSupabase.client } },
        { provide: Router, useValue: mockRouter },
      ],
    });
    const restored = TestBed.inject(AuthService);
    await vi.waitFor(() => expect(restored.loading()).toBe(false));
    expect(restored.getCurrentUserId()).toBe('u-9');
    expect(restored.profileRole()).toBe('job_seeker');
  });

  it('stays logged out when no Supabase session exists, even if localStorage holds a stale fake', async () => {
    localStorage.setItem('hireswipe_auth_session', JSON.stringify({ user: { id: 'u-101' } }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client: mockSupabase.client } },
        { provide: Router, useValue: mockRouter },
      ],
    });
    const fresh = TestBed.inject(AuthService);
    await vi.waitFor(() => expect(fresh.loading()).toBe(false));
    expect(fresh.isAuthenticated()).toBe(false);
    localStorage.removeItem('hireswipe_auth_session');
  });
});
