// Static guard for supabase/migrations/006_company_interest.sql. It reads the SQL
// text only (no database): it keeps the migration in step with the endpoint's
// queries and with the restrictions of this step. It proves nothing about RLS or
// trigger runtime behaviour; that needs the disposable-database tests.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const raw = readFileSync(path.join(dir, '..', 'supabase', 'migrations', '006_company_interest.sql'), 'utf8')
const routes = readFileSync(path.join(dir, 'company-routes.js'), 'utf8')

// Code only: drop `--` comments (the header legitimately mentions matches etc.)
// and collapse whitespace.
const sql = raw
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .replace(/\s+/g, ' ')

describe('006_company_interest.sql matches the endpoint', () => {
  it('has every column the endpoint selects and inserts', () => {
    const columns = routes.match(/const INTEREST_COLUMNS = '([^']+)'/)[1].split(',').map((c) => c.trim())
    expect(columns).toEqual(['id', 'application_id', 'expressed_by', 'created_at'])
    for (const column of columns) expect(sql).toContain(` ${column} `)
  })

  it('creates public.company_interest with one row per application', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.company_interest')
    expect(sql).toContain('id UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    expect(sql).toContain('application_id UUID NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE')
    expect(sql).toContain('expressed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL')
    expect(sql).toContain('created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()')
    expect(sql).toContain("COMMENT ON TABLE public.company_interest IS")
  })

  it('does not duplicate job, company or candidate ids on the table', () => {
    const table = sql.match(/CREATE TABLE IF NOT EXISTS public\.company_interest \((.*?)\); COMMENT/)[1]
    expect(table).not.toMatch(/job_id|company_id|job_seeker_id/)
  })
})

describe('006_company_interest.sql security', () => {
  it('enables RLS and revokes everything before granting SELECT, INSERT to authenticated only', () => {
    expect(sql).toContain('ALTER TABLE public.company_interest ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL ON public.company_interest FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('GRANT SELECT, INSERT ON public.company_interest TO authenticated')
    expect(sql).not.toMatch(/GRANT [^;]*\bTO (anon|PUBLIC)\b/)
    expect(sql).not.toMatch(/FORCE ROW LEVEL SECURITY/)
  })

  it('defines only SELECT and INSERT policies, both for authenticated', () => {
    const policies = [...sql.matchAll(/CREATE POLICY "[^"]+" ON public\.company_interest FOR (\w+) TO (\w+)/g)]
    expect(policies.map((m) => [m[1], m[2]]).sort()).toEqual([['INSERT', 'authenticated'], ['SELECT', 'authenticated']])
  })

  it('requires identity, company role, active membership, open application and published job on insert', () => {
    const insert = sql.match(/FOR INSERT TO authenticated WITH CHECK \((.*?)\); -- ?/)?.[1] ?? sql.split('FOR INSERT TO authenticated WITH CHECK')[1]
    expect(insert).toContain('expressed_by = (SELECT auth.uid())')
    expect(insert).toContain("public.has_profile_role(ARRAY['company']::public.user_role[])")
    expect(insert).toContain('public.is_company_member(a.company_id, (SELECT auth.uid()))')
    expect(insert).toContain("a.status <> 'withdrawn'")
    expect(insert).toContain("j.status = 'published'")
    expect(insert).toContain('j.company_id = a.company_id')
    expect(insert).toContain('a.id = public.company_interest.application_id')
  })

  it('limits reads to active members of the application\'s company', () => {
    const select = sql.split('FOR SELECT TO authenticated USING')[1].split('DROP POLICY')[0]
    expect(select).toContain('public.is_company_member(a.company_id, (SELECT auth.uid()))')
    expect(select).not.toContain('is_admin')
  })

  it('pins search_path and revokes EXECUTE on the guard function', () => {
    expect(sql).toContain('SET search_path = public, pg_temp')
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.prevent_company_interest_update() FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('BEFORE UPDATE ON public.company_interest')
  })
})

describe('006_company_interest.sql restrictions', () => {
  it('does not touch matching, conversations, notifications or applications', () => {
    expect(sql).not.toMatch(/check_and_create_match|create_conversation_for_match|create_match|on_job_swipe_created|on_match_created/)
    expect(sql).not.toMatch(/(INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE) public\.(matches|conversations|conversation_members|messages|notifications|applications|jobs|job_swipes)/)
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.(check_and_create_match|create_conversation_for_match)/)
  })

  it('creates only the company_interest table, its index, guard function and guard trigger', () => {
    expect([...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([\w.]+)/g)].map((m) => m[1])).toEqual(['public.company_interest'])
    expect([...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION ([\w.]+)/g)].map((m) => m[1])).toEqual(['public.prevent_company_interest_update'])
    expect([...sql.matchAll(/CREATE TRIGGER (\w+)/g)].map((m) => m[1])).toEqual(['trg_prevent_company_interest_update'])
  })

  it('is re-runnable: every policy and trigger is dropped by name first', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Company members view interest on their applications" ON public.company_interest')
    expect(sql).toContain('DROP POLICY IF EXISTS "Company members express interest on their applications" ON public.company_interest')
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_prevent_company_interest_update ON public.company_interest')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_company_interest_expressed_by')
  })
})
