// Load and validate server environment before any Supabase client is created.
// Import this module first from server entrypoints and from supabase-server.js.
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'

config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })

/**
 * Return a required env var or throw (never log the value).
 */
export function requireEnv(name) {
  const value = process.env[name]
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}
