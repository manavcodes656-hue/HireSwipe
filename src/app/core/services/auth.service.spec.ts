import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('AuthService (security)', () => {
  let mockSupabase: any;
  let mockRouter: any;
  let service: AuthService;

  function clientWith(session: { user: { id: string } | null } | null) {
    mockSupabase = {
      client: {
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session } }),
          signInWithPassword: vi.fn(),
          signOut: vi.fn().mockResolvedValue({ error: null }),
          onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        },
        from: vi.fn(),
        rpc: vi.fn(),
      },
    };
    mockRouter = { navigate: vi.fn() };
  }

  beforeEach(() => {
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

  it('returns no error for valid credentials', async () => {
    mockSupabase.client.auth.signInWithPassword.mockResolvedValue({ error: null });

    const result = await service.signIn('alex@example.com', 'password123');

    expect(result.error).toBeNull();
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
});
