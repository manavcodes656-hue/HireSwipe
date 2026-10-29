// Shared by db-matching.test.js (PGlite) and db-concurrency.test.js (real PostgreSQL): the Supabase
// stand-ins the migrations need, the migration loader, and hiring-flow fixtures that talk to the database
// only through the `sql` (superuser) and `as` (API role with JWT claims) functions they are given.

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations')
export const migrationFiles = readdirSync(migrationsDir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()
export const migrationSql = (prefix) => readFileSync(path.join(migrationsDir, migrationFiles.find((f) => f.startsWith(prefix))), 'utf8')

export const SUPABASE_STUBS = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE _parts text[]; BEGIN _parts := string_to_array(name, '/'); RETURN _parts[1:array_length(_parts, 1) - 1]; END $$;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
-- Supabase's default privileges: new public tables/functions are open to the API roles; RLS and REVOKEs decide access.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA auth, storage TO anon, authenticated, service_role;
`

/** Hiring-flow fixtures on top of a database connection (`sql`: superuser; `as`: API role with JWT claims). */
export function createFixtures({ sql, as }) {
  let seq = 0

  async function newUser(role, name) {
    seq += 1
    const { rows } = await sql(
      'INSERT INTO auth.users (email, raw_user_meta_data) VALUES ($1, $2) RETURNING id',
      [`${name.toLowerCase().replace(/\s+/g, '.')}.${Date.now()}.${seq}@example.test`, JSON.stringify({ role, full_name: name })]
    )
    return rows[0].id
  }

  async function newCompany(name, memberNames = []) {
    const owner = await newUser('company', `${name} Owner`)
    const { rows } = await as(owner, 'SELECT public.create_company_with_owner($1::jsonb) AS id', [JSON.stringify({ name })])
    const companyId = rows[0].id
    const members = []
    for (const memberName of memberNames) {
      const member = await newUser('company', memberName)
      await as(owner, "INSERT INTO public.company_members (company_id, profile_id, role, is_active) VALUES ($1, $2, 'recruiter', true)", [companyId, member])
      members.push(member)
    }
    return { companyId, owner, members }
  }

  async function newJob(companyId, createdBy, status = 'published') {
    const { rows } = await sql(
      `INSERT INTO public.jobs (company_id, created_by, title, description, employment_type, status, application_deadline)
       VALUES ($1, $2, 'Angular Engineer', 'Build the hiring platform', 'full_time', $3, now() + interval '30 days') RETURNING id`,
      [companyId, createdBy, status]
    )
    return rows[0].id
  }

  async function newCandidate(name) {
    const user = await newUser('job_seeker', name)
    const { rows } = await sql(
      "INSERT INTO public.job_seeker_profiles (profile_id, headline, onboarding_completed) VALUES ($1, 'Frontend Engineer', true) RETURNING id",
      [user]
    )
    return { user, seekerId: rows[0].id }
  }

  const apply = async (c, jobId, companyId) =>
    (await as(c.user, 'INSERT INTO public.applications (job_id, job_seeker_id, company_id) VALUES ($1, $2, $3) RETURNING id', [jobId, c.seekerId, companyId])).rows[0].id

  const swipe = (c, jobId, direction) =>
    as(c.user, 'INSERT INTO public.job_swipes (job_id, job_seeker_id, direction) VALUES ($1, $2, $3)', [jobId, c.seekerId, direction])

  const interest = (memberId, applicationId, expressedBy = memberId) =>
    as(memberId, 'INSERT INTO public.company_interest (application_id, expressed_by) VALUES ($1, $2) RETURNING id', [applicationId, expressedBy])

  const count = async (table, where, params) => (await sql(`SELECT count(*)::int AS n FROM public.${table} WHERE ${where}`, params)).rows[0].n
  const matchCount = (jobId, seekerId) => count('matches', 'job_id = $1 AND job_seeker_id = $2', [jobId, seekerId])
  const conversationFor = async (jobId, seekerId) =>
    (await sql('SELECT c.id FROM public.conversations c JOIN public.matches m ON m.id = c.match_id WHERE m.job_id = $1 AND m.job_seeker_id = $2', [jobId, seekerId])).rows

  /** A published job of company `A` and a candidate who has not done anything yet. */
  async function scenario(A) {
    const jobId = await newJob(A.companyId, A.owner)
    const candidate = await newCandidate('Priya Candidate')
    return { jobId, candidate }
  }

  return { newUser, newCompany, newJob, newCandidate, apply, swipe, interest, count, matchCount, conversationFor, scenario }
}
