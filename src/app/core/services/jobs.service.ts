import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthService } from './auth.service';
import { Database } from '../models/database.types';
import { environment } from '../../../environments/environment';

export type JobRow = Database['public']['Tables']['jobs']['Row'];
export type JobInsert = Database['public']['Tables']['jobs']['Insert'];
export type JobSkillRow = Database['public']['Tables']['job_skills']['Row'];
export type JobRequirementRow = Database['public']['Tables']['job_requirements']['Row'];
export type JobBenefitRow = Database['public']['Tables']['job_benefits']['Row'];

export interface CompanyJobsResponse {
  status: string;
  jobs: JobRow[];
}

export interface CompanyJobResponse {
  status: string;
  job: JobRow;
}

const ALLOWED_JOB_PAYLOAD_KEYS = new Set([
  'title',
  'description',
  'employment_type',
  'experience_level',
  'experience_min',
  'experience_max',
  'salary_min',
  'salary_max',
  'salary_currency',
  'location',
  'city',
  'state',
  'country',
  'remote_type',
  'status',
  'openings',
  'application_deadline',
  'requirements',
  'benefits',
  'skills',
]);

/**
 * JobsService — manages jobs, job_skills, job_requirements, job_benefits.
 *
 * Integrates company job operations with the Express backend:
 * - GET   /api/company/jobs
 * - GET   /api/company/jobs/:jobId
 * - POST  /api/company/jobs
 * - PATCH /api/company/jobs/:jobId
 * - PATCH /api/company/jobs/:jobId/status
 *
 * Preserves direct Supabase PostgREST queries for job seeker browsing/saving.
 */
@Injectable({
  providedIn: 'root',
})
export class JobsService {
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

  private sanitizeJobPayload(jobData: any): Record<string, any> {
    if (!jobData || typeof jobData !== 'object') return {};
    const payload: Record<string, any> = {};

    for (const [key, value] of Object.entries(jobData)) {
      if (!ALLOWED_JOB_PAYLOAD_KEYS.has(key)) continue;
      if (value === undefined) continue;

      if (key === 'status') {
        payload[key] = value === 'active' ? 'published' : value;
        continue;
      }

      if (key === 'requirements' && Array.isArray(value)) {
        payload[key] = value
          .map((r: any) => (typeof r === 'string' ? r.trim() : (r.requirement_text || r.requirement || '').trim()))
          .filter((r: string) => r.length > 0);
        continue;
      }

      if (key === 'benefits' && Array.isArray(value)) {
        payload[key] = value
          .map((b: any) => (typeof b === 'string' ? b.trim() : (b.benefit_text || b.benefit || '').trim()))
          .filter((b: string) => b.length > 0);
        continue;
      }

      if (key === 'skills' && Array.isArray(value)) {
        payload[key] = value;
        continue;
      }

      payload[key] = value;
    }

    return payload;
  }

  // ── Jobs ─────────────────────────────────────────────────────────────────

  /**
   * Get all published jobs for the swipe deck (job seekers).
   */
  async getPublishedJobs(limit = 20, offset = 0): Promise<JobRow[]> {
    const { data, error } = await this.supabase.client
      .from('jobs')
      .select('*, companies(name, logo_url)')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) console.error('[JobsService] getPublishedJobs:', error.message);
    return (data ?? []) as any;
  }

  /**
   * Get all jobs for a company (including drafts, paused, closed).
   * Calls Express backend GET /api/company/jobs.
   */
  async getCompanyJobs(companyId: string): Promise<JobRow[]> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await firstValueFrom(
        this.http.get<CompanyJobsResponse>(`${this.apiUrl}/company/jobs`, { headers })
      );
      return response.jobs ?? [];
    } catch (err: any) {
      const backendError = err instanceof HttpErrorResponse ? err.error?.error : null;
      const code = backendError?.code || (err.status ? `HTTP_${err.status}` : 'UNKNOWN_ERROR');
      const message = backendError?.message || err.message || 'Failed to fetch company jobs';
      console.warn(`[JobsService] getCompanyJobs backend error (${code}): ${message}`);

      // Fail closed on auth / permission errors
      if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN' || err.status === 401 || err.status === 403) {
        return [];
      }

      // Offline / development fallback to direct Supabase query
      console.warn('[JobsService] getCompanyJobs: attempting direct Supabase query fallback.');
      const { data, error } = await this.supabase.client
        .from('jobs')
        .select('*, job_skills(*, skills(name)), job_requirements(*), job_benefits(*)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) console.error('[JobsService] getCompanyJobs fallback error:', error.message);
      return (data ?? []) as any;
    }
  }

  /**
   * Retrieve a single job.
   * Calls Express backend GET /api/company/jobs/:jobId.
   * Falls back to Supabase direct query for job seekers or if offline.
   */
  async getJob(jobId: string): Promise<JobRow | null> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await firstValueFrom(
        this.http.get<CompanyJobResponse>(`${this.apiUrl}/company/jobs/${jobId}`, { headers })
      );
      return response.job ?? null;
    } catch (err: any) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        return null;
      }
      // If 403 or 401 (e.g. caller is job seeker, or unauthenticated), try public published job fetch via Supabase
      const { data, error } = await this.supabase.client
        .from('jobs')
        .select('*, companies(name, logo_url, industry, location), job_skills(*, skills(name)), job_requirements(*), job_benefits(*)')
        .eq('id', jobId)
        .single();
      if (error) console.error('[JobsService] getJob fallback error:', error.message);
      return data as any;
    }
  }

  /**
   * Create a job for the authenticated company via Express backend POST /api/company/jobs.
   */
  async createJob(
    companyId: string,
    createdBy: string,
    jobData: Omit<JobInsert, 'id' | 'company_id' | 'created_by' | 'created_at' | 'updated_at'> | any
  ): Promise<{ jobId: string | null; error: string | null }> {
    try {
      const headers = await this.getAuthHeaders();
      const payload = this.sanitizeJobPayload(jobData);
      const response = await firstValueFrom(
        this.http.post<CompanyJobResponse>(`${this.apiUrl}/company/jobs`, payload, { headers })
      );
      return { jobId: response.job?.id ?? null, error: null };
    } catch (err: any) {
      const backendError = err instanceof HttpErrorResponse ? err.error?.error : null;
      const message = backendError?.message || err.message || 'Failed to create job';
      console.error('[JobsService] createJob error:', message);
      return { jobId: null, error: message };
    }
  }

  /**
   * Update a job via Express backend PATCH /api/company/jobs/:jobId.
   */
  async updateJob(
    jobId: string,
    updates: Partial<Omit<JobRow, 'id' | 'company_id' | 'created_at' | 'updated_at'>> | any
  ): Promise<{ error: string | null }> {
    try {
      const headers = await this.getAuthHeaders();
      const payload = this.sanitizeJobPayload(updates);
      await firstValueFrom(
        this.http.patch<CompanyJobResponse>(`${this.apiUrl}/company/jobs/${jobId}`, payload, { headers })
      );
      return { error: null };
    } catch (err: any) {
      const backendError = err instanceof HttpErrorResponse ? err.error?.error : null;
      const message = backendError?.message || err.message || 'Failed to update job';
      console.error('[JobsService] updateJob error:', message);
      return { error: message };
    }
  }

  async publishJob(jobId: string): Promise<void> {
    await this.updateJobStatus(jobId, 'published');
  }

  async pauseJob(jobId: string): Promise<void> {
    await this.updateJobStatus(jobId, 'paused');
  }

  async closeJob(jobId: string): Promise<void> {
    await this.updateJobStatus(jobId, 'closed');
  }

  /**
   * Generic job status update used by the job-list UI.
   * Calls Express backend PATCH /api/company/jobs/:jobId/status.
   */
  async updateJobStatus(
    jobId: string,
    status: JobRow['status'] | string
  ): Promise<{ error: string | null }> {
    try {
      const headers = await this.getAuthHeaders();
      const dbStatus = status === 'active' ? 'published' : status;
      await firstValueFrom(
        this.http.patch<CompanyJobResponse>(
          `${this.apiUrl}/company/jobs/${jobId}/status`,
          { status: dbStatus },
          { headers }
        )
      );
      return { error: null };
    } catch (err: any) {
      const backendError = err instanceof HttpErrorResponse ? err.error?.error : null;
      const message = backendError?.message || err.message || 'Failed to update job status';
      console.error('[JobsService] updateJobStatus error:', message);
      return { error: message };
    }
  }

  // ── Job Skills ────────────────────────────────────────────────────────────

  async getJobSkills(jobId: string): Promise<(JobSkillRow & { skill_name: string })[]> {
    const { data, error } = await this.supabase.client
      .from('job_skills')
      .select('*, skills(name)')
      .eq('job_id', jobId);
    if (error) console.error('[JobsService] getJobSkills:', error.message);
    return (data ?? []).map((row: any) => ({ ...row, skill_name: row.skills?.name ?? '' }));
  }

  async setJobSkills(
    jobId: string,
    skills: { skill_id: string; is_required: boolean; minimum_proficiency?: string }[]
  ): Promise<{ error: string | null }> {
    // Delete existing and re-insert
    const { error: deleteError } = await this.supabase.client.from('job_skills').delete().eq('job_id', jobId);
    if (deleteError) return { error: deleteError.message };
    if (skills.length > 0) {
      const { error } = await this.supabase.client.from('job_skills').insert(
        skills.map((s) => ({ job_id: jobId, ...s }))
      );
      if (error) return { error: error.message };
    }
    return { error: null };
  }

  /**
   * Resolve skill names to rows in the shared skills catalog.
   * Only admins may add catalog entries (RLS), so unknown names are returned
   * separately instead of being created here.
   */
  async findSkillsByName(
    names: string[]
  ): Promise<{ skills: { id: string; name: string }[]; unknown: string[]; error: string | null }> {
    const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (wanted.length === 0) return { skills: [], unknown: [], error: null };

    const { data, error } = await this.supabase.client
      .from('skills')
      .select('id, name')
      .in('name', wanted);
    if (error) return { skills: [], unknown: wanted, error: error.message };

    const found = data ?? [];
    const foundNames = new Set(found.map((s) => s.name.toLowerCase()));
    const unknown = wanted.filter((n) => !foundNames.has(n.toLowerCase()));
    return { skills: found, unknown, error: null };
  }

  // ── Job Requirements ──────────────────────────────────────────────────────

  async setJobRequirements(jobId: string, requirements: string[]): Promise<{ error: string | null }> {
    const { error: deleteError } = await this.supabase.client.from('job_requirements').delete().eq('job_id', jobId);
    if (deleteError) return { error: deleteError.message };
    if (requirements.length > 0) {
      const { error } = await this.supabase.client.from('job_requirements').insert(
        requirements.map((req) => ({ job_id: jobId, requirement: req, is_required: true }))
      );
      if (error) return { error: error.message };
    }
    return { error: null };
  }

  // ── Job Benefits ──────────────────────────────────────────────────────────

  async setJobBenefits(jobId: string, benefits: string[]): Promise<{ error: string | null }> {
    const { error: deleteError } = await this.supabase.client.from('job_benefits').delete().eq('job_id', jobId);
    if (deleteError) return { error: deleteError.message };
    if (benefits.length > 0) {
      const { error } = await this.supabase.client.from('job_benefits').insert(
        benefits.map((b) => ({ job_id: jobId, benefit: b }))
      );
      if (error) return { error: error.message };
    }
    return { error: null };
  }

  // ── Saved Jobs ────────────────────────────────────────────────────────────

  async getSavedJobs(jobSeekerId: string): Promise<any[]> {
    const { data, error } = await this.supabase.client
      .from('saved_jobs')
      .select('*, jobs(*, companies(name, logo_url))')
      .eq('job_seeker_id', jobSeekerId)
      .order('created_at', { ascending: false });
    if (error) console.error('[JobsService] getSavedJobs:', error.message);
    return data ?? [];
  }

  async saveJob(jobSeekerId: string, jobId: string): Promise<{ error: string | null }> {
    const { error } = await this.supabase.client
      .from('saved_jobs')
      .insert({ job_seeker_id: jobSeekerId, job_id: jobId });
    if (error) return { error: error.message };
    return { error: null };
  }

  async unsaveJob(jobSeekerId: string, jobId: string): Promise<{ error: string | null }> {
    const { error } = await this.supabase.client
      .from('saved_jobs')
      .delete()
      .eq('job_seeker_id', jobSeekerId)
      .eq('job_id', jobId);
    if (error) return { error: error.message };
    return { error: null };
  }
}

