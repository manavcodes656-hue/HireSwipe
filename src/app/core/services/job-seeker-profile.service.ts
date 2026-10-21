import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { Database } from '../models/database.types';

type JobSeekerProfileRow = Database['public']['Tables']['job_seeker_profiles']['Row'];
type JobSeekerProfileInsert = Database['public']['Tables']['job_seeker_profiles']['Insert'];
type JobSeekerProfileUpdate = Database['public']['Tables']['job_seeker_profiles']['Update'];
type EducationRow = Database['public']['Tables']['education']['Row'];
type ExperienceRow = Database['public']['Tables']['experience']['Row'];
type ResumeRow = Database['public']['Tables']['resumes']['Row'];
type JobSeekerSkillRow = Database['public']['Tables']['job_seeker_skills']['Row'];
type JobSeekerPreferenceRow = Database['public']['Tables']['job_seeker_preferences']['Row'];

/**
 * JobSeekerProfileService — manages all job-seeker-domain tables.
 *
 * RLS ensures each job seeker can only access/modify their own records.
 * Company members can view education/experience/skills of applicants/matches.
 */
@Injectable({
  providedIn: 'root',
})
export class JobSeekerProfileService {
  private readonly supabase = inject(SupabaseService);

  // ── Job Seeker Profiles ──────────────────────────────────────────────────

  async getJobSeekerProfile(profileId: string): Promise<JobSeekerProfileRow | null> {
    const { data, error } = await this.supabase.client
      .from('job_seeker_profiles')
      .select('*')
      .eq('profile_id', profileId)
      .maybeSingle();
    if (error) console.error('[JobSeekerProfileService]', error.message);
    return data;
  }

  async upsertJobSeekerProfile(
    profileId: string,
    data: Omit<JobSeekerProfileInsert, 'id' | 'profile_id' | 'created_at' | 'updated_at'>
  ): Promise<{ data: JobSeekerProfileRow | null; error: string | null }> {
    const { data: result, error } = await this.supabase.client
      .from('job_seeker_profiles')
      .upsert({ profile_id: profileId, ...data }, { onConflict: 'profile_id' })
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: result, error: null };
  }

  // ── Resumes ──────────────────────────────────────────────────────────────

  async getResumes(jobSeekerId: string): Promise<ResumeRow[]> {
    const { data, error } = await this.supabase.client
      .from('resumes')
      .select('*')
      .eq('job_seeker_id', jobSeekerId)
      .order('created_at', { ascending: false });
    if (error) console.error('[JobSeekerProfileService] getResumes:', error.message);
    return data ?? [];
  }

  async uploadResume(
    userId: string,
    jobSeekerId: string,
    file: File
  ): Promise<{ data: ResumeRow | null; error: string | null }> {
    const filePath = `${userId}/${Date.now()}_${file.name}`;

    const { error: storageError } = await this.supabase.client.storage
      .from('resumes')
      .upload(filePath, file, { upsert: false });

    if (storageError) return { data: null, error: storageError.message };

    const existingResumes = await this.getResumes(jobSeekerId);
    const isPrimary = existingResumes.length === 0;

    const { data, error } = await this.supabase.client
      .from('resumes')
      .insert({
        job_seeker_id: jobSeekerId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
        is_primary: isPrimary,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  }

  async setPrimaryResume(resumeId: string, jobSeekerId: string): Promise<void> {
    // Unset all, then set chosen
    await this.supabase.client
      .from('resumes')
      .update({ is_primary: false })
      .eq('job_seeker_id', jobSeekerId);
    await this.supabase.client
      .from('resumes')
      .update({ is_primary: true })
      .eq('id', resumeId);
  }

  async deleteResume(resumeId: string, filePath: string): Promise<void> {
    await this.supabase.client.storage.from('resumes').remove([filePath]);
    await this.supabase.client.from('resumes').delete().eq('id', resumeId);
  }

  // ── Education ────────────────────────────────────────────────────────────

  async getEducation(jobSeekerId: string): Promise<EducationRow[]> {
    const { data, error } = await this.supabase.client
      .from('education')
      .select('*')
      .eq('job_seeker_id', jobSeekerId)
      .order('start_date', { ascending: false });
    if (error) console.error('[JobSeekerProfileService] getEducation:', error.message);
    return data ?? [];
  }

  async addEducation(
    jobSeekerId: string,
    education: Omit<EducationRow, 'id' | 'job_seeker_id' | 'created_at' | 'updated_at'>
  ): Promise<{ data: EducationRow | null; error: string | null }> {
    const { data, error } = await this.supabase.client
      .from('education')
      .insert({ job_seeker_id: jobSeekerId, ...education })
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data, error: null };
  }

  async updateEducation(id: string, updates: Partial<Omit<EducationRow, 'id' | 'job_seeker_id'>>): Promise<void> {
    await this.supabase.client.from('education').update(updates).eq('id', id);
  }

  async deleteEducation(id: string): Promise<void> {
    await this.supabase.client.from('education').delete().eq('id', id);
  }

  // ── Experience ───────────────────────────────────────────────────────────

  async getExperience(jobSeekerId: string): Promise<ExperienceRow[]> {
    const { data, error } = await this.supabase.client
      .from('experience')
      .select('*')
      .eq('job_seeker_id', jobSeekerId)
      .order('start_date', { ascending: false });
    if (error) console.error('[JobSeekerProfileService] getExperience:', error.message);
    return data ?? [];
  }

  async addExperience(
    jobSeekerId: string,
    experience: Omit<ExperienceRow, 'id' | 'job_seeker_id' | 'created_at' | 'updated_at'>
  ): Promise<{ data: ExperienceRow | null; error: string | null }> {
    const { data, error } = await this.supabase.client
      .from('experience')
      .insert({ job_seeker_id: jobSeekerId, ...experience })
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data, error: null };
  }

  async updateExperience(id: string, updates: Partial<Omit<ExperienceRow, 'id' | 'job_seeker_id'>>): Promise<void> {
    await this.supabase.client.from('experience').update(updates).eq('id', id);
  }

  async deleteExperience(id: string): Promise<void> {
    await this.supabase.client.from('experience').delete().eq('id', id);
  }

  // ── Skills ───────────────────────────────────────────────────────────────

  async getUserSkills(jobSeekerId: string): Promise<(JobSeekerSkillRow & { skill_name: string })[]> {
    const { data, error } = await this.supabase.client
      .from('job_seeker_skills')
      .select('*, skills(name)')
      .eq('job_seeker_id', jobSeekerId);
    if (error) console.error('[JobSeekerProfileService] getUserSkills:', error.message);
    return (data ?? []).map((row: any) => ({
      ...row,
      skill_name: row.skills?.name ?? '',
    }));
  }

  async addUserSkill(
    jobSeekerId: string,
    skillId: string,
    proficiencyLevel: JobSeekerSkillRow['proficiency_level'],
    yearsExperience?: number
  ): Promise<void> {
    await this.supabase.client
      .from('job_seeker_skills')
      .upsert({ job_seeker_id: jobSeekerId, skill_id: skillId, proficiency_level: proficiencyLevel, years_experience: yearsExperience ?? null });
  }

  async removeUserSkill(jobSeekerId: string, skillId: string): Promise<void> {
    await this.supabase.client
      .from('job_seeker_skills')
      .delete()
      .eq('job_seeker_id', jobSeekerId)
      .eq('skill_id', skillId);
  }

  async getSkillsCatalog(): Promise<{ id: string; name: string; category: string | null }[]> {
    const { data, error } = await this.supabase.client
      .from('skills')
      .select('id, name, category')
      .order('name');
    if (error) console.error('[JobSeekerProfileService] getSkillsCatalog:', error.message);
    return data ?? [];
  }

  // ── Preferences ──────────────────────────────────────────────────────────

  async getPreferences(jobSeekerId: string): Promise<JobSeekerPreferenceRow | null> {
    const { data, error } = await this.supabase.client
      .from('job_seeker_preferences')
      .select('*')
      .eq('job_seeker_id', jobSeekerId)
      .maybeSingle();
    if (error) console.error('[JobSeekerProfileService] getPreferences:', error.message);
    return data;
  }

  async upsertPreferences(
    jobSeekerId: string,
    prefs: Partial<Omit<JobSeekerPreferenceRow, 'id' | 'job_seeker_id' | 'created_at' | 'updated_at'>>
  ): Promise<void> {
    await this.supabase.client
      .from('job_seeker_preferences')
      .upsert({ job_seeker_id: jobSeekerId, ...prefs }, { onConflict: 'job_seeker_id' });
  }
}
