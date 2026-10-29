import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthService } from './auth.service';
import { Database } from '../models/database.types';
import { environment } from '../../../environments/environment';

export type ApplicationRow = Database['public']['Tables']['applications']['Row'];
export type ApplicationInsert = Database['public']['Tables']['applications']['Insert'];
export type ApplicationStatusHistoryRow = Database['public']['Tables']['application_status_history']['Row'];

export interface CompanyApplicationsResponse {
  status: string;
  applications: any[];
}

export interface CompanyApplicationResponse {
  status: string;
  application: any;
}

/**
 * ApplicationsService — manages applications and application_status_history.
 *
 * Integrates company application operations with the Express backend:
 * - GET   /api/company/applications
 * - GET   /api/company/applications/:applicationId
 * - PATCH /api/company/applications/:applicationId/status
 *
 * Preserves direct Supabase PostgREST queries for job seeker application submission
 * and status retrieval.
 */
@Injectable({
  providedIn: 'root',
})
export class ApplicationsService {
  private readonly supabase = inject(SupabaseService);
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly apiUrl = environment.apiUrl || 'http://localhost:3000/api';

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async getAuthHeaders(): Promise<HttpHeaders> {
    const token = await this.authService.getAccessToken();
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  // ── Company Applications (Express Backend) ────────────────────────────────

  /**
   * Get applications for a company, optionally filtered by job.
   * Calls Express backend GET /api/company/applications.
   */
  async getCompanyApplications(
    companyId: string,
    jobId?: string
  ): Promise<any[]> {
    try {
      const headers = await this.getAuthHeaders();
      let url = `${this.apiUrl}/company/applications`;
      if (jobId) {
        url += `?jobId=${encodeURIComponent(jobId)}`;
      }

      const response = await firstValueFrom(
        this.http.get<CompanyApplicationsResponse>(url, { headers })
      );
      return response.applications ?? [];
    } catch (err: any) {
      const backendError = err instanceof HttpErrorResponse ? err.error?.error : null;
      const code = backendError?.code || (err.status ? `HTTP_${err.status}` : 'UNKNOWN_ERROR');
      const message = backendError?.message || err.message || 'Failed to fetch company applications';
      console.warn(`[ApplicationsService] getCompanyApplications backend error (${code}): ${message}`);

      // Fail closed on auth / permission errors
      if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN' || err.status === 401 || err.status === 403) {
        return [];
      }

      // Offline / development fallback to direct Supabase query
      console.warn('[ApplicationsService] getCompanyApplications: attempting direct Supabase query fallback.');
      let query = this.supabase.client
        .from('applications')
        .select('*, jobs(id, title, location, employment_type), job_seeker_profiles(id, profile_id, headline, bio, location, experience_years, profiles(id, full_name, avatar_url, email, phone)), resumes(id, file_name, file_path, file_size, mime_type), application_status_history(id, old_status, new_status, note, created_at)')
        .eq('company_id', companyId)
        .order('applied_at', { ascending: false });

      if (jobId) {
        query = query.eq('job_id', jobId);
      }

      const { data, error } = await query;
      if (error) console.error('[ApplicationsService] getCompanyApplications fallback error:', error.message);
      return (data ?? []) as any;
    }
  }

  /**
   * Retrieve a single application by ID with candidate details.
   * Calls Express backend GET /api/company/applications/:applicationId.
   */
  async getApplication(applicationId: string): Promise<any | null> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await firstValueFrom(
        this.http.get<CompanyApplicationResponse>(
          `${this.apiUrl}/company/applications/${applicationId}`,
          { headers }
        )
      );
      return response.application ?? null;
    } catch (err: any) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        return null;
      }
      const backendError = err instanceof HttpErrorResponse ? err.error?.error : null;
      console.warn(`[ApplicationsService] getApplication error: ${backendError?.message || err.message}`);
      return null;
    }
  }

  /**
   * Update application status and record review note.
   * Calls Express backend PATCH /api/company/applications/:applicationId/status.
   */
  async updateApplicationStatus(
    applicationId: string,
    status: ApplicationRow['status'] | string,
    notes?: string
  ): Promise<{ error: string | null }> {
    try {
      const headers = await this.getAuthHeaders();
      await firstValueFrom(
        this.http.patch<CompanyApplicationResponse>(
          `${this.apiUrl}/company/applications/${applicationId}/status`,
          { status, note: notes },
          { headers }
        )
      );
      return { error: null };
    } catch (err: any) {
      const backendError = err instanceof HttpErrorResponse ? err.error?.error : null;
      const message = backendError?.message || err.message || 'Failed to update application status';
      console.error('[ApplicationsService] updateApplicationStatus error:', message);
      return { error: message };
    }
  }

  // ── Job Seeker Applications (Direct Supabase) ─────────────────────────────

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
  ): Promise<{ data: ApplicationRow | null; error: string | null; code?: string | null }> {
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
    if (error) return { data: null, error: error.message, code: error.code ?? null };
    return { data, error: null };
  }

  /**
   * The candidate's application for one job, if any (unique on job_id + job_seeker_id).
   */
  async getApplicationForJob(
    jobId: string,
    jobSeekerId: string
  ): Promise<{ data: ApplicationRow | null; error: string | null }> {
    const { data, error } = await this.supabase.client
      .from('applications')
      .select()
      .eq('job_id', jobId)
      .eq('job_seeker_id', jobSeekerId)
      .maybeSingle();
    if (error) return { data: null, error: error.message };
    return { data, error: null };
  }

  /**
   * Job ids the candidate has an application for. Throws on database errors.
   */
  async getAppliedJobIds(jobSeekerId: string): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .from('applications')
      .select('job_id')
      .eq('job_seeker_id', jobSeekerId);
    if (error) {
      console.error('[ApplicationsService] getAppliedJobIds:', error.message);
      throw new Error(error.message);
    }
    return (data ?? []).map((row) => row.job_id);
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
