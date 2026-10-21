import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { Database } from '../models/database.types';

type ApplicationRow = Database['public']['Tables']['applications']['Row'];
type ApplicationInsert = Database['public']['Tables']['applications']['Insert'];

/**
 * ApplicationsService — manages applications and application_status_history.
 *
 * IMPORTANT: Do NOT insert into application_status_history manually.
 * The on_application_status_updated trigger automatically records every
 * status change to application_status_history.
 *
 * RLS policies:
 * - Job seekers can view their own applications and insert new ones.
 * - Company members can view applications for their company's jobs.
 * - Company members can update application status.
 */
@Injectable({
  providedIn: 'root',
})
export class ApplicationsService {
  private readonly supabase = inject(SupabaseService);

  /**
   * Get all applications for a job seeker.
   */
  async getJobSeekerApplications(jobSeekerId: string): Promise<(ApplicationRow & { job: any; company: any })[]> {
    const { data, error } = await this.supabase.client
      .from('applications')
      .select('*, jobs(title, location, salary_min, salary_max, salary_currency, employment_type), companies(name, logo_url)')
      .eq('job_seeker_id', jobSeekerId)
      .order('applied_at', { ascending: false });
    if (error) console.error('[ApplicationsService] getJobSeekerApplications:', error.message);
    return (data ?? []) as any;
  }

  /**
   * Get applications for a company, optionally filtered by job.
   */
  async getCompanyApplications(
    companyId: string,
    jobId?: string
  ): Promise<(ApplicationRow & { job: any; job_seeker: any })[]> {
    let query = this.supabase.client
      .from('applications')
      .select('*, jobs(title), job_seeker_profiles(profile_id, headline, profiles(full_name, avatar_url, email, phone)), application_status_history(old_status, new_status, created_at)')
      .eq('company_id', companyId)
      .order('applied_at', { ascending: false });

    if (jobId) {
      query = query.eq('job_id', jobId);
    }

    const { data, error } = await query;
    if (error) console.error('[ApplicationsService] getCompanyApplications:', error.message);
    return (data ?? []) as any;
  }

  /**
   * Get application status history for an application.
   */
  async getStatusHistory(applicationId: string): Promise<any[]> {
    const { data, error } = await this.supabase.client
      .from('application_status_history')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at');
    if (error) console.error('[ApplicationsService] getStatusHistory:', error.message);
    return data ?? [];
  }

  /**
   * Submit a new application.
   * Unique constraint (job_id, job_seeker_id) prevents duplicate applications.
   */
  async applyToJob(
    jobId: string,
    jobSeekerId: string,
    companyId: string,
    resumeId?: string,
    coverLetter?: string
  ): Promise<{ data: ApplicationRow | null; error: string | null }> {
    const { data, error } = await this.supabase.client
      .from('applications')
      .insert({
        job_id: jobId,
        job_seeker_id: jobSeekerId,
        company_id: companyId,
        resume_id: resumeId ?? null,
        cover_letter: coverLetter ?? null,
        status: 'pending',
      })
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data, error: null };
  }

  /**
   * Update application status. The DB trigger will automatically log the change.
   */
  async updateApplicationStatus(
    applicationId: string,
    status: ApplicationRow['status']
  ): Promise<{ error: string | null }> {
    const { error } = await this.supabase.client
      .from('applications')
      .update({ status })
      .eq('id', applicationId);
    if (error) return { error: error.message };
    return { error: null };
  }

  /**
   * Withdraw an application (job seeker action).
   */
  async withdrawApplication(applicationId: string): Promise<void> {
    await this.supabase.client
      .from('applications')
      .update({ status: 'withdrawn' })
      .eq('id', applicationId);
  }
}
