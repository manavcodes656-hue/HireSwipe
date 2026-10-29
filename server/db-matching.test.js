// Runs the real SQL migrations (001-007) on an in-process PostgreSQL (PGlite, no Docker, no network) and
// exercises the hiring flow at database level: application -> candidate Like + company interest -> match ->
// conversation -> messages, with duplicates and authorization failures.
//
// What this proves: the migrations apply, the triggers/functions/RLS policies in the repository behave as
// described when executed as `authenticated`/`anon` with Supabase-style JWT claims.
// What it does NOT prove: anything about the live Supabase project, Realtime, PostgREST, or true concurrent
// transactions (PGlite is a single connection; see db-concurrency.test.js for those).
// Supabase-only objects (auth, storage, roles) are stubbed in test-support/db-fixtures.js.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { SUPABASE_STUBS, createFixtures, migrationFiles, migrationSql, migrationsDir } from './test-support/db-fixtures.js'

let db

/** Run SQL as the superuser (trusted context, RLS bypassed): fixtures and assertions only. */
const sql = (text, params) => db.query(text, params)

/** Run SQL as an API role with Supabase-style JWT claims, so RLS and the claim-based triggers apply. */
async function as(userId, text, params, role = 'authenticated') {
  const claims = JSON.stringify(userId ? { sub: userId, role } : { role })
  await db.exec(`SET ROLE ${role}; SELECT set_config('request.jwt.claims', '${claims}', false);`)
  try {
    return await db.query(text, params)
  } finally {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims', '', false);`)
  }
}

/** The SQLSTATE of the error a statement raises (fails the test if it succeeds). */
async function codeOf(promise) {
  try {
    await promise
  } catch (err) {
    return err.code ?? err.message
  }
  throw new Error('expected the statement to fail, but it succeeded')
}

const { newUser, newCompany, newJob, newCandidate, apply, swipe, interest, count, matchCount, conversationFor, scenario } = createFixtures({ sql, as })
const fingerprint = async () =>
  (await sql(`SELECT
      (SELECT count(*)::int FROM public.matches) AS matches,
      (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x.id), '')) FROM public.matches x) AS matches_md5,
      (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x.id), '')) FROM public.conversations x) AS conversations_md5,
      (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x.id), '')) FROM public.conversation_members x) AS members_md5,
      (SELECT md5(pg_get_functiondef('public.create_conversation_for_match()'::regprocedure))) AS conversation_fn_md5,
      (SELECT md5(pg_get_triggerdef(t.oid)) FROM pg_trigger t WHERE t.tgname = 'on_match_created') AS on_match_created_md5`)).rows[0]

const triggerNames = async () =>
  (await sql(`SELECT tgname FROM pg_trigger WHERE tgrelid IN ('public.job_swipes'::regclass, 'public.matches'::regclass, 'public.company_interest'::regclass)
              AND NOT tgisinternal ORDER BY 1`)).rows.map((r) => r.tgname)

// ── tests ─────────────────────────────────────────────────────────────────────

let A // company A: owner + two recruiters
let B // company B: owner only
let before // state captured before 007 is applied

beforeAll(async () => {
  db = new PGlite({ extensions: { uuid_ossp, pgcrypto } })
  await db.exec(SUPABASE_STUBS)
  for (const f of migrationFiles.filter((name) => !name.startsWith('007_'))) {
    try {
      await db.exec(readFileSync(path.join(migrationsDir, f), 'utf8'))
    } catch (err) {
      throw new Error(`migration ${f} failed: ${err.message}`)
    }
  }
  A = await newCompany('Acme', ['Rita Recruiter', 'Ravi Recruiter'])
  B = await newCompany('Globex')
}, 180_000)

afterAll(async () => {
  await db?.close()
})

describe('before 007: current live behaviour (migrations 001-006)', () => {
  it('a candidate Like immediately creates a match and its conversation (the one-sided behaviour 007 removes)', async () => {
    const { jobId, candidate } = await scenario(A)
    await swipe(candidate, jobId, 'like')

    expect(await matchCount(jobId, candidate.seekerId)).toBe(1)
    expect(await conversationFor(jobId, candidate.seekerId)).toHaveLength(1)
    before = await fingerprint()
    expect(before.matches).toBeGreaterThan(0)
  })
})

describe('applying 007', () => {
  it('applies, is re-runnable, and leaves existing matches, conversations and the conversation trigger untouched', async () => {
    const triggersBefore = await triggerNames()
    await db.exec(migrationSql('007_'))
    await db.exec(migrationSql('007_')) // idempotent

    expect(await fingerprint()).toEqual(before)
    const triggersAfter = await triggerNames()
    expect(triggersAfter).toEqual([...triggersBefore, 'on_company_interest_created'].sort())
    expect(triggersAfter).toEqual(expect.arrayContaining(['on_job_swipe_created', 'on_match_created', 'trg_prevent_match_key_update']))
  })

  it('keeps the matching functions out of reach of API roles', async () => {
    const { rows } = await sql(`SELECT p.proname, p.prosecdef, p.proconfig,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN ('check_and_create_match', 'create_match_if_mutual', 'create_match_on_company_interest') ORDER BY 1`)
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.prosecdef).toBe(true)
      expect(row.proconfig).toContain('search_path=public, pg_temp')
      expect([row.anon_exec, row.auth_exec]).toEqual([false, false])
    }
    const { jobId, candidate } = await scenario(A)
    expect(await codeOf(as(candidate.user, 'SELECT public.create_match_if_mutual($1, $2)', [jobId, candidate.seekerId]))).toBe('42501')
  })

  it('refuses to apply when its preconditions are not met', async () => {
    const isolated = new PGlite({ extensions: { uuid_ossp, pgcrypto } })
    try {
      await isolated.exec(SUPABASE_STUBS)
      for (const f of migrationFiles.filter((name) => /^00[1-5]_/.test(name))) await isolated.exec(readFileSync(path.join(migrationsDir, f), 'utf8'))
      // 006 (company_interest) is missing
      await expect(isolated.exec(migrationSql('007_'))).rejects.toThrow(/apply 006 first/)
      expect((await isolated.query("SELECT prosrc LIKE '%INSERT INTO public.matches%' AS old_body FROM pg_proc WHERE proname = 'check_and_create_match'")).rows[0].old_body).toBe(true)
    } finally {
      await isolated.close()
    }
  }, 120_000)
})

describe('after 007: mutual matching', () => {
  it('a candidate Like alone creates no match and no conversation', async () => {
    const { jobId, candidate } = await scenario(A)
    await apply(candidate, jobId, A.companyId)
    await swipe(candidate, jobId, 'like')

    expect(await matchCount(jobId, candidate.seekerId)).toBe(0)
    expect(await conversationFor(jobId, candidate.seekerId)).toHaveLength(0)
  })

  it('company interest alone creates no match and no conversation', async () => {
    const { jobId, candidate } = await scenario(A)
    const applicationId = await apply(candidate, jobId, A.companyId)
    await interest(A.members[0], applicationId)

    expect(await matchCount(jobId, candidate.seekerId)).toBe(0)
    expect(await conversationFor(jobId, candidate.seekerId)).toHaveLength(0)
  })

  it('a Pass followed by company interest creates no match', async () => {
    const { jobId, candidate } = await scenario(A)
    const applicationId = await apply(candidate, jobId, A.companyId)
    await swipe(candidate, jobId, 'pass')
    await interest(A.members[0], applicationId)

    expect(await matchCount(jobId, candidate.seekerId)).toBe(0)
  })

  it("the app's real order (Like, then application, then company interest) creates exactly one match, one conversation and its members", async () => {
    const { jobId, candidate } = await scenario(A)
    await swipe(candidate, jobId, 'like')
    const applicationId = await apply(candidate, jobId, A.companyId)
    expect(await matchCount(jobId, candidate.seekerId)).toBe(0)

    await interest(A.members[0], applicationId)

    expect(await matchCount(jobId, candidate.seekerId)).toBe(1)
    const conversations = await conversationFor(jobId, candidate.seekerId)
    expect(conversations).toHaveLength(1)
    const members = (await sql('SELECT profile_id FROM public.conversation_members WHERE conversation_id = $1', [conversations[0].id])).rows.map((r) => r.profile_id)
    expect(new Set(members)).toEqual(new Set([candidate.user, A.owner, ...A.members]))
  })

  it('interest recorded before the Like also creates exactly one match when the Like arrives', async () => {
    const { jobId, candidate } = await scenario(A)
    const applicationId = await apply(candidate, jobId, A.companyId)
    await interest(A.members[0], applicationId)
    expect(await matchCount(jobId, candidate.seekerId)).toBe(0)

    await swipe(candidate, jobId, 'like')

    expect(await matchCount(jobId, candidate.seekerId)).toBe(1)
    expect(await conversationFor(jobId, candidate.seekerId)).toHaveLength(1)
  })

  it('duplicate Like and duplicate interest are rejected and never add a second match or conversation', async () => {
    const { jobId, candidate } = await scenario(A)
    await swipe(candidate, jobId, 'like')
    const applicationId = await apply(candidate, jobId, A.companyId)
    await interest(A.members[0], applicationId)

    expect(await codeOf(swipe(candidate, jobId, 'like'))).toBe('23505')
    expect(await codeOf(interest(A.members[1], applicationId))).toBe('23505')
    expect(await codeOf(as(candidate.user, 'INSERT INTO public.applications (job_id, job_seeker_id, company_id) VALUES ($1, $2, $3)', [jobId, candidate.seekerId, A.companyId]))).toMatch(/23505|23514/)

    expect(await matchCount(jobId, candidate.seekerId)).toBe(1)
    expect(await conversationFor(jobId, candidate.seekerId)).toHaveLength(1)
    expect(await count('company_interest', 'application_id = $1', [applicationId])).toBe(1)
  })

  it('a withdrawn application cannot receive interest, and cannot match even if interest is forced in', async () => {
    const { jobId, candidate } = await scenario(A)
    await swipe(candidate, jobId, 'like')
    const applicationId = await apply(candidate, jobId, A.companyId)
    await as(candidate.user, "UPDATE public.applications SET status = 'withdrawn' WHERE id = $1", [applicationId])

    expect(await codeOf(interest(A.members[0], applicationId))).toBe('42501')
    await sql('INSERT INTO public.company_interest (application_id, expressed_by) VALUES ($1, $2)', [applicationId, A.members[0]]) // superuser bypasses the policy
    expect(await matchCount(jobId, candidate.seekerId)).toBe(0)
  })

  it('an unpublished job cannot receive interest and does not match', async () => {
    const { jobId, candidate } = await scenario(A)
    await swipe(candidate, jobId, 'like')
    const applicationId = await apply(candidate, jobId, A.companyId)
    await sql("UPDATE public.jobs SET status = 'paused' WHERE id = $1", [jobId])

    expect(await codeOf(interest(A.members[0], applicationId))).toBe('42501')
    await sql('INSERT INTO public.company_interest (application_id, expressed_by) VALUES ($1, $2)', [applicationId, A.members[0]])
    expect(await matchCount(jobId, candidate.seekerId)).toBe(0)
  })

  it('changing the application status never creates interest or a match', async () => {
    const { jobId, candidate } = await scenario(A)
    await swipe(candidate, jobId, 'like')
    const applicationId = await apply(candidate, jobId, A.companyId)

    await as(A.owner, "UPDATE public.applications SET status = 'shortlisted' WHERE id = $1", [applicationId])

    expect(await count('company_interest', 'application_id = $1', [applicationId])).toBe(0)
    expect(await matchCount(jobId, candidate.seekerId)).toBe(0)
  })

  it('a candidate cannot create matches or conversations directly', async () => {
    const { jobId, candidate } = await scenario(A)
    expect(await codeOf(as(candidate.user, "INSERT INTO public.matches (job_id, job_seeker_id, company_id) VALUES ($1, $2, $3)", [jobId, candidate.seekerId, A.companyId]))).toBe('42501')
    expect(await codeOf(as(candidate.user, 'INSERT INTO public.conversations (match_id) VALUES (gen_random_uuid())'))).toBe('42501')
  })
});

describe('after 007: who may record company interest', () => {
  let jobId, candidate, applicationId

  beforeAll(async () => {
    ;({ jobId, candidate } = await scenario(A))
    await swipe(candidate, jobId, 'like')
    applicationId = await apply(candidate, jobId, A.companyId)
  })

  it('rejects a member of another company, the candidate, a spoofed expressed_by, and anonymous callers', async () => {
    expect(await codeOf(interest(B.owner, applicationId))).toBe('42501')
    expect(await codeOf(interest(candidate.user, applicationId))).toBe('42501')
    expect(await codeOf(interest(A.members[0], applicationId, A.owner))).toBe('42501')
    expect(await codeOf(as(null, 'INSERT INTO public.company_interest (application_id, expressed_by) VALUES ($1, NULL)', [applicationId], 'anon'))).toBe('42501')
    expect(await codeOf(as(A.members[0], 'INSERT INTO public.company_interest (application_id) VALUES ($1)', [applicationId]))).toBe('42501') // NULL expressed_by
    expect(await count('company_interest', 'application_id = $1', [applicationId])).toBe(0)
    expect(await matchCount(jobId, candidate.seekerId)).toBe(0)
  })

  it('rejects an inactive member and a company account without membership', async () => {
    await as(A.owner, 'UPDATE public.company_members SET is_active = false WHERE profile_id = $1', [A.members[1]])
    expect(await codeOf(interest(A.members[1], applicationId))).toBe('42501')
    const stranger = await newUser('company', 'Stranger Recruiter')
    expect(await codeOf(interest(stranger, applicationId))).toBe('42501')
  })

  it('a nonexistent application gets the same refusal as a foreign one (no probing)', async () => {
    const missing = (await sql('SELECT gen_random_uuid() AS id')).rows[0].id
    expect(await codeOf(interest(A.members[0], missing))).toBe('42501')
  })

  it('shows interest only to members of the application\'s company', async () => {
    await interest(A.members[0], applicationId)

    expect((await as(A.owner, 'SELECT id FROM public.company_interest WHERE application_id = $1', [applicationId])).rows).toHaveLength(1)
    expect((await as(B.owner, 'SELECT id FROM public.company_interest WHERE application_id = $1', [applicationId])).rows).toHaveLength(0)
    expect((await as(candidate.user, 'SELECT id FROM public.company_interest WHERE application_id = $1', [applicationId])).rows).toHaveLength(0)
    expect(await codeOf(as(null, 'SELECT id FROM public.company_interest', [], 'anon'))).toBe('42501')
  })

  it('makes interest immutable for API roles', async () => {
    const { rows } = await sql('SELECT id FROM public.company_interest WHERE application_id = $1', [applicationId])
    expect(await codeOf(as(A.owner, 'UPDATE public.company_interest SET expressed_by = $1 WHERE id = $2', [A.owner, rows[0].id]))).toBe('42501')
    expect(await codeOf(as(A.owner, 'DELETE FROM public.company_interest WHERE id = $1', [rows[0].id]))).toBe('42501')
  })
})

describe('after 007: messaging only through a real match', () => {
  let jobId, candidate, other, conversationId

  beforeAll(async () => {
    ;({ jobId, candidate } = await scenario(A))
    other = await newCandidate('Other Candidate')
    await swipe(candidate, jobId, 'like')
    const applicationId = await apply(candidate, jobId, A.companyId)
    await interest(A.members[0], applicationId)
    conversationId = (await conversationFor(jobId, candidate.seekerId))[0].id
  })

  it('the candidate and the company can each send a message and read the other\'s', async () => {
    await as(candidate.user, "INSERT INTO public.messages (conversation_id, sender_id, message) VALUES ($1, $2, 'Hello Acme')", [conversationId, candidate.user])
    await as(A.members[0], "INSERT INTO public.messages (conversation_id, sender_id, message) VALUES ($1, $2, 'Hello Priya')", [conversationId, A.members[0]])

    const asCandidate = (await as(candidate.user, 'SELECT message FROM public.messages WHERE conversation_id = $1 ORDER BY created_at, message', [conversationId])).rows.map((r) => r.message)
    const asRecruiter = (await as(A.owner, 'SELECT message FROM public.messages WHERE conversation_id = $1 ORDER BY created_at, message', [conversationId])).rows.map((r) => r.message)
    expect(asCandidate).toEqual(['Hello Acme', 'Hello Priya'])
    expect(asRecruiter).toEqual(['Hello Acme', 'Hello Priya'])
  })

  it('outsiders can neither read nor send: another candidate, another company, anonymous', async () => {
    expect((await as(other.user, 'SELECT id FROM public.messages WHERE conversation_id = $1', [conversationId])).rows).toHaveLength(0)
    expect((await as(B.owner, 'SELECT id FROM public.messages WHERE conversation_id = $1', [conversationId])).rows).toHaveLength(0)
    expect((await as(other.user, 'SELECT id FROM public.conversations WHERE id = $1', [conversationId])).rows).toHaveLength(0)
    expect(await codeOf(as(other.user, "INSERT INTO public.messages (conversation_id, sender_id, message) VALUES ($1, $2, 'intruder')", [conversationId, other.user]))).toBe('42501')
    expect(await codeOf(as(B.owner, "INSERT INTO public.messages (conversation_id, sender_id, message) VALUES ($1, $2, 'intruder')", [conversationId, B.owner]))).toBe('42501')
    expect(await codeOf(as(null, "INSERT INTO public.messages (conversation_id, sender_id, message) VALUES ($1, NULL, 'x')", [conversationId], 'anon'))).toBe('42501')
  })

  it('a member cannot send as someone else', async () => {
    expect(await codeOf(as(candidate.user, "INSERT INTO public.messages (conversation_id, sender_id, message) VALUES ($1, $2, 'spoof')", [conversationId, A.owner]))).toBe('42501')
  })

  it('a candidate with no match has no conversation and cannot message into an invented one', async () => {
    expect(await conversationFor(jobId, other.seekerId)).toHaveLength(0)
    const invented = (await sql('SELECT gen_random_uuid() AS id')).rows[0].id
    expect(await codeOf(as(other.user, "INSERT INTO public.messages (conversation_id, sender_id, message) VALUES ($1, $2, 'hi')", [invented, other.user]))).toBe('42501')
  })
})
