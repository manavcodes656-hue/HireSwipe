import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { Database } from '../models/database.types';

type JobSwipeRow = Database['public']['Tables']['job_swipes']['Row'];
type MatchRow = Database['public']['Tables']['matches']['Row'];

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
   * Record a job seeker's swipe on a job.
   * Unique constraint (job_id, job_seeker_id) prevents duplicate swipes.
   * A 'like' triggers automatic match creation in the database.
   */
  async swipe(
    jobSeekerId: string,
    jobId: string,
    direction: 'like' | 'pass'
  ): Promise<{ data: JobSwipeRow | null; error: string | null }> {
    const { data, error } = await this.supabase.client
      .from('job_swipes')
      .insert({ job_seeker_id: jobSeekerId, job_id: jobId, direction })
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data, error: null };
  }

  /**
   * Get all swipes by a job seeker (to track which jobs have already been swiped).
   */
  async getSwipedJobIds(jobSeekerId: string): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .from('job_swipes')
      .select('job_id')
      .eq('job_seeker_id', jobSeekerId);
    if (error) console.error('[MatchingService] getSwipedJobIds:', error.message);
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
