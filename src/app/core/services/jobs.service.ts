import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { Database } from '../models/database.types';

type JobRow = Database['public']['Tables']['jobs']['Row'];
type JobInsert = Database['public']['Tables']['jobs']['Insert'];
type JobSkillRow = Database['public']['Tables']['job_skills']['Row'];
type JobRequirementRow = Database['public']['Tables']['job_requirements']['Row'];
type JobBenefitRow = Database['public']['Tables']['job_benefits']['Row'];

/**
 * JobsService — manages jobs, job_skills, job_requirements, job_benefits.
 *
 * RLS policies:
 * - Published jobs are visible to all authenticated users.
 * - Company members can manage (CRUD) their own company's jobs.
 * - Draft/paused/closed jobs are only visible to company members.
 */
@Injectable({
  providedIn: 'root',
})
export class JobsService {
  private readonly supabase = inject(SupabaseService);

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
   */
  async getCompanyJobs(companyId: string): Promise<JobRow[]> {
    const { data, error } = await this.supabase.client
      .from('jobs')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) console.error('[JobsService] getCompanyJobs:', error.message);
    return data ?? [];
  }

  async getJob(jobId: string): Promise<JobRow | null> {
    const { data, error } = await this.supabase.client
      .from('jobs')
      .select('*, companies(name, logo_url, industry, location), job_skills(*, skills(name)), job_requirements(*), job_benefits(*)')
      .eq('id', jobId)
      .single();
    if (error) console.error('[JobsService] getJob:', error.message);
    return data as any;
  }

  async createJob(
    companyId: string,
    createdBy: string,
    jobData: Omit<JobInsert, 'id' | 'company_id' | 'created_by' | 'created_at' | 'updated_at'>
  ): Promise<{ jobId: string | null; error: string | null }> {
    const { data, error } = await this.supabase.client
      .from('jobs')
      .insert({ company_id: companyId, created_by: createdBy, ...jobData })
      .select()
      .single();
    if (error) return { jobId: null, error: error.message };
    return { jobId: data.id, error: null };
  }

  async updateJob(
    jobId: string,
    updates: Partial<Omit<JobRow, 'id' | 'company_id' | 'created_at' | 'updated_at'>>
  ): Promise<{ error: string | null }> {
    const { error } = await this.supabase.client
      .from('jobs')
      .update(updates)
      .eq('id', jobId);
    if (error) return { error: error.message };
    return { error: null };
  }

  async publishJob(jobId: string): Promise<void> {
    await this.supabase.client.from('jobs').update({ status: 'published' }).eq('id', jobId);
  }

  async pauseJob(jobId: string): Promise<void> {
    await this.supabase.client.from('jobs').update({ status: 'paused' }).eq('id', jobId);
  }

  async closeJob(jobId: string): Promise<void> {
    await this.supabase.client.from('jobs').update({ status: 'closed' }).eq('id', jobId);
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
  ): Promise<void> {
    // Delete existing and re-insert
    await this.supabase.client.from('job_skills').delete().eq('job_id', jobId);
    if (skills.length > 0) {
      await this.supabase.client.from('job_skills').insert(
        skills.map((s) => ({ job_id: jobId, ...s }))
      );
    }
  }

  // ── Job Requirements ──────────────────────────────────────────────────────

  async setJobRequirements(jobId: string, requirements: string[]): Promise<void> {
    await this.supabase.client.from('job_requirements').delete().eq('job_id', jobId);
    if (requirements.length > 0) {
      await this.supabase.client.from('job_requirements').insert(
        requirements.map((req) => ({ job_id: jobId, requirement: req, is_required: true }))
      );
    }
  }

  // ── Job Benefits ──────────────────────────────────────────────────────────

  async setJobBenefits(jobId: string, benefits: string[]): Promise<void> {
    await this.supabase.client.from('job_benefits').delete().eq('job_id', jobId);
    if (benefits.length > 0) {
      await this.supabase.client.from('job_benefits').insert(
        benefits.map((b) => ({ job_id: jobId, benefit: b }))
      );
    }
  }
}
