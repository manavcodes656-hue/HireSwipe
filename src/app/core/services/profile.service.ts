import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { Database } from '../models/database.types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

/**
 * ProfileService — manages the public.profiles table.
 *
 * Profiles are automatically created by the on_auth_user_created trigger.
 * This service provides read and update operations.
 * RLS ensures users can only update their own profile.
 */
@Injectable({
  providedIn: 'root',
})
export class ProfileService {
  private readonly supabase = inject(SupabaseService);

  /**
   * Fetch the profile for a given auth user ID.
   */
  async getProfile(userId: string): Promise<ProfileRow | null> {
    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[ProfileService] getProfile error:', error.message);
      return null;
    }
    return data;
  }

  /**
   * Update the current user's profile.
   * RLS enforces that only the owner can update their own row.
   */
  async updateProfile(
    userId: string,
    updates: ProfileUpdate
  ): Promise<{ error: string | null }> {
    const { error } = await this.supabase.client
      .from('profiles')
      .update(updates)
      .eq('id', userId);

    if (error) {
      console.error('[ProfileService] updateProfile error:', error.message);
      return { error: error.message };
    }
    return { error: null };
  }

  /**
   * Upload an avatar file and update avatar_url on the profile.
   * Files are stored at: avatars/{userId}/{filename}
   */
  async uploadAvatar(
    userId: string,
    file: File
  ): Promise<{ publicUrl: string | null; error: string | null }> {
    const ext = file.name.split('.').pop();
    const filePath = `${userId}/avatar.${ext}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      return { publicUrl: null, error: uploadError.message };
    }

    const { data } = this.supabase.client.storage
      .from('avatars')
      .getPublicUrl(filePath);

    // Update the profile record with the new URL
    await this.updateProfile(userId, { avatar_url: data.publicUrl });
    return { publicUrl: data.publicUrl, error: null };
  }
}
