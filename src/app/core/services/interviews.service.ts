import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { Database } from '../models/database.types';

type InterviewRow = Database['public']['Tables']['interviews']['Row'];
type InterviewInsert = Database['public']['Tables']['interviews']['Insert'];

/**
 * InterviewsService — manages the interviews table.
 *
 * RLS policies:
 * - The relevant job seeker and authorized company members can view interviews.
 * - Only company members can create/update/cancel interviews.
 */
@Injectable({
  providedIn: 'root',
})
export class InterviewsService {
  private readonly supabase = inject(SupabaseService);

  async getJobSeekerInterviews(jobSeekerId: string): Promise<(InterviewRow & { application: any })[]> {
    const { data, error } = await this.supabase.client
      .from('interviews')
      .select('*, applications(job_id, company_id, jobs(title), companies(name, logo_url))')
      .eq('applications.job_seeker_id', jobSeekerId)
      .order('scheduled_at', { ascending: true });
    if (error) console.error('[InterviewsService] getJobSeekerInterviews:', error.message);
    return (data ?? []) as any;
  }

  async getCompanyInterviews(companyId: string): Promise<(InterviewRow & { application: any })[]> {
    const { data, error } = await this.supabase.client
      .from('interviews')
      .select('*, applications(job_id, job_seeker_id, jobs(title), job_seeker_profiles(profile_id, profiles(full_name, avatar_url)))')
      .eq('applications.company_id', companyId)
      .order('scheduled_at', { ascending: true });
    if (error) console.error('[InterviewsService] getCompanyInterviews:', error.message);
    return (data ?? []) as any;
  }

  async scheduleInterview(
    scheduledBy: string,
    interviewData: Omit<InterviewInsert, 'id' | 'scheduled_by' | 'created_at' | 'updated_at'>
  ): Promise<{ data: InterviewRow | null; error: string | null }> {
    const { data, error } = await this.supabase.client
      .from('interviews')
      .insert({ scheduled_by: scheduledBy, ...interviewData })
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data, error: null };
  }

  async updateInterview(
    interviewId: string,
    updates: Partial<Omit<InterviewRow, 'id' | 'application_id' | 'created_at' | 'updated_at'>>
  ): Promise<void> {
    await this.supabase.client.from('interviews').update(updates).eq('id', interviewId);
  }

  async cancelInterview(interviewId: string): Promise<void> {
    await this.supabase.client
      .from('interviews')
      .update({ status: 'cancelled' })
      .eq('id', interviewId);
  }
}
