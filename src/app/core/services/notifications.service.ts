import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { Database } from '../models/database.types';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];
type SavedJobRow = Database['public']['Tables']['saved_jobs']['Row'];

/**
 * NotificationsService — manages notifications and saved_jobs.
 *
 * RLS policies:
 * - Users can only access their own notifications and saved jobs.
 */
@Injectable({
  providedIn: 'root',
})
export class NotificationsService {
  private readonly supabase = inject(SupabaseService);

  // ── Notifications ────────────────────────────────────────────────────────

  async getNotifications(profileId: string, limit = 50): Promise<NotificationRow[]> {
    const { data, error } = await this.supabase.client
      .from('notifications')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) console.error('[NotificationsService] getNotifications:', error.message);
    return data ?? [];
  }

  async markAsRead(notificationId: string): Promise<void> {
    await this.supabase.client
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
  }

  async markAllAsRead(profileId: string): Promise<void> {
    await this.supabase.client
      .from('notifications')
      .update({ is_read: true })
      .eq('profile_id', profileId)
      .eq('is_read', false);
  }

  /**
   * Subscribe to real-time notifications for a user.
   */
  subscribeToNotifications(
    profileId: string,
    onNotification: (n: NotificationRow) => void
  ): () => void {
    const channel = this.supabase.client
      .channel(`notifications:${profileId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `profile_id=eq.${profileId}`,
        },
        (payload) => onNotification(payload.new as NotificationRow)
      )
      .subscribe();
    return () => this.supabase.client.removeChannel(channel);
  }

  // ── Saved Jobs ────────────────────────────────────────────────────────────

  async getSavedJobs(jobSeekerId: string): Promise<(SavedJobRow & { job: any })[]> {
    const { data, error } = await this.supabase.client
      .from('saved_jobs')
      .select('*, jobs(id, title, location, employment_type, remote_type, salary_min, salary_max, salary_currency, companies(name, logo_url))')
      .eq('job_seeker_id', jobSeekerId)
      .order('created_at', { ascending: false });
    if (error) console.error('[NotificationsService] getSavedJobs:', error.message);
    return (data ?? []) as any;
  }

  async saveJob(jobSeekerId: string, jobId: string): Promise<{ error: string | null }> {
    const { error } = await this.supabase.client
      .from('saved_jobs')
      .insert({ job_seeker_id: jobSeekerId, job_id: jobId });
    // Unique constraint will silently prevent duplicates via onConflict
    if (error && !error.message.includes('duplicate')) {
      return { error: error.message };
    }
    return { error: null };
  }

  async unsaveJob(jobSeekerId: string, jobId: string): Promise<void> {
    await this.supabase.client
      .from('saved_jobs')
      .delete()
      .eq('job_seeker_id', jobSeekerId)
      .eq('job_id', jobId);
  }

  async isJobSaved(jobSeekerId: string, jobId: string): Promise<boolean> {
    const { data } = await this.supabase.client
      .from('saved_jobs')
      .select('id')
      .eq('job_seeker_id', jobSeekerId)
      .eq('job_id', jobId)
      .maybeSingle();
    return !!data;
  }
}
