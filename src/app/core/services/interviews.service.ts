import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthService } from './auth.service';
import { Database } from '../models/database.types';
import { environment } from '../../../environments/environment';

export type InterviewRow = Database['public']['Tables']['interviews']['Row'];
export type InterviewInsert = Database['public']['Tables']['interviews']['Insert'];
export type InterviewStatusValue = Database['public']['Enums']['interview_status'];

/** An interview as returned by the company API (row plus its relations). */
export type CompanyInterview = InterviewRow & {
  applications?: {
    id: string;
    job_id: string;
    job_seeker_id: string;
    company_id: string;
    status: string;
    jobs?: { id: string; title: string; location?: string | null; employment_type?: string | null } | null;
    job_seeker_profiles?: {
      id: string;
      profile_id: string;
      headline?: string | null;
      location?: string | null;
      experience_years?: number | null;
      profiles?: {
        id: string;
        full_name?: string | null;
        avatar_url?: string | null;
        email?: string | null;
        phone?: string | null;
      } | null;
    } | null;
  } | null;
  profiles?: { full_name?: string | null; avatar_url?: string | null } | null;
};

export interface CompanyInterviewsResponse {
  status: string;
  interviews: CompanyInterview[];
}

export interface CompanyInterviewResponse {
  status: string;
  interview: CompanyInterview;
}

/** Optional filters supported by GET /api/company/interviews. */
export interface CompanyInterviewFilters {
  applicationId?: string;
  jobId?: string;
  status?: InterviewStatusValue;
}

/**
 * Payload accepted by POST /api/company/interviews. It maps one-to-one onto
 * the public.interviews columns the API allows a company member to set.
 */
export interface ScheduleInterviewPayload {
  application_id: string;
  title: string;
  description?: string | null;
  scheduled_at: string;
  duration_minutes?: number | null;
  meeting_url?: string | null;
  location?: string | null;
}

/** Fields of an interview a company member may change after creation. */
export type InterviewUpdate = Partial<
  Omit<InterviewRow, 'id' | 'application_id' | 'scheduled_by' | 'created_at' | 'updated_at'>
>;

/** Columns the API accepts; anything else is dropped before sending. */
const ALLOWED_INTERVIEW_FIELDS = new Set([
  'title',
  'description',
  'scheduled_at',
  'duration_minutes',
  'meeting_url',
  'location',
  'status',
]);

/**
 * InterviewsService — manages the interviews table.
 *
 * Company-side interview management runs through the Express backend:
 * - GET   /api/company/interviews
 * - GET   /api/company/interviews/:interviewId
 * - POST  /api/company/interviews
 * - PATCH /api/company/interviews/:interviewId
 * - PATCH /api/company/interviews/:interviewId/status
 *
 * The job seeker view keeps its direct Supabase query: the candidate-side
 * endpoints are a later phase and the RLS policies already restrict the rows
 * to the applicant's own interviews.
 *
 * Schema notes (supabase/migrations/001_initial_hireswipe_schema.sql):
 * - `interviews` has no company column; ownership comes from the application
 *   the interview belongs to.
 * - There is no interview type or notes column: `description` holds the
 *   agenda/notes and `location` holds the mode or place.
 * - Date and time are stored in a single `scheduled_at` timestamp.
 */
@Injectable({
  providedIn: 'root',
})
export class InterviewsService {
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

  /** Keep only the fields the API accepts, with normalised values. */
  private sanitizeInterviewPayload(input: Record<string, any>): Record<string, any> {
    const payload: Record<string, any> = {};
    if (!input || typeof input !== 'object') return payload;

    for (const [key, value] of Object.entries(input)) {
      if (!ALLOWED_INTERVIEW_FIELDS.has(key)) continue;
      if (value === undefined) continue;

      if (value === null) {
        payload[key] = null;
        continue;
      }

      if (key === 'duration_minutes') {
        const minutes = typeof value === 'number' ? value : parseInt(String(value), 10);
        if (!isNaN(minutes) && minutes > 0) payload[key] = minutes;
        continue;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        payload[key] = trimmed.length > 0 ? trimmed : null;
        continue;
      }

      payload[key] = value;
    }

    return payload;
  }

  // ── Company Interviews (Express backend) ──────────────────────────────────

  /**
   * Get the interviews of the caller's company.
   * Calls Express backend GET /api/company/interviews.
   *
   * The company is derived by the backend from the caller's verified
   * membership, so `companyId` is never sent and never trusted.
   */
  async getCompanyInterviews(
    companyId?: string,
    filters?: CompanyInterviewFilters
  ): Promise<CompanyInterview[]> {
    try {
      const headers = await this.getAuthHeaders();
      const params: string[] = [];
      if (filters?.applicationId) params.push(`applicationId=${encodeURIComponent(filters.applicationId)}`);
      if (filters?.jobId) params.push(`jobId=${encodeURIComponent(filters.jobId)}`);
      if (filters?.status) params.push(`status=${encodeURIComponent(filters.status)}`);
      const query = params.length ? `?${params.join('&')}` : '';

      const response = await firstValueFrom(
        this.http.get<CompanyInterviewsResponse>(`${this.apiUrl}/company/interviews${query}`, { headers })
      );
      return response.interviews ?? [];
    } catch (err: any) {
      const backendError = err instanceof HttpErrorResponse ? err.error?.error : null;
      const code = backendError?.code || (err.status ? `HTTP_${err.status}` : 'UNKNOWN_ERROR');
      const message = backendError?.message || err.message || 'Failed to fetch company interviews';
      console.warn(`[InterviewsService] getCompanyInterviews backend error (${code}): ${message}`);

      // Fail closed on auth / permission errors
      if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN' || err.status === 401 || err.status === 403) {
        return [];
      }

      // Offline / development fallback to the direct Supabase query
      console.warn('[InterviewsService] getCompanyInterviews: attempting direct Supabase query fallback.');
      let query = this.supabase.client
        .from('interviews')
        .select('*, applications!inner(job_id, job_seeker_id, company_id, jobs(title), job_seeker_profiles(profile_id, profiles(full_name, avatar_url)))')
        .order('scheduled_at', { ascending: true });

      if (companyId) {
        query = query.eq('applications.company_id', companyId);
      }
      if (filters?.applicationId) {
        query = query.eq('application_id', filters.applicationId);
      }
      if (filters?.jobId) {
        query = query.eq('applications.job_id', filters.jobId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) console.error('[InterviewsService] getCompanyInterviews fallback error:', error.message);
      return (data ?? []) as any;
    }
  }

  /**
   * Retrieve a single interview with its application, candidate and job.
   * Calls Express backend GET /api/company/interviews/:interviewId.
   */
  async getInterview(interviewId: string): Promise<CompanyInterview | null> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await firstValueFrom(
        this.http.get<CompanyInterviewResponse>(`${this.apiUrl}/company/interviews/${interviewId}`, { headers })
      );
      return response.interview ?? null;
    } catch (err: any) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        return null;
      }
      const backendError = err instanceof HttpErrorResponse ? err.error?.error : null;
      console.warn(`[InterviewsService] getInterview error: ${backendError?.message || err.message}`);
      return null;
    }
  }

  /**
   * Schedule an interview on one of the company's applications.
   * Calls Express backend POST /api/company/interviews.
   *
   * The interviewer is the authenticated caller: the API derives it from the
   * verified token and never accepts one from the client.
   */
  async scheduleInterview(
    interviewData: ScheduleInterviewPayload
  ): Promise<{ data: CompanyInterview | null; error: string | null; code?: string }> {
    try {
      const headers = await this.getAuthHeaders();
      const payload = this.sanitizeInterviewPayload(interviewData as any);
      payload['application_id'] = interviewData.application_id;

      const response = await firstValueFrom(
        this.http.post<CompanyInterviewResponse>(`${this.apiUrl}/company/interviews`, payload, { headers })
      );
      return { data: response.interview ?? null, error: null };
    } catch (err: any) {
      if (err instanceof HttpErrorResponse) {
        const backendError = err.error?.error;
        const code = backendError?.code || `HTTP_${err.status}`;
        const message = backendError?.message || err.message || 'Failed to schedule interview';
        console.error('[InterviewsService] scheduleInterview error:', message);
        return { data: null, error: message, code };
      }
      return { data: null, error: err?.message || 'Network error occurred', code: 'NETWORK_ERROR' };
    }
  }

  /**
   * Update the mutable fields of an interview.
   * Calls Express backend PATCH /api/company/interviews/:interviewId.
   */
  async updateInterview(
    interviewId: string,
    updates: InterviewUpdate | Record<string, any>
  ): Promise<{ error: string | null; code?: string }> {
    try {
      const headers = await this.getAuthHeaders();
      const payload = this.sanitizeInterviewPayload(updates);
      if (Object.keys(payload).length === 0) {
        return { error: 'No valid interview fields provided for update', code: 'EMPTY_PAYLOAD' };
      }

      await firstValueFrom(
        this.http.patch<CompanyInterviewResponse>(
          `${this.apiUrl}/company/interviews/${interviewId}`,
          payload,
          { headers }
        )
      );
      return { error: null };
    } catch (err: any) {
      if (err instanceof HttpErrorResponse) {
        const backendError = err.error?.error;
        const code = backendError?.code || `HTTP_${err.status}`;
        const message = backendError?.message || err.message || 'Failed to update interview';
        console.error('[InterviewsService] updateInterview error:', message);
        return { error: message, code };
      }
      return { error: err?.message || 'Network error occurred', code: 'NETWORK_ERROR' };
    }
  }

  /**
   * Update the status of an interview (scheduled, completed, cancelled,
   * rescheduled). Calls Express backend
   * PATCH /api/company/interviews/:interviewId/status.
   */
  async updateInterviewStatus(
    interviewId: string,
    status: InterviewStatusValue | string
  ): Promise<{ error: string | null; code?: string; interview?: CompanyInterview }> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await firstValueFrom(
        this.http.patch<CompanyInterviewResponse>(
          `${this.apiUrl}/company/interviews/${interviewId}/status`,
          { status },
          { headers }
        )
      );
      return { error: null, interview: response.interview ?? undefined };
    } catch (err: any) {
      if (err instanceof HttpErrorResponse) {
        const backendError = err.error?.error;
        const code = backendError?.code || `HTTP_${err.status}`;
        const message = backendError?.message || err.message || 'Failed to update interview status';
        console.error('[InterviewsService] updateInterviewStatus error:', message);
        return { error: message, code };
      }
      return { error: err?.message || 'Network error occurred', code: 'NETWORK_ERROR' };
    }
  }

  /**
   * Cancel an interview. Cancellation is the `cancelled` status of the
   * interview, not a separate record.
   */
  async cancelInterview(interviewId: string): Promise<{ error: string | null; code?: string }> {
    const result = await this.updateInterviewStatus(interviewId, 'cancelled');
    return { error: result.error, code: result.code };
  }

  // ── Job Seeker Interviews (Direct Supabase) ───────────────────────────────

  async getJobSeekerInterviews(jobSeekerId: string): Promise<(InterviewRow & { application: any })[]> {
    const { data, error } = await this.supabase.client
      .from('interviews')
      .select('*, applications!inner(job_id, company_id, job_seeker_id, jobs(title), companies(name, logo_url))')
      .eq('applications.job_seeker_id', jobSeekerId)
      .order('scheduled_at', { ascending: true });
    if (error) console.error('[InterviewsService] getJobSeekerInterviews:', error.message);
    return (data ?? []) as any;
  }
}
