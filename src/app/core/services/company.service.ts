import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthService } from './auth.service';
import { Database } from '../models/database.types';
import { environment } from '../../../environments/environment';

 feature/backend-foundation
type CompanyRow = Database['public']['Tables']['companies']['Row'];
type CompanyInsert = Database['public']['Tables']['companies']['Insert'];
type CompanyUpdate = Database['public']['Tables']['companies']['Update'];
type CompanyMemberRow = Database['public']['Tables']['company_members']['Row'];

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
 main

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
 feature/backend-foundation
  async createCompany(
    profileId: string,
    companyData: Omit<CompanyInsert, 'id' | 'created_at' | 'updated_at'> & Record<string, unknown>
  ): Promise<{ companyId: string | null; error: string | null }> {
    const insertData = CompanyService.pickCompanyColumns(companyData) as CompanyInsert;
    if (!insertData.name) {
      return { companyId: null, error: 'Company name is required' };
    }

    // Atomic: company row + caller's owner membership in one transaction (RPC
    // provided by migration 004). Prevents an ownerless company row from being
    // left behind if the membership insert fails, and serializes concurrent
    // creates per account.
    const { data: companyId, error: rpcError } = await this.supabase.client.rpc('create_company_with_owner', {
      p_company: insertData,
    });
    if (rpcError) return { companyId: null, error: rpcError.message };
    if (!companyId) {
      return { companyId: null, error: 'Company could not be created.' };
    }

    return { companyId: companyId as string, error: null };
  }

  /** Columns that exist on public.companies (see migrations / database.types). */
  private static readonly COMPANY_UPDATE_KEYS = new Set([
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
    'onboarding_completed',
    'completion_percentage',
  ]);

  /**
   * Keep only keys that are real columns on public.companies. UI-only fields
   * (culture, mission, values, banner_url, size alias) have no column yet —
   * see supabase/proposed/004_company_profile_fields_and_security_fixes.sql.
   */
  private static pickCompanyColumns(input: Record<string, unknown>): CompanyUpdate {
    const picked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input ?? {})) {
      if (CompanyService.COMPANY_UPDATE_KEYS.has(key) && value !== undefined) {
        picked[key] = value;
      }
    }
    return picked as CompanyUpdate;

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
 main
  }

  /**
   * Update company profile fields via Express backend
   * (PATCH /api/company/:companyId/profile).
   */
  async updateCompany(
    companyId: string,
 feature/backend-foundation
    updates: Partial<Omit<CompanyRow, 'id' | 'created_at' | 'updated_at'>> & Record<string, unknown>
  ): Promise<{ error: string | null }> {
    const safeUpdates = CompanyService.pickCompanyColumns(updates);
    if (Object.keys(safeUpdates).length === 0) {
      return { error: null };
    }

    const { data, error } = await this.supabase.client
      .from('companies')
      .update(safeUpdates)
      .eq('id', companyId)
      .select('id');
    if (error) return { error: error.message };
    // PostgREST reports success for a zero-row update (no error) when RLS
    // forbids the write, so treat "nothing matched" as a permission failure
    // instead of fabricating a saved result.
    if (!data || data.length === 0) {
      return { error: 'You do not have permission to update this company.' };
    }
    return { error: null };
  }

  /**
   * Add an existing HireSwipe profile to the company team.
   * Uses find_profile_for_team_invite() (migration 004): direct profiles lookups
   * by email are RLS-restricted to self/related users after security hardening,
   * so the RPC is the supported path. There is no invitations table — the email
   * must already belong to a company-role profiles row.
   */
  async addTeamMemberByEmail(
    companyId: string,
    email: string,
    role: CompanyMemberRow['role']
  ): Promise<{ error: string | null }> {
    const normalized = email.trim().toLowerCase();
    const { data, error: rpcError } = await this.supabase.client.rpc('find_profile_for_team_invite', {
      p_company_id: companyId,
      p_email: normalized,
    });
    if (rpcError) return { error: rpcError.message };
    const profile = (data ?? [])[0];
    if (!profile) {
      return {
        error:
          'No HireSwipe company account found for that email. Team invites require an existing registered company user (no invitation table in schema).',
      };
    }

    const { error } = await this.supabase.client.from('company_members').insert({
      company_id: companyId,
      profile_id: profile.id,
      role,
      is_active: true,
    });
    if (error) return { error: error.message };
    return { error: null };

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
 main
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

    const { error } = await this.updateCompany(companyId, { logo_url: data.publicUrl });
    if (error) return { publicUrl: null, error };
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
  ): Promise<{ error: string | null }> {
    const { error } = await this.supabase.client
      .from('company_members')
      .update({ role })
      .eq('id', memberId);
    return { error: error?.message ?? null };
  }

  /**
   * Activate or deactivate a membership. RLS + enforce_company_membership_hierarchy
   * restrict this to company owners/admins.
   */
  async setMemberActive(memberId: string, isActive: boolean): Promise<{ error: string | null }> {
    const { data, error } = await this.supabase.client
      .from('company_members')
      .update({ is_active: isActive })
      .eq('id', memberId)
      .select('id');
    if (error) return { error: error.message };
    // RLS filters rows the caller may not update; zero rows means nothing changed.
    if (!data || data.length === 0) {
      return { error: 'You do not have permission to change this team member.' };
    }
    return { error: null };
  }

  async deactivateMember(memberId: string): Promise<{ error: string | null }> {
    return this.setMemberActive(memberId, false);
  }
}
