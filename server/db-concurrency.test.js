// Concurrency tests for mutual matching on a REAL PostgreSQL server (embedded binaries, no Docker).
//
// Opt-in: they only run with HIRESWIPE_REAL_PG=1 and the optional dev packages installed:
//     npm install --no-save embedded-postgres pg          (from server/)
//     HIRESWIPE_REAL_PG=1 npx vitest run db-concurrency.test.js
// PostgreSQL refuses to start from an administrator account; on Windows run this from a normal (non-elevated) shell.
// Alternatively point the suite at a PostgreSQL server you already run (a throwaway database is created in it):
//     HIRESWIPE_REAL_PG=1 HIRESWIPE_PG_PORT=5432 HIRESWIPE_PG_USER=postgres HIRESWIPE_PG_PASSWORD=... npx vitest run db-concurrency.test.js (needs only pg).
//
// Each test holds one transaction open on one connection while a second connection acts, then checks that the
// second connection waited (pg_stat_activity) and what the database contains afterwards. Supabase-only objects
// (auth, storage, roles) are stubbed in test-support/db-fixtures.js; Supabase/PostgREST themselves are not involved.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { SUPABASE_STUBS, createFixtures, migrationFiles, migrationSql, migrationsDir } from './test-support/db-fixtures.js'

const externalPort = process.env.HIRESWIPE_PG_PORT ? Number(process.env.HIRESWIPE_PG_PORT) : null
const pgUser = process.env.HIRESWIPE_PG_USER || 'postgres'
const pgPassword = process.env.HIRESWIPE_PG_PASSWORD || 'postgres'
let EmbeddedPostgres
let pg
if (process.env.HIRESWIPE_REAL_PG === '1') {
  try {
    pg = (await import('pg')).default
    if (!externalPort) EmbeddedPostgres = (await import('embedded-postgres')).default
  } catch {
    // optional packages not installed: the suite is skipped
  }
}
const enabled = Boolean(pg && (externalPort || EmbeddedPostgres))

describe.skipIf(!enabled)('mutual matching under concurrent transactions (real PostgreSQL)', () => {
  const port = externalPort ?? 54300 + Math.floor(Math.random() * 600)
  const database = externalPort ? `hireswipe_test_${Date.now()}` : 'postgres'
  let server
  const clients = []
  let admin // superuser, no role: fixtures and assertions
  let setup // fixture sessions that switch to API roles
  let A, B, fx

  async function connect(db = database) {
    const client = new pg.Client({ host: '127.0.0.1', port, user: pgUser, password: pgPassword, database: db })
    await client.connect()
    client.pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    clients.push(client)
    return client
  }

  const claimsFor = (userId, role) => JSON.stringify(userId ? { sub: userId, role } : { role })

  /** A session acting as `userId` (an API user), ready for BEGIN/transactions. */
  async function sessionAs(userId, role = 'authenticated') {
    const client = await connect()
    await client.query(`SET ROLE ${role}`)
    await client.query("SELECT set_config('request.jwt.claims', $1, false)", [claimsFor(userId, role)])
    return client
  }

  async function asUser(userId, text, params, role = 'authenticated') {
    await setup.query(`SET ROLE ${role}`)
    await setup.query("SELECT set_config('request.jwt.claims', $1, false)", [claimsFor(userId, role)])
    try {
      return await setup.query(text, params)
    } finally {
      await setup.query('RESET ROLE')
      await setup.query("SELECT set_config('request.jwt.claims', '', false)")
    }
  }

  /** Resolves when `pid` is waiting on a lock (and returns the wait event); rejects after `timeoutMs`. */
  async function waitUntilBlocked(pid, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const { rows } = await admin.query(
        "SELECT wait_event_type, wait_event FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock'",
        [pid]
      )
      if (rows.length) return rows[0].wait_event
      await new Promise((r) => setTimeout(r, 25))
    }
    throw new Error(`backend ${pid} never waited on a lock`)
  }

  /** True while the promise has not settled after `ms`. */
  async function stillPending(promise, ms = 250) {
    let settled = false
    promise.then(() => (settled = true), () => (settled = true))
    await new Promise((r) => setTimeout(r, ms))
    return !settled
  }

  beforeAll(async () => {
    if (externalPort) {
      const root = await connect('postgres')
      await root.query(`CREATE DATABASE ${database}`)
      await root.end()
    } else {
      server = new EmbeddedPostgres({
        databaseDir: path.join(os.tmpdir(), `hireswipe-pg-${process.pid}-${port}`),
        user: pgUser,
        password: pgPassword,
        port,
        persistent: false,
      })
      await server.initialise()
      await server.start()
    }
    admin = await connect()
    setup = await connect()
    await admin.query(SUPABASE_STUBS)
    for (const f of migrationFiles) {
      try {
        await admin.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
      } catch (err) {
        throw new Error(`migration ${f} failed: ${err.message}`)
      }
    }
    fx = createFixtures({ sql: (t, p) => admin.query(t, p), as: asUser })
    A = await fx.newCompany('Acme', ['Rita Recruiter', 'Ravi Recruiter'])
    B = await fx.newCompany('Globex')
  }, 240_000)

  afterAll(async () => {
    for (const client of clients) await client.end().catch(() => {})
    await server?.stop().catch(() => {})
    if (externalPort) {
      const root = await connect('postgres')
      await root.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`).catch(() => {})
      await root.end()
    }
  }, 60_000)

  /** Runs `fn(held)` and always rolls back / releases the open transactions it started. */
  async function withOpen(sessions, fn) {
    try {
      return await fn()
    } finally {
      for (const s of sessions) await s.query('ROLLBACK').catch(() => {})
    }
  }

  const matchesOf = (jobId, seekerId) => fx.matchCount(jobId, seekerId)

  /** Like saved, application created, no interest yet. */
  async function liked() {
    const { jobId, candidate } = await fx.scenario(A)
    await fx.swipe(candidate, jobId, 'like')
    const applicationId = await fx.apply(candidate, jobId, A.companyId)
    return { jobId, candidate, applicationId }
  }

  describe('withdrawal or pause while the match is being evaluated', () => {
    it('an application being withdrawn makes the interest wait, and then no match is created', async () => {
      const { jobId, candidate, applicationId } = await liked()
      const withdrawer = await sessionAs(candidate.user)
      const company = await sessionAs(A.members[0])
      await withOpen([withdrawer], async () => {
        await withdrawer.query('BEGIN')
        await withdrawer.query("UPDATE public.applications SET status = 'withdrawn' WHERE id = $1", [applicationId])

        const recorded = company.query('INSERT INTO public.company_interest (application_id, expressed_by) VALUES ($1, $2)', [applicationId, A.members[0]])
        await waitUntilBlocked(company.pid) // the match decision waits for the withdrawal to finish
        await withdrawer.query('COMMIT')
        await recorded

        expect(await matchesOf(jobId, candidate.seekerId)).toBe(0)
        expect(await fx.count('company_interest', 'application_id = $1', [applicationId])).toBe(1)
        expect((await admin.query('SELECT status FROM public.applications WHERE id = $1', [applicationId])).rows[0].status).toBe('withdrawn')
      })
    })

    it('a job being paused makes the interest wait, and then no match is created', async () => {
      const { jobId, candidate, applicationId } = await liked()
      const pauser = await connect()
      const company = await sessionAs(A.members[0])
      await withOpen([pauser], async () => {
        await pauser.query('BEGIN')
        await pauser.query("UPDATE public.jobs SET status = 'paused' WHERE id = $1", [jobId])

        const recorded = company.query('INSERT INTO public.company_interest (application_id, expressed_by) VALUES ($1, $2)', [applicationId, A.members[0]])
        await waitUntilBlocked(company.pid)
        await pauser.query('COMMIT')
        await recorded

        expect(await matchesOf(jobId, candidate.seekerId)).toBe(0)
      })
    })

    it('a match being created makes a later withdrawal wait, so the order is a valid sequence (match, then withdrawal)', async () => {
      const { jobId, candidate, applicationId } = await liked()
      const company = await sessionAs(A.members[0])
      const withdrawer = await sessionAs(candidate.user)
      await withOpen([company], async () => {
        await company.query('BEGIN')
        await company.query('INSERT INTO public.company_interest (application_id, expressed_by) VALUES ($1, $2)', [applicationId, A.members[0]])

        const withdrawn = withdrawer.query("UPDATE public.applications SET status = 'withdrawn' WHERE id = $1", [applicationId])
        await waitUntilBlocked(withdrawer.pid)
        await company.query('COMMIT')
        await withdrawn

        expect(await matchesOf(jobId, candidate.seekerId)).toBe(1)
        expect((await admin.query('SELECT status FROM public.applications WHERE id = $1', [applicationId])).rows[0].status).toBe('withdrawn')
      })
    })

    it('a match being created makes a later job pause wait for it', async () => {
      const { jobId, candidate, applicationId } = await liked()
      const company = await sessionAs(A.members[0])
      const pauser = await connect()
      await withOpen([company], async () => {
        await company.query('BEGIN')
        await company.query('INSERT INTO public.company_interest (application_id, expressed_by) VALUES ($1, $2)', [applicationId, A.members[0]])

        const paused = pauser.query("UPDATE public.jobs SET status = 'paused' WHERE id = $1", [jobId])
        await waitUntilBlocked(pauser.pid)
        await company.query('COMMIT')
        await paused

        expect(await matchesOf(jobId, candidate.seekerId)).toBe(1)
      })
    })

    it('a withdrawal that committed just before the interest is honoured', async () => {
      const { jobId, candidate, applicationId } = await liked()
      await asUser(candidate.user, "UPDATE public.applications SET status = 'withdrawn' WHERE id = $1", [applicationId])
      await admin.query('INSERT INTO public.company_interest (application_id, expressed_by) VALUES ($1, $2)', [applicationId, A.members[0]])
      expect(await matchesOf(jobId, candidate.seekerId)).toBe(0)
    })
  })

  describe('simultaneous candidate Like and company interest', () => {
    it('interest arriving while a Like is uncommitted waits for it, then creates exactly one match and conversation', async () => {
      const { jobId, candidate } = await fx.scenario(A)
      const applicationId = await fx.apply(candidate, jobId, A.companyId)
      const like = await sessionAs(candidate.user)
      const company = await sessionAs(A.members[0])
      await withOpen([like], async () => {
        await like.query('BEGIN')
        await like.query("INSERT INTO public.job_swipes (job_id, job_seeker_id, direction) VALUES ($1, $2, 'like')", [jobId, candidate.seekerId])

        const recorded = company.query('INSERT INTO public.company_interest (application_id, expressed_by) VALUES ($1, $2)', [applicationId, A.members[0]])
        expect(await waitUntilBlocked(company.pid)).toBe('advisory')
        await like.query('COMMIT')
        await recorded

        expect(await matchesOf(jobId, candidate.seekerId)).toBe(1)
        expect(await fx.conversationFor(jobId, candidate.seekerId)).toHaveLength(1)
      })
    })

    it('a Like arriving while interest is uncommitted waits for it, then creates exactly one match and conversation', async () => {
      const { jobId, candidate } = await fx.scenario(A)
      const applicationId = await fx.apply(candidate, jobId, A.companyId)
      const company = await sessionAs(A.members[0])
      const like = await sessionAs(candidate.user)
      await withOpen([company], async () => {
        await company.query('BEGIN')
        await company.query('INSERT INTO public.company_interest (application_id, expressed_by) VALUES ($1, $2)', [applicationId, A.members[0]])

        const liked = like.query("INSERT INTO public.job_swipes (job_id, job_seeker_id, direction) VALUES ($1, $2, 'like')", [jobId, candidate.seekerId])
        expect(await waitUntilBlocked(like.pid)).toBe('advisory')
        await company.query('COMMIT')
        await liked

        expect(await matchesOf(jobId, candidate.seekerId)).toBe(1)
        expect(await fx.conversationFor(jobId, candidate.seekerId)).toHaveLength(1)
      })
    })

    it('if the Like rolls back, no match is created; a retried Like then creates exactly one', async () => {
      const { jobId, candidate } = await fx.scenario(A)
      const applicationId = await fx.apply(candidate, jobId, A.companyId)
      const like = await sessionAs(candidate.user)
      const company = await sessionAs(A.members[0])
      await withOpen([like], async () => {
        await like.query('BEGIN')
        await like.query("INSERT INTO public.job_swipes (job_id, job_seeker_id, direction) VALUES ($1, $2, 'like')", [jobId, candidate.seekerId])
        const recorded = company.query('INSERT INTO public.company_interest (application_id, expressed_by) VALUES ($1, $2)', [applicationId, A.members[0]])
        await waitUntilBlocked(company.pid)
        await like.query('ROLLBACK')
        await recorded
        expect(await matchesOf(jobId, candidate.seekerId)).toBe(0)
      })

      await fx.swipe(candidate, jobId, 'like')
      expect(await matchesOf(jobId, candidate.seekerId)).toBe(1)
      expect(await fx.conversationFor(jobId, candidate.seekerId)).toHaveLength(1)
    })

    it('two concurrent interest records for one application: one wins, the other gets a unique violation, one match', async () => {
      const { jobId, candidate, applicationId } = await liked()
      const first = await sessionAs(A.members[0])
      const second = await sessionAs(A.members[1])
      await withOpen([first], async () => {
        await first.query('BEGIN')
        await first.query('INSERT INTO public.company_interest (application_id, expressed_by) VALUES ($1, $2)', [applicationId, A.members[0]])

        const duplicate = second.query('INSERT INTO public.company_interest (application_id, expressed_by) VALUES ($1, $2)', [applicationId, A.members[1]])
        const outcome = duplicate.then(() => 'inserted', (err) => err.code)
        await waitUntilBlocked(second.pid)
        await first.query('COMMIT')

        expect(await outcome).toBe('23505')
        expect(await fx.count('company_interest', 'application_id = $1', [applicationId])).toBe(1)
        expect(await matchesOf(jobId, candidate.seekerId)).toBe(1)
        expect(await fx.conversationFor(jobId, candidate.seekerId)).toHaveLength(1)
      })
    })

    it('negative control: without the advisory lock the same overlap is missed (the test above can detect a missing lock)', async () => {
      const original = migrationSql('007_')
      const { rows } = await admin.query("SELECT pg_get_functiondef('public.create_match_if_mutual(uuid,uuid)'::regprocedure) AS def")
      const withoutLock = rows[0].def.replace(/PERFORM pg_advisory_xact_lock\([\s\S]*?\);/, '')
      expect(withoutLock).not.toEqual(rows[0].def)
      await admin.query(withoutLock)
      try {
        const { jobId, candidate } = await fx.scenario(A)
        const applicationId = await fx.apply(candidate, jobId, A.companyId)
        const like = await sessionAs(candidate.user)
        const company = await sessionAs(A.members[0])
        await withOpen([like], async () => {
          await like.query('BEGIN')
          await like.query("INSERT INTO public.job_swipes (job_id, job_seeker_id, direction) VALUES ($1, $2, 'like')", [jobId, candidate.seekerId])
          await company.query('INSERT INTO public.company_interest (application_id, expressed_by) VALUES ($1, $2)', [applicationId, A.members[0]])
          await like.query('COMMIT')
          expect(await matchesOf(jobId, candidate.seekerId)).toBe(0) // both sides saw only their own row: the match is lost
        })
      } finally {
        await admin.query(original) // restore the real function
      }
    })
  })

  describe('mixed load', () => {
    it('Likes, interest, withdrawals and pauses on many pairs at once: no deadlock, no duplicate match, every match is justified', async () => {
      const pairs = []
      for (let i = 0; i < 8; i += 1) {
        const { jobId, candidate } = await fx.scenario(A)
        pairs.push({ jobId, candidate, applicationId: await fx.apply(candidate, jobId, A.companyId) })
      }
      const settled = await Promise.allSettled(
        pairs.flatMap((p, i) => [
          (async () => (await sessionAs(p.candidate.user)).query("INSERT INTO public.job_swipes (job_id, job_seeker_id, direction) VALUES ($1, $2, 'like')", [p.jobId, p.candidate.seekerId]))(),
          (async () => (await sessionAs(A.members[i % 2])).query('INSERT INTO public.company_interest (application_id, expressed_by) VALUES ($1, $2)', [p.applicationId, A.members[i % 2]]))(),
          i % 3 === 0
            ? (async () => (await sessionAs(p.candidate.user)).query("UPDATE public.applications SET status = 'withdrawn' WHERE id = $1", [p.applicationId]))()
            : i % 3 === 1
              ? (async () => (await connect()).query("UPDATE public.jobs SET status = 'paused' WHERE id = $1", [p.jobId]))()
              : Promise.resolve(),
        ])
      )
      // 42501 is the correct refusal when the withdrawal/pause won the race and the interest policy rejects it.
      const failures = settled.filter((s) => s.status === 'rejected').map((s) => s.reason.code ?? s.reason.message).filter((code) => code !== '42501')
      expect(failures).toEqual([]) // in particular no 40P01 (deadlock)

      for (const p of pairs) {
        const matches = await matchesOf(p.jobId, p.candidate.seekerId)
        expect(matches).toBeLessThanOrEqual(1)
        expect((await fx.conversationFor(p.jobId, p.candidate.seekerId)).length).toBe(matches)
        if (matches === 1) {
          // a match needs both sides, whatever the interleaving was
          expect(await fx.count('company_interest', 'application_id = $1', [p.applicationId])).toBe(1)
          expect(await fx.count('job_swipes', "job_id = $1 AND job_seeker_id = $2 AND direction = 'like'", [p.jobId, p.candidate.seekerId])).toBe(1)
        }
      }
    }, 120_000)
  })
})
