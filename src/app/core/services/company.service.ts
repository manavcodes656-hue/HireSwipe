import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { Database } from '../models/database.types';

type CompanyRow = Database['public']['Tables']['companies']['Row'];
type CompanyInsert = Database['public']['Tables']['companies']['Insert'];
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
    companyData: Omit<CompanyInsert, 'id' | 'created_at' | 'updated_at'>
  ): Promise<{ companyId: string | null; error: string | null }> {
    const { data: company, error: companyError } = await this.supabase.client
      .from('companies')
      .insert(companyData)
      .select()
      .single();

    if (companyError || !company) {
      return { companyId: null, error: companyError?.message ?? 'Unknown error' };
    }

    // Add creator as owner member
    const { error: memberError } = await this.supabase.client
      .from('company_members')
      .insert({
        company_id: company.id,
        profile_id: profileId,
        role: 'owner',
        is_active: true,
      });

    if (memberError) {
      console.error('[CompanyService] createCompany member insert:', memberError.message);
    }

    return { companyId: company.id, error: null };
  }

  async updateCompany(
    companyId: string,
    updates: Partial<Omit<CompanyRow, 'id' | 'created_at' | 'updated_at'>>
  ): Promise<{ error: string | null }> {
    const { error } = await this.supabase.client
      .from('companies')
      .update(updates)
      .eq('id', companyId);
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

    await this.updateCompany(companyId, { logo_url: data.publicUrl });
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
