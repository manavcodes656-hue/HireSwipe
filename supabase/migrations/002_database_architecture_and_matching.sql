-- HireSwipe Database Architecture & Matching Domain Migration
-- File: supabase/migrations/002_database_architecture_and_matching.sql
-- Description: Forward-only schema enhancement adding full_name to profiles,
--              onboarding/completion tracking, matching_results table, email_outbox table,
--              match_score on matches and applications, application eligibility checks,
--              covering indexes for all unindexed foreign keys, and RLS security hardenings.

-- ============================================================================
-- 1. PROFILES ENHANCEMENTS & AUTH TRIGGER HARDENING
-- ============================================================================

-- Add full_name column to profiles if not present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'full_name'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN full_name TEXT;
    END IF;
END $$;

-- Backfill full_name for existing records from first_name and last_name
UPDATE public.profiles 
SET full_name = TRIM(CONCAT_WS(' ', NULLIF(first_name, ''), NULLIF(last_name, '')))
WHERE full_name IS NULL AND (first_name IS NOT NULL OR last_name IS NOT NULL);

-- Update handle_new_user trigger function to safely populate full_name, first_name, last_name
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_raw_full_name TEXT;
    v_first_name TEXT;
    v_last_name TEXT;
BEGIN
    v_raw_full_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), '');
    v_first_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'first_name'), '');
    v_last_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'last_name'), '');

    -- If full_name is present but first_name is not, split it
    IF v_raw_full_name IS NOT NULL AND v_first_name IS NULL THEN
        v_first_name := split_part(v_raw_full_name, ' ', 1);
        v_last_name := NULLIF(TRIM(substr(v_raw_full_name, length(v_first_name) + 1)), '');
    END IF;

    -- If full_name is not present but first/last are, synthesize full_name
    IF v_raw_full_name IS NULL AND (v_first_name IS NOT NULL OR v_last_name IS NOT NULL) THEN
        v_raw_full_name := TRIM(CONCAT_WS(' ', v_first_name, v_last_name));
    END IF;

    INSERT INTO public.profiles (
        id, 
        email, 
        role, 
        first_name, 
        last_name, 
        full_name, 
        avatar_url,
        phone
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'job_seeker'::public.user_role),
        v_first_name,
        v_last_name,
        v_raw_full_name,
        NEW.raw_user_meta_data->>'avatar_url',
        NEW.raw_user_meta_data->>'phone'
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        first_name = COALESCE(EXCLUDED.first_name, public.profiles.first_name),
        last_name = COALESCE(EXCLUDED.last_name, public.profiles.last_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
        updated_at = NOW();

    RETURN NEW;
END;
$$;

-- Revoke direct execution of trigger function by anon and authenticated
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. ONBOARDING & PROFILE COMPLETION TRACKING
-- ============================================================================

-- Add onboarding_completed and profile_completion_pct to job_seeker_profiles
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'job_seeker_profiles' 
        AND column_name = 'onboarding_completed'
    ) THEN
        ALTER TABLE public.job_seeker_profiles ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'job_seeker_profiles' 
        AND column_name = 'profile_completion_pct'
    ) THEN
        ALTER TABLE public.job_seeker_profiles ADD COLUMN profile_completion_pct INTEGER NOT NULL DEFAULT 0 CHECK (profile_completion_pct >= 0 AND profile_completion_pct <= 100);
    END IF;
END $$;

-- Add onboarding_completed and completion_percentage to companies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'companies' 
        AND column_name = 'onboarding_completed'
    ) THEN
        ALTER TABLE public.companies ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'companies' 
        AND column_name = 'completion_percentage'
    ) THEN
        ALTER TABLE public.companies ADD COLUMN completion_percentage INTEGER NOT NULL DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100);
    END IF;
END $$;

-- ============================================================================
-- 3. MATCH_SCORE ON MATCHES AND APPLICATIONS
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'matches' 
        AND column_name = 'match_score'
    ) THEN
        ALTER TABLE public.matches ADD COLUMN match_score NUMERIC(5,2) CHECK (match_score >= 0 AND match_score <= 100);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'applications' 
        AND column_name = 'match_score'
    ) THEN
        ALTER TABLE public.applications ADD COLUMN match_score NUMERIC(5,2) CHECK (match_score >= 0 AND match_score <= 100);
    END IF;
END $$;

-- ============================================================================
-- 4. MATCHING & AI ANALYSIS DOMAIN (matching_results)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.matching_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    job_seeker_id UUID NOT NULL REFERENCES public.job_seeker_profiles(id) ON DELETE CASCADE,
    match_score NUMERIC(5,2) NOT NULL CHECK (match_score >= 0 AND match_score <= 100),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    strengths TEXT[],
    gaps TEXT[],
    criteria_analysis JSONB DEFAULT '{}'::jsonb,
    model_version TEXT DEFAULT 'v1-rules',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (job_id, job_seeker_id)
);

DROP TRIGGER IF EXISTS set_matching_results_updated_at ON public.matching_results;
CREATE TRIGGER set_matching_results_updated_at 
    BEFORE UPDATE ON public.matching_results 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_matching_results_job_id ON public.matching_results(job_id);
CREATE INDEX IF NOT EXISTS idx_matching_results_job_seeker_id ON public.matching_results(job_seeker_id);
CREATE INDEX IF NOT EXISTS idx_matching_results_status ON public.matching_results(status);

ALTER TABLE public.matching_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Job seekers view own matching results" ON public.matching_results;
CREATE POLICY "Job seekers view own matching results"
    ON public.matching_results FOR SELECT
    TO authenticated
    USING (job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid())));

DROP POLICY IF EXISTS "Company members view matching results for their jobs" ON public.matching_results;
CREATE POLICY "Company members view matching results for their jobs"
    ON public.matching_results FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.jobs j
            WHERE j.id = public.matching_results.job_id
            AND public.is_company_member(j.company_id, (SELECT auth.uid()))
        )
        OR public.is_admin((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Admins manage all matching results" ON public.matching_results;
CREATE POLICY "Admins manage all matching results"
    ON public.matching_results FOR ALL
    TO authenticated
    USING (public.is_admin((SELECT auth.uid())))
    WITH CHECK (public.is_admin((SELECT auth.uid())));

-- ============================================================================
-- 5. EMAIL DELIVERY DOMAIN (email_outbox)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_email TEXT NOT NULL,
    recipient_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'failed')),
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    max_retries INTEGER NOT NULL DEFAULT 3,
    idempotency_key TEXT UNIQUE,
    provider_message_id TEXT,
    error_message TEXT,
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_email_outbox_updated_at ON public.email_outbox;
CREATE TRIGGER set_email_outbox_updated_at 
    BEFORE UPDATE ON public.email_outbox 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_email_outbox_status_scheduled ON public.email_outbox(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_email_outbox_recipient_id ON public.email_outbox(recipient_id);

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recipients can view own sent emails" ON public.email_outbox;
CREATE POLICY "Recipients can view own sent emails"
    ON public.email_outbox FOR SELECT
    TO authenticated
    USING (recipient_id = (SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins full management email outbox" ON public.email_outbox;
CREATE POLICY "Admins full management email outbox"
    ON public.email_outbox FOR ALL
    TO authenticated
    USING (public.is_admin((SELECT auth.uid())))
    WITH CHECK (public.is_admin((SELECT auth.uid())));

-- ============================================================================
-- 6. APPLICATION ELIGIBILITY DATABASE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_application_eligibility(
    p_job_seeker_id UUID,
    p_job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_jsp RECORD;
    v_profile RECORD;
    v_job RECORD;
    v_existing_app RECORD;
    v_missing_fields TEXT[] := '{}';
    v_is_eligible BOOLEAN := TRUE;
    v_reason TEXT := NULL;
BEGIN
    -- Check if job exists and is in an eligible status
    SELECT id, status, company_id, application_deadline INTO v_job
    FROM public.jobs
    WHERE id = p_job_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'is_eligible', FALSE,
            'reason', 'Job not found',
            'missing_fields', '[]'::jsonb
        );
    END IF;

    IF v_job.status != 'published' THEN
        RETURN jsonb_build_object(
            'is_eligible', FALSE,
            'reason', 'Job is not currently accepting applications (status: ' || v_job.status || ')',
            'missing_fields', '[]'::jsonb
        );
    END IF;

    IF v_job.application_deadline IS NOT NULL AND v_job.application_deadline < NOW() THEN
        RETURN jsonb_build_object(
            'is_eligible', FALSE,
            'reason', 'Application deadline has passed',
            'missing_fields', '[]'::jsonb
        );
    END IF;

    -- Check if candidate has already applied
    SELECT id, status INTO v_existing_app
    FROM public.applications
    WHERE job_id = p_job_id AND job_seeker_id = p_job_seeker_id;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'is_eligible', FALSE,
            'reason', 'Candidate has already applied for this position (status: ' || v_existing_app.status || ')',
            'missing_fields', '[]'::jsonb,
            'existing_application_id', v_existing_app.id
        );
    END IF;

    -- Fetch job seeker profile and associated user profile
    SELECT id, profile_id, headline INTO v_jsp
    FROM public.job_seeker_profiles
    WHERE id = p_job_seeker_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'is_eligible', FALSE,
            'reason', 'Job seeker profile not found',
            'missing_fields', jsonb_build_array('job_seeker_profile')
        );
    END IF;

    SELECT id, full_name, email, phone INTO v_profile
    FROM public.profiles
    WHERE id = v_jsp.profile_id;

    -- Validate required candidate information
    IF v_profile.full_name IS NULL OR TRIM(v_profile.full_name) = '' THEN
        v_missing_fields := array_append(v_missing_fields, 'full_name');
    END IF;

    IF v_profile.email IS NULL OR TRIM(v_profile.email) = '' THEN
        v_missing_fields := array_append(v_missing_fields, 'email');
    END IF;

    IF v_jsp.headline IS NULL OR TRIM(v_jsp.headline) = '' THEN
        v_missing_fields := array_append(v_missing_fields, 'headline');
    END IF;

    IF cardinality(v_missing_fields) > 0 THEN
        v_is_eligible := FALSE;
        v_reason := 'Missing mandatory profile fields: ' || array_to_string(v_missing_fields, ', ');
    END IF;

    RETURN jsonb_build_object(
        'is_eligible', v_is_eligible,
        'reason', v_reason,
        'missing_fields', to_jsonb(v_missing_fields)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_application_eligibility(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_application_eligibility(UUID, UUID) TO authenticated;

-- ============================================================================
-- 7. COVERING INDEXES FOR UNINDEXED FOREIGN KEYS (PERFORMANCE LINTER REMEDIATION)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_activity_logs_profile_id ON public.activity_logs(profile_id);
CREATE INDEX IF NOT EXISTS idx_app_status_hist_application_id ON public.application_status_history(application_id);
CREATE INDEX IF NOT EXISTS idx_app_status_hist_changed_by ON public.application_status_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_applications_resume_id ON public.applications(resume_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_id ON public.blocked_users(blocked_id);
CREATE INDEX IF NOT EXISTS idx_conversation_members_profile_id ON public.conversation_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_by ON public.interviews(scheduled_by);
CREATE INDEX IF NOT EXISTS idx_job_benefits_job_id ON public.job_benefits(job_id);
CREATE INDEX IF NOT EXISTS idx_job_requirements_job_id ON public.job_requirements(job_id);
CREATE INDEX IF NOT EXISTS idx_job_seeker_skills_skill_id ON public.job_seeker_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_job_skills_skill_id ON public.job_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_by ON public.jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported_by ON public.reports(reported_by);
CREATE INDEX IF NOT EXISTS idx_reports_reported_company ON public.reports(reported_company);
CREATE INDEX IF NOT EXISTS idx_reports_reported_job ON public.reports(reported_job);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user ON public.reports(reported_user);

-- ============================================================================
-- 8. RLS HARDENING & FIX FOR COMPANY CREATION
-- ============================================================================

-- Fix: Allow company creator to insert initial member record during onboarding
DROP POLICY IF EXISTS "Company creator can insert first owner membership" ON public.company_members;
CREATE POLICY "Company creator can insert first owner membership"
    ON public.company_members FOR INSERT
    TO authenticated
    WITH CHECK (
        profile_id = (SELECT auth.uid())
        AND NOT EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = public.company_members.company_id
        )
    );

-- Set search_path on all existing functions to satisfy database linter
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
ALTER FUNCTION public.track_application_status_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_and_create_match() SET search_path = public, pg_temp;
ALTER FUNCTION public.create_conversation_for_match() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_admin(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_job_seeker_id_for_user(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_company_member(uuid, uuid) SET search_path = public, pg_temp;

-- Revoke direct execute on trigger functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.track_application_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_and_create_match() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_conversation_for_match() FROM PUBLIC, anon, authenticated;

-- Revoke execute on helper security functions from anon
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_job_seeker_id_for_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) FROM anon;
