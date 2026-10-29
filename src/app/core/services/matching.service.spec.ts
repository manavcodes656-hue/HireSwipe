import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MatchingService, SwipeError } from './matching.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('MatchingService.getSwipedJobIds', () => {
  let service: MatchingService;
  let eq: any;
  let from: any;

  beforeEach(() => {
    eq = vi.fn();
    from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [MatchingService, { provide: SupabaseService, useValue: { client: { from } } }],
    });
    service = TestBed.inject(MatchingService);
  });

  it('returns the swiped job ids of the job seeker', async () => {
    eq.mockResolvedValue({ data: [{ job_id: 'a' }, { job_id: 'b' }], error: null });

    expect(await service.getSwipedJobIds('jsp-1')).toEqual(['a', 'b']);
    expect(from).toHaveBeenCalledWith('job_swipes');
    expect(eq).toHaveBeenCalledWith('job_seeker_id', 'jsp-1');
  });

  it('returns an empty list when there are no swipes', async () => {
    eq.mockResolvedValue({ data: [], error: null });
    expect(await service.getSwipedJobIds('jsp-1')).toEqual([]);
  });

  it('throws on database errors instead of returning an empty list', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    eq.mockResolvedValue({ data: null, error: { message: 'rls denied' } });

    await expect(service.getSwipedJobIds('jsp-1')).rejects.toThrow('rls denied');
  });
});

describe('MatchingService.getLikedJobIds', () => {
  let service: MatchingService;
  let eqDirection: any;
  let eqSeeker: any;

  beforeEach(() => {
    eqDirection = vi.fn();
    eqSeeker = vi.fn().mockReturnValue({ eq: eqDirection });
    const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eqSeeker }) });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [MatchingService, { provide: SupabaseService, useValue: { client: { from } } }],
    });
    service = TestBed.inject(MatchingService);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns only liked job ids', async () => {
    eqDirection.mockResolvedValue({ data: [{ job_id: 'a' }], error: null });

    expect(await service.getLikedJobIds('p1')).toEqual(['a']);
    expect(eqSeeker).toHaveBeenCalledWith('job_seeker_id', 'p1');
    expect(eqDirection).toHaveBeenCalledWith('direction', 'like');
  });

  it('throws on database errors', async () => {
    eqDirection.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(service.getLikedJobIds('p1')).rejects.toThrow('boom');
  });
});

describe('MatchingService.swipe', () => {
  let service: MatchingService;
  let single: any;
  let maybeSingle: any;
  let insert: any;

  beforeEach(() => {
    single = vi.fn();
    maybeSingle = vi.fn();
    insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    const lookup: any = { eq: vi.fn(), maybeSingle };
    lookup.eq.mockReturnValue(lookup);
    const from = vi.fn().mockReturnValue({ insert, select: vi.fn().mockReturnValue(lookup) });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [MatchingService, { provide: SupabaseService, useValue: { client: { from } } }],
    });
    service = TestBed.inject(MatchingService);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('inserts a like with the given profile and job ids and returns the stored swipe', async () => {
    const row = { id: 's1', job_id: 'j1', job_seeker_id: 'p1', direction: 'like' };
    single.mockResolvedValue({ data: row, error: null });

    const res = await service.swipe('p1', 'j1', 'like');

    expect(insert).toHaveBeenCalledWith({ job_seeker_id: 'p1', job_id: 'j1', direction: 'like' });
    expect(res).toEqual({ swipe: row, alreadyRecorded: false });
  });

  it('inserts a pass', async () => {
    single.mockResolvedValue({ data: { direction: 'pass' }, error: null });
    await service.swipe('p1', 'j1', 'pass');
    expect(insert).toHaveBeenCalledWith({ job_seeker_id: 'p1', job_id: 'j1', direction: 'pass' });
  });

  it('throws a SwipeError carrying the code for non-duplicate database errors', async () => {
    single.mockResolvedValue({ data: null, error: { message: 'new row violates row-level security policy', code: '42501' } });

    const err = await service.swipe('p1', 'j1', 'like').catch((e) => e);

    expect(err).toBeInstanceOf(SwipeError);
    expect(err.code).toBe('42501');
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it('propagates network failures instead of reporting success', async () => {
    single.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(service.swipe('p1', 'j1', 'like')).rejects.toThrow('Failed to fetch');
  });

  it('treats 23505 as already recorded only when the stored direction matches', async () => {
    const existing = { id: 's1', direction: 'like' };
    single.mockResolvedValue({ data: null, error: { message: 'duplicate key', code: '23505' } });
    maybeSingle.mockResolvedValue({ data: existing, error: null });

    expect(await service.swipe('p1', 'j1', 'like')).toEqual({ swipe: existing, alreadyRecorded: true });
  });

  it('rejects 23505 when the stored swipe has a different direction', async () => {
    single.mockResolvedValue({ data: null, error: { message: 'duplicate key', code: '23505' } });
    maybeSingle.mockResolvedValue({ data: { direction: 'pass' }, error: null });

    await expect(service.swipe('p1', 'j1', 'like')).rejects.toMatchObject({ code: 'SWIPE_CONFLICT' });
  });

  it('rejects 23505 when the existing swipe cannot be confirmed', async () => {
    single.mockResolvedValue({ data: null, error: { message: 'duplicate key', code: '23505' } });
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(service.swipe('p1', 'j1', 'like')).rejects.toBeInstanceOf(SwipeError);

    maybeSingle.mockResolvedValue({ data: null, error: { message: 'lookup failed' } });
    await expect(service.swipe('p1', 'j1', 'like')).rejects.toThrow('lookup failed');
  });
});