import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { Database } from '../models/database.types';

type CompanyRow = Database['public']['Tables']['companies']['Row'];
type CompanyInsert = Database['public']['Tables']['companies']['Insert'];
type CompanyUpdate = Database['public']['Tables']['companies']['Update'];
type CompanyMemberRow = Database['public']['Tables']['company_members']['Row'];

/**
 * CompanyService — manages companies and company_members tables.
 *
 * RLS policies:
 * - Any authenticated user can read companies.
 * - Any authenticated user can create a company (during onboarding).
 * - Only company members can update their company.
 * - Only company owners/admins can manage team members.
 */
@Injectable({
  providedIn: 'root',
})
export class CompanyService {
  private readonly supabase = inject(SupabaseService);

  // ── Companies ─────────────────────────────────────────────────────────────

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
   * Get the company for a given profile (via company_members).
   */
  async getCompanyForProfile(profileId: string): Promise<CompanyRow | null> {
    const { data, error } = await this.supabase.client
      .from('company_members')
      .select('company_id, companies(*)')
      .eq('profile_id', profileId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (error) console.error('[CompanyService] getCompanyForProfile:', error.message);
    return (data as any)?.companies ?? null;
  }

  /**
   * Create a company and add the creator as owner.
   * Used during company onboarding.
   */
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
  }

  async updateCompany(
    companyId: string,
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

  // ── Team Members ──────────────────────────────────────────────────────────

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
