import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthService } from './auth.service';
import { Database } from '../models/database.types';
import { environment } from '../../../environments/environment';

export type CompanyRow = Database['public']['Tables']['companies']['Row'];
export type CompanyInsert = Database['public']['Tables']['companies']['Insert'];
export type CompanyMemberRow = Database['public']['Tables']['company_members']['Row'];

export interface CompanyMembershipInfo {
  id: string;
  role: string;
  company_id: string;
  company: CompanyRow | null;
}

export interface CompanyProfileResponse {
  status: string;
  userRole?: string;
  membership: CompanyMembershipInfo | null;
  message?: string;
}

const ALLOWED_PROFILE_KEYS = new Set([
  'name',
  'description',
  'industry',
  'website',
  'company_size',
  'founded_year',
  'logo_url',
  'email',
  'phone',
  'location',
  'city',
  'state',
  'country',
]);

const ALLOWED_UPDATE_KEYS = new Set([
  ...ALLOWED_PROFILE_KEYS,
  'onboarding_completed',
  'completion_percentage',
]);

function isValidHttpUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * CompanyService — manages companies and company_members.
 *
 * Integrates with the Express backend for company profile operations:
 * - GET   /api/company/profile
 * - POST  /api/company/profile
 * - PATCH /api/company/:companyId/profile
 *
 * Retains direct Supabase integration for company logos (Storage)
 * and team-member management where backend endpoints do not exist.
 */
@Injectable({
  providedIn: 'root',
})
export class CompanyService {
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

  private sanitizeProfilePayload(
    input: Record<string, any>,
    allowedKeys: Set<string>
  ): Record<string, any> {
    const payload: Record<string, any> = {};

    // Map size -> company_size if present
    const source = { ...input };
    if (source['size'] && !source['company_size']) {
      source['company_size'] = source['size'];
    }

    for (const [key, val] of Object.entries(source)) {
      if (!allowedKeys.has(key)) continue;
      if (val === undefined) continue;

      if (key === 'founded_year') {
        const yr = typeof val === 'number' ? val : parseInt(String(val), 10);
        if (!isNaN(yr) && yr > 1600) payload[key] = yr;
        continue;
      }

      if (key === 'completion_percentage') {
        const pct = typeof val === 'number' ? Math.round(val) : parseInt(String(val), 10);
        if (!isNaN(pct) && pct >= 0 && pct <= 100) payload[key] = pct;
        continue;
      }

      if (key === 'onboarding_completed') {
        payload[key] = Boolean(val);
        continue;
      }

      if (key === 'website' || key === 'logo_url') {
        if (typeof val === 'string' && isValidHttpUrl(val.trim())) {
          payload[key] = val.trim();
        } else if (val === null) {
          payload[key] = null;
        }
        continue;
      }

      if (typeof val === 'string') {
        const trimmed = val.trim();
        payload[key] = trimmed.length > 0 ? trimmed : null;
      } else {
        payload[key] = val;
      }
    }

    return payload;
  }

  // ── Companies API (Express backend) ───────────────────────────────────────

  /**
   * Retrieve the caller's active company membership and company profile
   * from the Express backend (GET /api/company/profile).
   */
  async getCompanyProfile(): Promise<{
    membership: CompanyMembershipInfo | null;
    error: string | null;
    code?: string;
  }> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await firstValueFrom(
        this.http.get<CompanyProfileResponse>(`${this.apiUrl}/company/profile`, { headers })
      );
      return { membership: response.membership, error: null };
    } catch (err: any) {
      const backendError = err instanceof HttpErrorResponse ? err.error?.error : null;
      const code = backendError?.code || (err.status ? `HTTP_${err.status}` : 'UNKNOWN_ERROR');
      const message = backendError?.message || err.message || 'Failed to fetch company profile';
      console.error('[CompanyService] getCompanyProfile error:', message);
      return { membership: null, error: message, code };
    }
  }

  /**
   * Get the company for a given profile.
   * Calls the Express API first; falls back to direct Supabase query if unauthenticated or offline.
   */
  async getCompanyForProfile(profileId: string): Promise<CompanyRow | null> {
    const apiResult = await this.getCompanyProfile();
    if (apiResult.membership?.company) {
      return apiResult.membership.company;
    }

    // If backend verified user has no company, authoritatively return null
    if (!apiResult.error && apiResult.membership === null) {
      return null;
    }

    // If backend rejected request due to auth or permissions, fail closed (never bypass)
    if (
      apiResult.code === 'UNAUTHORIZED' ||
      apiResult.code === 'FORBIDDEN' ||
      apiResult.code === 'PROFILE_REQUIRED'
    ) {
      console.warn(`[CompanyService] getCompanyForProfile rejected by backend (${apiResult.code}): ${apiResult.error}`);
      return null;
    }

    // Only fallback if the Express server is offline/unreachable during local development
    console.warn(`[CompanyService] Express backend unreachable (${apiResult.code}). Attempting read-only fallback.`);
    const { data, error } = await this.supabase.client
      .from('company_members')
      .select('company_id, companies(*)')
      .eq('profile_id', profileId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) console.error('[CompanyService] getCompanyForProfile fallback error:', error.message);
    return (data as any)?.companies ?? null;
  }

  /**
   * Direct fetch of a single company row by ID (Supabase PostgREST).
   */
  async getCompany(companyId: string): Promise<CompanyRow | null> {
    const { data, error } = await this.supabase.client
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();
    if (error) console.error('[CompanyService] getCompany:', error.message);
    return data;
  }

  /**
   * Create a company and establish caller as owner via Express backend
   * (POST /api/company/profile).
   */
  async createCompany(
    profileId: string,
    companyData: Partial<CompanyInsert> | Record<string, any>
  ): Promise<{ companyId: string | null; error: string | null; code?: string }> {
    try {
      const headers = await this.getAuthHeaders();
      const payload = this.sanitizeProfilePayload(companyData, ALLOWED_PROFILE_KEYS);

      const response = await firstValueFrom(
        this.http.post<{ status: string; membership: CompanyMembershipInfo }>(
          `${this.apiUrl}/company/profile`,
          payload,
          { headers }
        )
      );

      const companyId = response.membership?.company_id ?? response.membership?.company?.id ?? null;
      return { companyId, error: null };
    } catch (err: any) {
      if (err instanceof HttpErrorResponse) {
        const backendError = err.error?.error;
        const code = backendError?.code || `HTTP_${err.status}`;
        const message = backendError?.message || err.message || 'Failed to create company';
        return { companyId: null, error: message, code };
      }
      return { companyId: null, error: err?.message || 'Network error occurred', code: 'NETWORK_ERROR' };
    }
  }

  /**
   * Update company profile fields via Express backend
   * (PATCH /api/company/:companyId/profile).
   */
  async updateCompany(
    companyId: string,
    updates: Partial<Omit<CompanyRow, 'id' | 'created_at' | 'updated_at'>> | Record<string, any>
  ): Promise<{ error: string | null; code?: string; company?: CompanyRow }> {
    try {
      const headers = await this.getAuthHeaders();
      const payload = this.sanitizeProfilePayload(updates, ALLOWED_UPDATE_KEYS);

      if (Object.keys(payload).length === 0) {
        return { error: 'No valid profile fields provided for update', code: 'EMPTY_PAYLOAD' };
      }

      const response = await firstValueFrom(
        this.http.patch<{ status: string; company: CompanyRow }>(
          `${this.apiUrl}/company/${companyId}/profile`,
          payload,
          { headers }
        )
      );

      return { error: null, company: response.company };
    } catch (err: any) {
      if (err instanceof HttpErrorResponse) {
        const backendError = err.error?.error;
        const code = backendError?.code || `HTTP_${err.status}`;
        const message = backendError?.message || err.message || 'Failed to update company';
        return { error: message, code };
      }
      return { error: err?.message || 'Network error occurred', code: 'NETWORK_ERROR' };
    }
  }

  /**
   * Upload a company logo and update logo_url.
   * Files stored at: company-logos/{companyId}/logo.{ext}
   */
  async uploadLogo(
    companyId: string,
    file: File
  ): Promise<{ publicUrl: string | null; error: string | null }> {
    const ext = file.name.split('.').pop();
    const filePath = `${companyId}/logo.${ext}`;

    const { error: storageError } = await this.supabase.client.storage
      .from('company-logos')
      .upload(filePath, file, { upsert: true });

    if (storageError) return { publicUrl: null, error: storageError.message };

    const { data } = this.supabase.client.storage
      .from('company-logos')
      .getPublicUrl(filePath);

    await this.updateCompany(companyId, { logo_url: data.publicUrl });
    return { publicUrl: data.publicUrl, error: null };
  }

  // ── Team Members (Supabase PostgREST) ─────────────────────────────────────

  async getTeamMembers(companyId: string): Promise<(CompanyMemberRow & { profile: any })[]> {
    const { data, error } = await this.supabase.client
      .from('company_members')
      .select('*, profiles(*)')
      .eq('company_id', companyId)
      .order('created_at');
    if (error) console.error('[CompanyService] getTeamMembers:', error.message);
    return (data ?? []) as any;
  }

  async getMemberRole(
    companyId: string,
    profileId: string
  ): Promise<CompanyMemberRow['role'] | null> {
    const { data, error } = await this.supabase.client
      .from('company_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('profile_id', profileId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) return null;
    return data?.role ?? null;
  }

  async updateMemberRole(
    memberId: string,
    role: CompanyMemberRow['role']
  ): Promise<void> {
    await this.supabase.client
      .from('company_members')
      .update({ role })
      .eq('id', memberId);
  }

  async deactivateMember(memberId: string): Promise<void> {
    await this.supabase.client
      .from('company_members')
      .update({ is_active: false })
      .eq('id', memberId);
  }
}
