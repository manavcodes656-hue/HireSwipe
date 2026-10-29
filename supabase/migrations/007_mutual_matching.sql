-- HireSwipe Mutual Matching Migration
-- File: supabase/migrations/007_mutual_matching.sql
-- Status: PROPOSED. NOT APPLIED to any database; review and apply deliberately.
--
-- Description: a match (and, through on_match_created, its conversation) is created
--              only when BOTH sides have acted on the same application:
--                - the candidate Liked the job (public.job_swipes, direction = 'like'), and
--                - a member of the owning company expressed interest in the candidate's
--                  application (public.company_interest, migration 006).
--
-- BEHAVIOUR CHANGE (the only one):
--   Before: a candidate's Like of a published job inserted a match immediately
--           (check_and_create_match(), 004), and on_match_created then created the
--           conversation with its members.
--   After:  a Like only records the swipe. check_and_create_match() now calls
--           create_match_if_mutual(), which inserts a match only if an application
--           (not withdrawn), a published job owned by the application's company, a Like
--           and a company_interest row all exist. The same function runs when company
--           interest is inserted, so either order produces exactly one match.
--
-- NOT changed: on_job_swipe_created, on_match_created, create_conversation_for_match(),
--              the UNIQUE (job_id, job_seeker_id) constraints, every policy. Existing
--              matches, conversations, members and messages are not read or modified.
--
-- Requires 001-006. Re-runnable: functions are replaced, the new trigger is dropped and
-- recreated. Apply the whole file at once (for example inside BEGIN; ... COMMIT; in the SQL
-- editor); check_and_create_match() is replaced LAST so a partial run never leaves the
-- system unable to create matches.
--
-- Concurrency (needs READ COMMITTED, the PostgREST default, so a statement sees rows that were
-- committed while it waited for a lock):
--   * Both paths take the same per-(job, candidate) advisory lock before checking, so a Like and
--     an interest committing at the same moment cannot both miss each other.
--   * Once a match looks possible, the job row and then the application row are share-locked and
--     their conditions re-checked. A withdrawal or job pause that is still uncommitted makes the
--     match decision wait; if it commits, the row no longer qualifies and no match is created. If the
--     match is decided first, the later withdrawal/pause waits for it, so the result is the valid
--     sequence "match, then withdrawal". Lock order everywhere: advisory lock, job, application.
--   * Not covered: the policy that lets a company record interest checks the application and job
--     without locks, so interest can still be recorded for an application withdrawn at that instant
--     (it only records interest; no match follows). An existing match is not closed by a later withdrawal.

-- ============================================================================
-- 0. PRECONDITIONS (abort with a clear message instead of changing anything)
-- ============================================================================
DO $$
BEGIN
    IF to_regclass('public.company_interest') IS NULL THEN
        RAISE EXCEPTION 'Precondition failed: public.company_interest is missing (apply 006 first)';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.company_interest'::regclass) THEN
        RAISE EXCEPTION 'Precondition failed: RLS is not enabled on company_interest';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                   WHERE c.conrelid = 'public.company_interest'::regclass AND c.contype = 'u'
                     AND (SELECT array_agg(a.attname::text) FROM pg_attribute a
                          WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) = ARRAY['application_id']) THEN
        RAISE EXCEPTION 'Precondition failed: company_interest.application_id is not unique';
    END IF;
    IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'company_interest'
        AND cmd IN ('SELECT','INSERT')) <> 2 THEN
        RAISE EXCEPTION 'Precondition failed: expected a SELECT and an INSERT policy on company_interest';
    END IF;
    IF has_table_privilege('anon','public.company_interest','SELECT')
       OR has_table_privilege('authenticated','public.company_interest','UPDATE')
       OR has_table_privilege('authenticated','public.company_interest','DELETE')
       OR NOT has_table_privilege('authenticated','public.company_interest','SELECT')
       OR NOT has_table_privilege('authenticated','public.company_interest','INSERT') THEN
        RAISE EXCEPTION 'Precondition failed: company_interest privileges are not SELECT+INSERT for authenticated only';
    END IF;
    -- The current candidate-path function must be either the 004 version or this migration's own version.
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                   WHERE p.oid = 'public.check_and_create_match()'::regprocedure
                     AND p.prosecdef AND p.prorettype = 'trigger'::regtype
                     AND (p.prosrc ILIKE '%INSERT INTO public.matches%' OR p.prosrc ILIKE '%create_match_if_mutual%')) THEN
        RAISE EXCEPTION 'Precondition failed: check_and_create_match() is not the expected SECURITY DEFINER trigger function';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_job_swipe_created'
                   AND tgrelid = 'public.job_swipes'::regclass
                   AND tgfoid = 'public.check_and_create_match()'::regprocedure) THEN
        RAISE EXCEPTION 'Precondition failed: on_job_swipe_created does not call check_and_create_match()';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_match_created'
                   AND tgrelid = 'public.matches'::regclass
                   AND tgfoid = 'public.create_conversation_for_match()'::regprocedure) THEN
        RAISE EXCEPTION 'Precondition failed: on_match_created does not call create_conversation_for_match()';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                   WHERE c.conrelid = 'public.matches'::regclass AND c.contype = 'u'
                     AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute a
                          WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey))
                         = ARRAY['job_id','job_seeker_id']) THEN
        RAISE EXCEPTION 'Precondition failed: matches has no UNIQUE (job_id, job_seeker_id)';
    END IF;
    IF (SELECT count(*)
        FROM (VALUES ('swipe_direction','like'), ('match_status','active'),
                     ('application_status','withdrawn'), ('job_status','published')) v(t, l)
        WHERE EXISTS (SELECT 1 FROM pg_enum e
                      JOIN pg_type ty ON ty.oid = e.enumtypid
                      JOIN pg_namespace n ON n.oid = ty.typnamespace
                      WHERE n.nspname = 'public' AND ty.typname = v.t AND e.enumlabel = v.l)) <> 4 THEN
        RAISE EXCEPTION 'Precondition failed: expected enum labels are missing';
    END IF;
    IF (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public'
          AND ((table_name = 'applications' AND column_name IN ('id','job_id','job_seeker_id','company_id','status'))
            OR (table_name = 'jobs' AND column_name IN ('id','company_id','status'))
            OR (table_name = 'job_swipes' AND column_name IN ('job_id','job_seeker_id','direction'))
            OR (table_name = 'matches' AND column_name IN ('job_id','job_seeker_id','company_id','status')))) <> 15 THEN
        RAISE EXCEPTION 'Precondition failed: expected columns are missing';
    END IF;
END $$;

-- ============================================================================
-- 1. THE ONLY PLACE A MATCH IS DECIDED (called by both paths)
-- ============================================================================
-- Must stay VOLATILE (the default): SELECT ... FOR SHARE is not allowed in a non-volatile function,
-- and every statement needs its own snapshot.
CREATE OR REPLACE FUNCTION public.create_match_if_mutual(p_job_id UUID, p_job_seeker_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended('mutual_match:' || p_job_id::text || ':' || p_job_seeker_id::text, 0));

    -- Cheap check without row locks: most Likes arrive before any company interest and stop here.
    IF NOT EXISTS (
        SELECT 1
        FROM public.applications a
        JOIN public.company_interest ci ON ci.application_id = a.id
        JOIN public.job_swipes s
          ON s.job_id = a.job_id AND s.job_seeker_id = a.job_seeker_id AND s.direction = 'like'
        WHERE a.job_id = p_job_id AND a.job_seeker_id = p_job_seeker_id
    ) THEN
        RETURN;
    END IF;

    -- Parent before child. If a concurrent transaction has changed or is changing the row, this waits,
    -- and after its commit the WHERE clause is re-evaluated: a paused job / withdrawn application is skipped.
    PERFORM 1 FROM public.jobs j
    WHERE j.id = p_job_id AND j.status = 'published'
    FOR SHARE;
    IF NOT FOUND THEN RETURN; END IF;

    PERFORM 1 FROM public.applications a
    WHERE a.job_id = p_job_id AND a.job_seeker_id = p_job_seeker_id AND a.status <> 'withdrawn'
    FOR SHARE;
    IF NOT FOUND THEN RETURN; END IF;

    INSERT INTO public.matches (job_id, job_seeker_id, company_id, status)
    SELECT a.job_id, a.job_seeker_id, a.company_id, 'active'::public.match_status
    FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id AND j.company_id = a.company_id
    WHERE a.job_id = p_job_id
      AND a.job_seeker_id = p_job_seeker_id
      AND a.status <> 'withdrawn'
      AND j.status = 'published'
      AND EXISTS (SELECT 1 FROM public.company_interest ci WHERE ci.application_id = a.id)
      AND EXISTS (SELECT 1 FROM public.job_swipes s
                  WHERE s.job_id = a.job_id AND s.job_seeker_id = a.job_seeker_id
                    AND s.direction = 'like')
    ON CONFLICT (job_id, job_seeker_id) DO NOTHING;
END;
$$;
-- New functions are executable by anon/authenticated by default and this one is callable through the API.
REVOKE EXECUTE ON FUNCTION public.create_match_if_mutual(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. COMPANY PATH: interest recorded after (or before) the candidate's Like
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_match_on_company_interest()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_job_id UUID;
    v_job_seeker_id UUID;
BEGIN
    SELECT job_id, job_seeker_id INTO v_job_id, v_job_seeker_id
    FROM public.applications WHERE id = NEW.application_id;
    PERFORM public.create_match_if_mutual(v_job_id, v_job_seeker_id);
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_match_on_company_interest() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_company_interest_created ON public.company_interest;
CREATE TRIGGER on_company_interest_created
    AFTER INSERT ON public.company_interest
    FOR EACH ROW EXECUTE FUNCTION public.create_match_on_company_interest();

-- ============================================================================
-- 3. CANDIDATE PATH, REPLACED LAST
--    Same name, signature and attributes as 004:816-838, so on_job_swipe_created stays attached.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_and_create_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.direction = 'like' THEN
        PERFORM public.create_match_if_mutual(NEW.job_id, NEW.job_seeker_id);
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_and_create_match() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- VERIFICATION (read-only; run after applying)
-- ============================================================================
--   select tgrelid::regclass as tbl, tgname, pg_get_triggerdef(oid)
--     from pg_trigger where tgrelid in ('public.job_swipes'::regclass,'public.matches'::regclass,'public.company_interest'::regclass)
--      and not tgisinternal order by 1,2;
--     -- expect: on_job_swipe_created, on_match_created, set_matches_updated_at, trg_prevent_match_key_update, on_company_interest_created
--   select proname, prosecdef, proconfig from pg_proc where pronamespace='public'::regnamespace
--      and proname in ('check_and_create_match','create_match_if_mutual','create_match_on_company_interest');
--     -- expect: all three SECURITY DEFINER with search_path=public, pg_temp
--   select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') anon_exec, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_exec
--     from pg_proc p where p.pronamespace='public'::regnamespace
--      and p.proname in ('check_and_create_match','create_match_if_mutual','create_match_on_company_interest');
--     -- expect: false / false for all three
--   Compare md5(pg_get_functiondef('public.create_conversation_for_match()'::regprocedure)) and a fingerprint of
--   matches / conversations / conversation_members before and after: they must be identical.
--
-- ROLLBACK (forward migration; keeps every match and conversation that exists):
--   1. Restore the unconditional candidate path with the exact 004 body (004:816-840):
--        CREATE OR REPLACE FUNCTION public.check_and_create_match() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
--        SET search_path = public, pg_temp AS $f$ DECLARE v_job_company_id UUID; BEGIN IF NEW.direction = 'like' THEN
--        SELECT company_id INTO v_job_company_id FROM public.jobs WHERE id = NEW.job_id AND status = 'published';
--        IF v_job_company_id IS NOT NULL THEN INSERT INTO public.matches (job_id, job_seeker_id, company_id, status)
--        VALUES (NEW.job_id, NEW.job_seeker_id, v_job_company_id, 'active') ON CONFLICT (job_id, job_seeker_id) DO NOTHING;
--        END IF; END IF; RETURN NEW; END; $f$;
--        REVOKE EXECUTE ON FUNCTION public.check_and_create_match() FROM PUBLIC, anon, authenticated;
--   2. DROP TRIGGER IF EXISTS on_company_interest_created ON public.company_interest;
--      DROP FUNCTION IF EXISTS public.create_match_on_company_interest();
--      DROP FUNCTION IF EXISTS public.create_match_if_mutual(UUID, UUID);
--   Likes made while this migration was active that never got company interest do not become matches
--   retroactively after a rollback (the trigger fires on insert only).
