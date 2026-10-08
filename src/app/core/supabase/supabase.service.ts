import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { Database } from '../models/database.types';

/**
 * Core Supabase client service.
 *
 * This is the SINGLE point of Supabase client initialization for the entire
 * Angular application. No component or service should call createClient()
 * directly. Inject SupabaseService instead.
 *
 * The anon key used here is safe for browser usage. The service-role key
 * MUST NOT be used in frontend code.
 */
@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  readonly client: SupabaseClient<Database>;

  constructor() {
    const url = environment.supabase?.url;
    const anonKey = environment.supabase?.anonKey;

    if (!url || !anonKey) {
      console.error(
        'Supabase client initialization error: Missing URL or Anon Key in environment.'
      );
    }

    this.client = createClient<Database>(
      url || '',
      anonKey || '',
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );
  }
}
