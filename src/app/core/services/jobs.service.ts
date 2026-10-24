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
      .select('*, job_skills(skill_id, is_required, skills(name)), job_requirements(id, requirement, is_required), job_benefits(id, benefit)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) console.error('[JobsService] getCompanyJobs:', error.message);
    return (data ?? []) as any;
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

  /**
   * Generic job status update used by the job-list UI.
   */
  async updateJobStatus(
    jobId: string,
    status: JobRow['status']
  ): Promise<{ error: string | null }> {
    const { error } = await this.supabase.client
      .from('jobs')
      .update({ status })
      .eq('id', jobId);
    if (error) return { error: error.message };
    return { error: null };
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

