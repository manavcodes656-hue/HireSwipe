// Server-side Supabase clients. This file is server-only and never sent to the
// browser or Angular.
//
// - `supabase` uses the service role key: full database access, bypasses RLS.
//   Keep it for trusted server-side tasks (token verification, role lookup,
//   authorization checks on verified identities, background jobs).
// - `createUserClient(token)` acts as the signed-in user: requests carry the
//   user's access token, so PostgreSQL evaluates RLS policies and triggers with
//   that user's auth.uid(). Use it for everything a user does through the API.

import './load-env.js'
import { createClient } from '@supabase/supabase-js'
import { requireEnv } from './load-env.js'

const supabaseUrl = requireEnv('SUPABASE_URL')
const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const publishableKey = requireEnv('SUPABASE_PUBLISHABLE_KEY')

export const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    storage: null,
    flowType: 'pkce',
  },
})

/**
 * Supabase client scoped to one request's user. Pass only a token that
 * authenticateToken has already verified. One client per request; nothing is
 * cached or persisted.
 */
export function createUserClient(accessToken) {
  if (!accessToken) {
    throw new Error('createUserClient requires an access token')
  }
  return createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      storage: null,
    },
  })
}
