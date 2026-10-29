import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { Database } from '../models/database.types';

type JobSwipeRow = Database['public']['Tables']['job_swipes']['Row'];
type MatchRow = Database['public']['Tables']['matches']['Row'];

export class SwipeError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'SwipeError';
  }
}

export interface SwipeResult {
  swipe: JobSwipeRow;
  /** True when a 23505 duplicate was confirmed to match the requested direction. */
  alreadyRecorded: boolean;
}

/**
 * MatchingService — manages job_swipes and matches.
 *
 * The matching flow:
 * 1. Job seeker swipes → INSERT into job_swipes.
 * 2. Database trigger (check_and_create_match) automatically creates
 *    a match when direction is 'like'.
 * 3. Another trigger (create_conversation_for_match) auto-creates
 *    a conversation with conversation_members for the match.
 *
 * This service only needs to INSERT a swipe — the rest is handled by DB.
 */
@Injectable({
  providedIn: 'root',
})
export class MatchingService {
  private readonly supabase = inject(SupabaseService);

  /**
   * Record a job seeker's swipe on a job. Resolves only when the swipe is
   * persisted; throws SwipeError (with the Postgres `code`) otherwise.
   *
   * Unique constraint (job_id, job_seeker_id) rejects a second swipe with 23505.
   * That is treated as success only if the stored swipe has the same direction;
   * otherwise (or if it cannot be confirmed) it throws.
   * A 'like' triggers automatic match creation in the database.
   */
  async swipe(jobSeekerId: string, jobId: string, direction: 'like' | 'pass'): Promise<SwipeResult> {
    const { data, error } = await this.supabase.client
      .from('job_swipes')
      .insert({ job_seeker_id: jobSeekerId, job_id: jobId, direction })
      .select()
      .single();
    if (!error) return { swipe: data, alreadyRecorded: false };
    if (error.code !== '23505') throw new SwipeError(error.message, error.code);

    const { data: existing, error: lookupError } = await this.supabase.client
      .from('job_swipes')
      .select()
      .eq('job_seeker_id', jobSeekerId)
      .eq('job_id', jobId)
      .maybeSingle();
    if (lookupError || !existing) {
      throw new SwipeError(lookupError?.message ?? 'Existing swipe could not be confirmed', '23505');
    }
    if (existing.direction !== direction) {
      throw new SwipeError(`This job was already swiped: ${existing.direction}`, 'SWIPE_CONFLICT');
    }
    return { swipe: existing, alreadyRecorded: true };
  }

  /**
   * Get all swipes by a job seeker (to track which jobs have already been swiped).
   * Throws on database errors: silently returning [] would re-show swiped jobs.
   */
  async getSwipedJobIds(jobSeekerId: string): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .from('job_swipes')
      .select('job_id')
      .eq('job_seeker_id', jobSeekerId);
    if (error) {
      console.error('[MatchingService] getSwipedJobIds:', error.message);
      throw new Error(error.message);
    }
    return (data ?? []).map((row) => row.job_id);
  }

  /**
   * Job ids the job seeker has liked. Throws on database errors.
   */
  async getLikedJobIds(jobSeekerId: string): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .from('job_swipes')
      .select('job_id')
      .eq('job_seeker_id', jobSeekerId)
      .eq('direction', 'like');
    if (error) {
      console.error('[MatchingService] getLikedJobIds:', error.message);
      throw new Error(error.message);
    }
    return (data ?? []).map((row) => row.job_id);
  }

  /**
   * Get all active matches for a job seeker with related job and company info.
   */
  async getJobSeekerMatches(jobSeekerId: string): Promise<(MatchRow & { job: any; company: any })[]> {
    const { data, error } = await this.supabase.client
      .from('matches')
      .select('*, jobs(id, title, location, employment_type, remote_type, companies(name, logo_url))')
      .eq('job_seeker_id', jobSeekerId)
      .eq('status', 'active')
      .order('matched_at', { ascending: false });
    if (error) console.error('[MatchingService] getJobSeekerMatches:', error.message);
    return (data ?? []) as any;
  }

  /**
   * Get all active matches for a company.
   */
  async getCompanyMatches(companyId: string): Promise<(MatchRow & { job: any; job_seeker: any })[]> {
    const { data, error } = await this.supabase.client
      .from('matches')
      .select('*, jobs(title), job_seeker_profiles(profile_id, headline, profiles(full_name, avatar_url, email))')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('matched_at', { ascending: false });
    if (error) console.error('[MatchingService] getCompanyMatches:', error.message);
    return (data ?? []) as any;
  }
}
