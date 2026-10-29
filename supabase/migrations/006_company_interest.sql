-- HireSwipe Company Interest Migration
-- File: supabase/migrations/006_company_interest.sql
-- Status: PROPOSED. NOT APPLIED to any database; review and apply deliberately.
--
-- Description: persistent, explicit company interest in one candidate application.
--              Backs POST /api/company/applications/:applicationId/interest
--              (server/company-routes.js).
--
-- Requires 001 (public.is_company_member) and 004 (public.has_profile_role).
-- Independent of 005.
--
-- Scope: adds one table, its RLS policies, privileges, indexes and an
-- immutability guard. It does NOT touch matches, conversations, notifications,
-- applications, check_and_create_match(), create_conversation_for_match() or any
-- existing trigger. Nothing here creates a match: that is a later, separate
-- migration. Existing rows are neither read nor modified.

-- Creating the foreign keys briefly locks public.applications and public.profiles.
-- Fail fast instead of queueing behind a long transaction (no effect, only a
-- warning, if the migration runner does not wrap this file in a transaction).
SET LOCAL lock_timeout = '5s';

-- ============================================================================
-- 1. TABLE
-- ============================================================================

-- Job, company and candidate are deliberately NOT stored here: they are read from
-- the application, whose keys are immutable (004 validate_application_update), so
-- the references can never contradict each other.
CREATE TABLE IF NOT EXISTS public.company_interest (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- UNIQUE: at most one interest row per application. CASCADE: applications are
    -- only ever deleted through cascades (no DELETE policy), and interest has no
    -- meaning without its application.
    application_id UUID NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE,
    -- profiles.id is the auth.uid() identity used across this schema. SET NULL keeps
    -- the interest record if the member's account is deleted.
    expressed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.company_interest IS
    'Explicit, immutable expression of interest by a member of the owning company in a candidate application. One row per application. Never created by a status change; does not itself create a match.';

-- application_id is already indexed by its UNIQUE constraint. expressed_by is an
-- unindexed foreign key (same linter rule as 002 section 7).
CREATE INDEX IF NOT EXISTS idx_company_interest_expressed_by ON public.company_interest(expressed_by);

-- ============================================================================
-- 2. PRIVILEGES AND ROW LEVEL SECURITY
-- ============================================================================

-- No FORCE ROW LEVEL SECURITY: SECURITY DEFINER functions owned by the table owner
-- (the pattern used by 001/004) must be able to read this table later.
ALTER TABLE public.company_interest ENABLE ROW LEVEL SECURITY;

-- Table privileges do not rely on Supabase default grants (not visible in the
-- repository). Only authenticated users may read and insert; nobody gets
-- UPDATE, DELETE or TRUNCATE through the API, and anon gets nothing.
REVOKE ALL ON public.company_interest FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.company_interest TO authenticated;

-- Active members of the application's company can read its interest records.
-- (No admin clause: the endpoint is a company action. Add one only if platform
-- support access is wanted.)
DROP POLICY IF EXISTS "Company members view interest on their applications" ON public.company_interest;
CREATE POLICY "Company members view interest on their applications"
    ON public.company_interest FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            WHERE a.id = public.company_interest.application_id
              AND public.is_company_member(a.company_id, (SELECT auth.uid()))
        )
    );

-- Insert only as yourself, as a company account, as an active member of the
-- application's company, on a non-withdrawn application whose job is published and
-- owned by that same company. A NULL expressed_by fails the equality check.
DROP POLICY IF EXISTS "Company members express interest on their applications" ON public.company_interest;
CREATE POLICY "Company members express interest on their applications"
    ON public.company_interest FOR INSERT
    TO authenticated
    WITH CHECK (
        expressed_by = (SELECT auth.uid())
        AND public.has_profile_role(ARRAY['company']::public.user_role[])
        AND EXISTS (
            SELECT 1
            FROM public.applications a
            JOIN public.jobs j ON j.id = a.job_id AND j.company_id = a.company_id
            WHERE a.id = public.company_interest.application_id
              AND a.status <> 'withdrawn'
              AND j.status = 'published'
              AND public.is_company_member(a.company_id, (SELECT auth.uid()))
        )
    );

-- No UPDATE or DELETE policy, by design: interest is immutable in this version
-- (no withdrawal). Rows leave the table only through the cascades above.

-- ============================================================================
-- 3. IMMUTABILITY GUARD (covers roles that bypass RLS or hold UPDATE privilege)
-- ============================================================================

-- Allows only the referential action ON DELETE SET NULL on expressed_by.
CREATE OR REPLACE FUNCTION public.prevent_company_interest_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.application_id IS DISTINCT FROM OLD.application_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (NEW.expressed_by IS DISTINCT FROM OLD.expressed_by AND NEW.expressed_by IS NOT NULL) THEN
        RAISE EXCEPTION 'company_interest records are immutable' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_company_interest_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_company_interest_update ON public.company_interest;
CREATE TRIGGER trg_prevent_company_interest_update
    BEFORE UPDATE ON public.company_interest
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_company_interest_update();
