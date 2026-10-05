-- HireSwipe Database Foundation Migration
-- File: supabase/migrations/001_initial_hireswipe_schema.sql
-- Description: Complete initial schema, enums, triggers, RLS policies, indexes, and storage configuration for HireSwipe.

-- ==========================================
-- 1. EXTENSIONS
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- 2. ENUMS
-- ==========================================
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('job_seeker', 'company', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.company_member_role AS ENUM ('owner', 'admin', 'recruiter', 'hiring_manager');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.job_status AS ENUM ('draft', 'published', 'paused', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.employment_type AS ENUM ('full_time', 'part_time', 'contract', 'internship', 'freelance');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.remote_type AS ENUM ('on_site', 'remote', 'hybrid');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.swipe_direction AS ENUM ('like', 'pass');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.match_status AS ENUM ('active', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.application_status AS ENUM ('pending', 'reviewing', 'shortlisted', 'interview', 'rejected', 'accepted', 'withdrawn');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.interview_status AS ENUM ('scheduled', 'completed', 'cancelled', 'rescheduled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.message_type AS ENUM ('text', 'file', 'system');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.notification_type AS ENUM ('match', 'application', 'application_status', 'message', 'interview', 'job', 'system');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.report_status AS ENUM ('pending', 'reviewing', 'resolved', 'dismissed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==========================================
-- 3. HELPER FUNCTIONS & TRIGGERS FOR TIMESTAMPS
-- ==========================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 4. TABLES IMPLEMENTATION
-- ==========================================

-- --- AUTH & IDENTITY ---
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role public.user_role NOT NULL DEFAULT 'job_seeker',
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- JOB SEEKER DOMAIN ---
CREATE TABLE IF NOT EXISTS public.job_seeker_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    headline TEXT,
    bio TEXT,
    phone TEXT,
    date_of_birth DATE,
    location TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    experience_years INTEGER CHECK (experience_years >= 0),
    current_job_title TEXT,
    current_company TEXT,
    expected_salary_min NUMERIC CHECK (expected_salary_min >= 0),
    expected_salary_max NUMERIC CHECK (expected_salary_max >= expected_salary_min OR expected_salary_max IS NULL),
    salary_currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    availability TEXT,
    resume_url TEXT,
    linkedin_url TEXT,
    portfolio_url TEXT,
    github_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_seeker_id UUID NOT NULL REFERENCES public.job_seeker_profiles(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL CHECK (file_size > 0),
    mime_type TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.education (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_seeker_id UUID NOT NULL REFERENCES public.job_seeker_profiles(id) ON DELETE CASCADE,
    institution TEXT NOT NULL,
    degree TEXT NOT NULL,
    field_of_study TEXT,
    start_date DATE NOT NULL,
    end_date DATE CHECK (end_date >= start_date OR end_date IS NULL),
    grade TEXT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.experience (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_seeker_id UUID NOT NULL REFERENCES public.job_seeker_profiles(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    job_title TEXT NOT NULL,
    employment_type public.employment_type,
    location TEXT,
    start_date DATE NOT NULL,
    end_date DATE CHECK (end_date >= start_date OR end_date IS NULL),
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    category TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.job_seeker_skills (
    job_seeker_id UUID NOT NULL REFERENCES public.job_seeker_profiles(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
    proficiency_level TEXT CHECK (proficiency_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
    years_experience INTEGER CHECK (years_experience >= 0),
    PRIMARY KEY (job_seeker_id, skill_id)
);

CREATE TABLE IF NOT EXISTS public.job_seeker_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_seeker_id UUID NOT NULL UNIQUE REFERENCES public.job_seeker_profiles(id) ON DELETE CASCADE,
    preferred_job_title TEXT,
    preferred_location TEXT,
    remote_preference public.remote_type,
    employment_type public.employment_type,
    minimum_salary NUMERIC CHECK (minimum_salary >= 0),
    maximum_salary NUMERIC CHECK (maximum_salary >= minimum_salary OR maximum_salary IS NULL),
    experience_level TEXT,
    preferred_industries TEXT[],
    willing_to_relocate BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- COMPANY DOMAIN ---
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    industry TEXT,
    website TEXT,
    company_size TEXT,
    founded_year INTEGER CHECK (founded_year > 1600 AND founded_year <= EXTRACT(YEAR FROM CURRENT_DATE)),
    logo_url TEXT,
    email TEXT,
    phone TEXT,
    location TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.company_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role public.company_member_role NOT NULL DEFAULT 'recruiter',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, profile_id)
);

-- --- JOBS DOMAIN ---
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    employment_type public.employment_type NOT NULL,
    experience_level TEXT,
    experience_min INTEGER CHECK (experience_min >= 0),
    experience_max INTEGER CHECK (experience_max >= experience_min OR experience_max IS NULL),
    salary_min NUMERIC CHECK (salary_min >= 0),
    salary_max NUMERIC CHECK (salary_max >= salary_min OR salary_max IS NULL),
    salary_currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    location TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    remote_type public.remote_type NOT NULL DEFAULT 'on_site',
    status public.job_status NOT NULL DEFAULT 'draft',
    openings INTEGER NOT NULL DEFAULT 1 CHECK (openings > 0),
    application_deadline TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.job_skills (
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    minimum_proficiency TEXT,
    PRIMARY KEY (job_id, skill_id)
);

CREATE TABLE IF NOT EXISTS public.job_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    requirement TEXT NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.job_benefits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    benefit TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- MATCHING DOMAIN ---
CREATE TABLE IF NOT EXISTS public.job_swipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    job_seeker_id UUID NOT NULL REFERENCES public.job_seeker_profiles(id) ON DELETE CASCADE,
    direction public.swipe_direction NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (job_id, job_seeker_id)
);

CREATE TABLE IF NOT EXISTS public.matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    job_seeker_id UUID NOT NULL REFERENCES public.job_seeker_profiles(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    status public.match_status NOT NULL DEFAULT 'active',
    matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (job_id, job_seeker_id)
);

-- --- APPLICATIONS DOMAIN ---
CREATE TABLE IF NOT EXISTS public.applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    job_seeker_id UUID NOT NULL REFERENCES public.job_seeker_profiles(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
    cover_letter TEXT,
    status public.application_status NOT NULL DEFAULT 'pending',
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (job_id, job_seeker_id)
);

CREATE TABLE IF NOT EXISTS public.application_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    old_status public.application_status,
    new_status public.application_status NOT NULL,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- SAVED JOBS DOMAIN ---
CREATE TABLE IF NOT EXISTS public.saved_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_seeker_id UUID NOT NULL REFERENCES public.job_seeker_profiles(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (job_seeker_id, job_id)
);

-- --- COMMUNICATION DOMAIN ---
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL UNIQUE REFERENCES public.matches(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversation_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (conversation_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    message_type public.message_type NOT NULL DEFAULT 'text',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- INTERVIEWS DOMAIN ---
CREATE TABLE IF NOT EXISTS public.interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    scheduled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER CHECK (duration_minutes > 0),
    meeting_url TEXT,
    location TEXT,
    status public.interview_status NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- NOTIFICATIONS DOMAIN ---
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type public.notification_type NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    reference_type TEXT,
    reference_id UUID,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --- SAFETY DOMAIN ---
CREATE TABLE IF NOT EXISTS public.blocked_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reported_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_user UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_company UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    reported_job UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    description TEXT,
    status public.report_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- --- AUDIT DOMAIN ---
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 5. ATTACH UPDATED_AT TRIGGERS
-- ==========================================
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_job_seeker_profiles_updated_at ON public.job_seeker_profiles;
CREATE TRIGGER set_job_seeker_profiles_updated_at BEFORE UPDATE ON public.job_seeker_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_resumes_updated_at ON public.resumes;
CREATE TRIGGER set_resumes_updated_at BEFORE UPDATE ON public.resumes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_education_updated_at ON public.education;
CREATE TRIGGER set_education_updated_at BEFORE UPDATE ON public.education FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_experience_updated_at ON public.experience;
CREATE TRIGGER set_experience_updated_at BEFORE UPDATE ON public.experience FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_job_seeker_preferences_updated_at ON public.job_seeker_preferences;
CREATE TRIGGER set_job_seeker_preferences_updated_at BEFORE UPDATE ON public.job_seeker_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_companies_updated_at ON public.companies;
CREATE TRIGGER set_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_company_members_updated_at ON public.company_members;
CREATE TRIGGER set_company_members_updated_at BEFORE UPDATE ON public.company_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_jobs_updated_at ON public.jobs;
CREATE TRIGGER set_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_matches_updated_at ON public.matches;
CREATE TRIGGER set_matches_updated_at BEFORE UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_applications_updated_at ON public.applications;
CREATE TRIGGER set_applications_updated_at BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_conversations_updated_at ON public.conversations;
CREATE TRIGGER set_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_interviews_updated_at ON public.interviews;
CREATE TRIGGER set_interviews_updated_at BEFORE UPDATE ON public.interviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- 6. AUTOMATIC AUTH USER PROFILE & HISTORY TRIGGERS
-- ==========================================

-- Function to handle new user registration from Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, role, first_name, last_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'job_seeker'::public.user_role),
        NEW.raw_user_meta_data->>'first_name',
        NEW.raw_user_meta_data->>'last_name',
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to track application status changes automatically into application_status_history
CREATE OR REPLACE FUNCTION public.track_application_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.application_status_history (
            application_id,
            old_status,
            new_status,
            changed_by
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            auth.uid()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_application_status_updated ON public.applications;
CREATE TRIGGER on_application_status_updated
    AFTER UPDATE ON public.applications
    FOR EACH ROW EXECUTE FUNCTION public.track_application_status_change();

-- Trigger to create match when a job seeker likes a job
CREATE OR REPLACE FUNCTION public.check_and_create_match()
RETURNS TRIGGER AS $$
DECLARE
    v_job_company_id UUID;
BEGIN
    IF NEW.direction = 'like' THEN
        SELECT company_id INTO v_job_company_id FROM public.jobs WHERE id = NEW.job_id;
        IF v_job_company_id IS NOT NULL THEN
            INSERT INTO public.matches (job_id, job_seeker_id, company_id, status)
            VALUES (NEW.job_id, NEW.job_seeker_id, v_job_company_id, 'active')
            ON CONFLICT (job_id, job_seeker_id) DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_job_swipe_created ON public.job_swipes;
CREATE TRIGGER on_job_swipe_created
    AFTER INSERT ON public.job_swipes
    FOR EACH ROW EXECUTE FUNCTION public.check_and_create_match();

-- Trigger to automatically create a conversation when a match is created
CREATE OR REPLACE FUNCTION public.create_conversation_for_match()
RETURNS TRIGGER AS $$
DECLARE
    v_conversation_id UUID;
    v_job_seeker_profile_id UUID;
BEGIN
    INSERT INTO public.conversations (match_id)
    VALUES (NEW.id)
    ON CONFLICT (match_id) DO NOTHING
    RETURNING id INTO v_conversation_id;

    IF v_conversation_id IS NULL THEN
        SELECT id INTO v_conversation_id FROM public.conversations WHERE match_id = NEW.id;
    END IF;

    SELECT profile_id INTO v_job_seeker_profile_id
    FROM public.job_seeker_profiles
    WHERE id = NEW.job_seeker_id;

    IF v_job_seeker_profile_id IS NOT NULL THEN
        INSERT INTO public.conversation_members (conversation_id, profile_id)
        VALUES (v_conversation_id, v_job_seeker_profile_id)
        ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO public.conversation_members (conversation_id, profile_id)
    SELECT v_conversation_id, profile_id
    FROM public.company_members
    WHERE company_id = NEW.company_id AND is_active = TRUE
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_match_created ON public.matches;
CREATE TRIGGER on_match_created
    AFTER INSERT ON public.matches
    FOR EACH ROW EXECUTE FUNCTION public.create_conversation_for_match();

-- ==========================================
-- 7. INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_job_seeker_profiles_profile_id ON public.job_seeker_profiles(profile_id);

CREATE INDEX IF NOT EXISTS idx_resumes_job_seeker_id ON public.resumes(job_seeker_id);
CREATE INDEX IF NOT EXISTS idx_education_job_seeker_id ON public.education(job_seeker_id);
CREATE INDEX IF NOT EXISTS idx_experience_job_seeker_id ON public.experience(job_seeker_id);

CREATE INDEX IF NOT EXISTS idx_company_members_profile_id ON public.company_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_company_members_company_id ON public.company_members(company_id);

CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON public.jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_location ON public.jobs(location);

CREATE INDEX IF NOT EXISTS idx_job_swipes_job_seeker_id ON public.job_swipes(job_seeker_id);
CREATE INDEX IF NOT EXISTS idx_job_swipes_job_id ON public.job_swipes(job_id);

CREATE INDEX IF NOT EXISTS idx_matches_job_seeker_id ON public.matches(job_seeker_id);
CREATE INDEX IF NOT EXISTS idx_matches_company_id ON public.matches(company_id);
CREATE INDEX IF NOT EXISTS idx_matches_job_id ON public.matches(job_id);

CREATE INDEX IF NOT EXISTS idx_applications_job_seeker_id ON public.applications(job_seeker_id);
CREATE INDEX IF NOT EXISTS idx_applications_company_id ON public.applications(company_id);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON public.applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications(status);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_profile_id ON public.notifications(profile_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);

CREATE INDEX IF NOT EXISTS idx_saved_jobs_job_seeker_id ON public.saved_jobs(job_seeker_id);
CREATE INDEX IF NOT EXISTS idx_saved_jobs_job_id ON public.saved_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_interviews_application_id ON public.interviews(application_id);

-- ==========================================
-- 8. HELPER SECURITY FUNCTIONS FOR RLS
-- ==========================================
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_user_id AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_job_seeker_id_for_user(p_user_id UUID DEFAULT auth.uid())
RETURNS UUID AS $$
DECLARE
    v_js_id UUID;
BEGIN
    SELECT id INTO v_js_id FROM public.job_seeker_profiles WHERE profile_id = p_user_id;
    RETURN v_js_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.company_members
        WHERE company_id = p_company_id AND profile_id = p_user_id AND is_active = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_seeker_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_seeker_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_seeker_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_benefits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Clean up existing policies before creating to allow clean reruns
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- --- PROFILES POLICIES ---
CREATE POLICY "Public profiles viewable by authenticated users"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY "Admins full management profiles"
    ON public.profiles FOR ALL
    TO authenticated
    USING (public.is_admin());

-- --- JOB SEEKER PROFILES & CHILD TABLES ---
CREATE POLICY "Job seekers manage own profile"
    ON public.job_seeker_profiles FOR ALL
    TO authenticated
    USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Company members view candidate profiles of applicants or matches"
    ON public.job_seeker_profiles FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            JOIN public.company_members cm ON cm.company_id = a.company_id
            WHERE a.job_seeker_id = public.job_seeker_profiles.id
            AND cm.profile_id = auth.uid() AND cm.is_active = TRUE
        )
        OR EXISTS (
            SELECT 1 FROM public.matches m
            JOIN public.company_members cm ON cm.company_id = m.company_id
            WHERE m.job_seeker_id = public.job_seeker_profiles.id
            AND cm.profile_id = auth.uid() AND cm.is_active = TRUE
        )
        OR public.is_admin()
    );

-- Resumes
CREATE POLICY "Job seekers manage own resumes"
    ON public.resumes FOR ALL
    TO authenticated
    USING (job_seeker_id = public.get_job_seeker_id_for_user(auth.uid()))
    WITH CHECK (job_seeker_id = public.get_job_seeker_id_for_user(auth.uid()));

CREATE POLICY "Company members view applicant resumes"
    ON public.resumes FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            JOIN public.company_members cm ON cm.company_id = a.company_id
            WHERE a.resume_id = public.resumes.id
            AND cm.profile_id = auth.uid() AND cm.is_active = TRUE
        )
        OR public.is_admin()
    );

-- Education & Experience
CREATE POLICY "Job seekers manage own education"
    ON public.education FOR ALL
    TO authenticated
    USING (job_seeker_id = public.get_job_seeker_id_for_user(auth.uid()))
    WITH CHECK (job_seeker_id = public.get_job_seeker_id_for_user(auth.uid()));

CREATE POLICY "Company members view applicant education"
    ON public.education FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            JOIN public.company_members cm ON cm.company_id = a.company_id
            WHERE a.job_seeker_id = public.education.job_seeker_id
            AND cm.profile_id = auth.uid() AND cm.is_active = TRUE
        )
        OR public.is_admin()
    );

CREATE POLICY "Job seekers manage own experience"
    ON public.experience FOR ALL
    TO authenticated
    USING (job_seeker_id = public.get_job_seeker_id_for_user(auth.uid()))
    WITH CHECK (job_seeker_id = public.get_job_seeker_id_for_user(auth.uid()));

CREATE POLICY "Company members view applicant experience"
    ON public.experience FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            JOIN public.company_members cm ON cm.company_id = a.company_id
            WHERE a.job_seeker_id = public.experience.job_seeker_id
            AND cm.profile_id = auth.uid() AND cm.is_active = TRUE
        )
        OR public.is_admin()
    );

-- Skills & Job Seeker Skills
CREATE POLICY "Skills viewable by all authenticated users"
    ON public.skills FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Admins manage skills catalog"
    ON public.skills FOR ALL
    TO authenticated
    USING (public.is_admin());

CREATE POLICY "Job seekers manage own skills"
    ON public.job_seeker_skills FOR ALL
    TO authenticated
    USING (job_seeker_id = public.get_job_seeker_id_for_user(auth.uid()))
    WITH CHECK (job_seeker_id = public.get_job_seeker_id_for_user(auth.uid()));

CREATE POLICY "Company members view applicant skills"
    ON public.job_seeker_skills FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            JOIN public.company_members cm ON cm.company_id = a.company_id
            WHERE a.job_seeker_id = public.job_seeker_skills.job_seeker_id
            AND cm.profile_id = auth.uid() AND cm.is_active = TRUE
        )
        OR public.is_admin()
    );

-- Preferences
CREATE POLICY "Job seekers manage own preferences"
    ON public.job_seeker_preferences FOR ALL
    TO authenticated
    USING (job_seeker_id = public.get_job_seeker_id_for_user(auth.uid()))
    WITH CHECK (job_seeker_id = public.get_job_seeker_id_for_user(auth.uid()));

-- --- COMPANY DOMAIN POLICIES ---
CREATE POLICY "Companies viewable by all authenticated users"
    ON public.companies FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Authenticated users can register a company"
    ON public.companies FOR INSERT
    TO authenticated
    WITH CHECK (TRUE);

CREATE POLICY "Company members update their company"
    ON public.companies FOR UPDATE
    TO authenticated
    USING (public.is_company_member(id, auth.uid()))
    WITH CHECK (public.is_company_member(id, auth.uid()));

CREATE POLICY "Company members view active team members"
    ON public.company_members FOR SELECT
    TO authenticated
    USING (public.is_company_member(company_id, auth.uid()) OR public.is_admin());

CREATE POLICY "Company owners/admins manage company members"
    ON public.company_members FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = public.company_members.company_id
            AND cm.profile_id = auth.uid()
            AND cm.role IN ('owner', 'admin')
            AND cm.is_active = TRUE
        )
        OR public.is_admin()
    );

-- --- JOBS DOMAIN POLICIES ---
CREATE POLICY "Job seekers view published jobs"
    ON public.jobs FOR SELECT
    TO authenticated
    USING (status = 'published' OR public.is_company_member(company_id, auth.uid()) OR public.is_admin());

CREATE POLICY "Company members manage company jobs"
    ON public.jobs FOR ALL
    TO authenticated
    USING (public.is_company_member(company_id, auth.uid()) OR public.is_admin())
    WITH CHECK (public.is_company_member(company_id, auth.uid()) OR public.is_admin());

CREATE POLICY "Job skills viewable by authenticated users"
    ON public.job_skills FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Company members manage job skills"
    ON public.job_skills FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.jobs j
            WHERE j.id = public.job_skills.job_id
            AND public.is_company_member(j.company_id, auth.uid())
        )
        OR public.is_admin()
    );

CREATE POLICY "Job requirements viewable by authenticated users"
    ON public.job_requirements FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Company members manage job requirements"
    ON public.job_requirements FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.jobs j
            WHERE j.id = public.job_requirements.job_id
            AND public.is_company_member(j.company_id, auth.uid())
        )
        OR public.is_admin()
    );

CREATE POLICY "Job benefits viewable by authenticated users"
    ON public.job_benefits FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Company members manage job benefits"
    ON public.job_benefits FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.jobs j
            WHERE j.id = public.job_benefits.job_id
            AND public.is_company_member(j.company_id, auth.uid())
        )
        OR public.is_admin()
    );

-- --- MATCHING & SAVED JOBS POLICIES ---
CREATE POLICY "Job seekers create & view own swipes"
    ON public.job_swipes FOR ALL
    TO authenticated
    USING (job_seeker_id = public.get_job_seeker_id_for_user(auth.uid()))
    WITH CHECK (job_seeker_id = public.get_job_seeker_id_for_user(auth.uid()));

CREATE POLICY "Matches viewable by relevant job seeker or company members"
    ON public.matches FOR SELECT
    TO authenticated
    USING (
        job_seeker_id = public.get_job_seeker_id_for_user(auth.uid())
        OR public.is_company_member(company_id, auth.uid())
        OR public.is_admin()
    );

CREATE POLICY "Saved jobs managed by job seeker owner"
    ON public.saved_jobs FOR ALL
    TO authenticated
    USING (job_seeker_id = public.get_job_seeker_id_for_user(auth.uid()))
    WITH CHECK (job_seeker_id = public.get_job_seeker_id_for_user(auth.uid()));

-- --- APPLICATIONS & HISTORY POLICIES ---
CREATE POLICY "Job seekers create and view own applications"
    ON public.applications FOR SELECT
    TO authenticated
    USING (
        job_seeker_id = public.get_job_seeker_id_for_user(auth.uid())
        OR public.is_company_member(company_id, auth.uid())
        OR public.is_admin()
    );

CREATE POLICY "Job seekers insert own applications"
    ON public.applications FOR INSERT
    TO authenticated
    WITH CHECK (job_seeker_id = public.get_job_seeker_id_for_user(auth.uid()));

CREATE POLICY "Company members update application status"
    ON public.applications FOR UPDATE
    TO authenticated
    USING (public.is_company_member(company_id, auth.uid()) OR public.is_admin())
    WITH CHECK (public.is_company_member(company_id, auth.uid()) OR public.is_admin());

CREATE POLICY "Application status history viewable by candidate and company"
    ON public.application_status_history FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            WHERE a.id = public.application_status_history.application_id
            AND (
                a.job_seeker_id = public.get_job_seeker_id_for_user(auth.uid())
                OR public.is_company_member(a.company_id, auth.uid())
            )
        )
        OR public.is_admin()
    );

-- --- COMMUNICATION POLICIES ---
CREATE POLICY "Conversations accessible only by conversation members"
    ON public.conversations FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = public.conversations.id
            AND cm.profile_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY "Conversation members view list of members"
    ON public.conversation_members FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = public.conversation_members.conversation_id
            AND cm.profile_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY "Messages readable by conversation members"
    ON public.messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = public.messages.conversation_id
            AND cm.profile_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY "Messages insertable by conversation members as sender"
    ON public.messages FOR INSERT
    TO authenticated
    WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = public.messages.conversation_id
            AND cm.profile_id = auth.uid()
        )
    );

-- --- INTERVIEWS POLICIES ---
CREATE POLICY "Interviews viewable by applicant and company members"
    ON public.interviews FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            WHERE a.id = public.interviews.application_id
            AND (
                a.job_seeker_id = public.get_job_seeker_id_for_user(auth.uid())
                OR public.is_company_member(a.company_id, auth.uid())
            )
        )
        OR public.is_admin()
    );

CREATE POLICY "Company members manage interviews"
    ON public.interviews FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            WHERE a.id = public.interviews.application_id
            AND public.is_company_member(a.company_id, auth.uid())
        )
        OR public.is_admin()
    );

-- --- NOTIFICATIONS POLICIES ---
CREATE POLICY "Users manage own notifications"
    ON public.notifications FOR ALL
    TO authenticated
    USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());

-- --- SAFETY & AUDIT POLICIES ---
CREATE POLICY "Users manage own blocked users list"
    ON public.blocked_users FOR ALL
    TO authenticated
    USING (blocker_id = auth.uid())
    WITH CHECK (blocker_id = auth.uid());

CREATE POLICY "Users create safety reports"
    ON public.reports FOR INSERT
    TO authenticated
    WITH CHECK (reported_by = auth.uid());

CREATE POLICY "Users view own submitted reports"
    ON public.reports FOR SELECT
    TO authenticated
    USING (reported_by = auth.uid() OR public.is_admin());

CREATE POLICY "Admins manage all reports"
    ON public.reports FOR ALL
    TO authenticated
    USING (public.is_admin());

CREATE POLICY "Users view own activity logs"
    ON public.activity_logs FOR SELECT
    TO authenticated
    USING (profile_id = auth.uid() OR public.is_admin());

-- ==========================================
-- 10. SUPABASE STORAGE BUCKETS & POLICIES
-- ==========================================
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('avatars', 'avatars', true),
    ('company-logos', 'company-logos', true),
    ('resumes', 'resumes', false),
    ('job-attachments', 'job-attachments', false),
    ('message-attachments', 'message-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage object policies cleanup
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname IN (
            'Avatar Public Read', 'Avatar User Insert/Update/Delete',
            'Company Logo Public Read', 'Company Member Logo Manage',
            'Resume Private Owner Access', 'Job Attachments Company Manage',
            'Message Attachments Access'
        )
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
    END LOOP;
END $$;

CREATE POLICY "Avatar Public Read"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'avatars');

CREATE POLICY "Avatar User Insert/Update/Delete"
    ON storage.objects FOR ALL
    TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
    WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Company Logo Public Read"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'company-logos');

CREATE POLICY "Company Member Logo Manage"
    ON storage.objects FOR ALL
    TO authenticated
    USING (
        bucket_id = 'company-logos'
        AND public.is_company_member((storage.foldername(name))[1]::uuid, auth.uid())
    );

CREATE POLICY "Resume Private Owner Access"
    ON storage.objects FOR ALL
    TO authenticated
    USING (
        bucket_id = 'resumes'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Job Attachments Company Manage"
    ON storage.objects FOR ALL
    TO authenticated
    USING (
        bucket_id = 'job-attachments'
        AND public.is_company_member((storage.foldername(name))[1]::uuid, auth.uid())
    );

CREATE POLICY "Message Attachments Access"
    ON storage.objects FOR ALL
    TO authenticated
    USING (
        bucket_id = 'message-attachments'
        AND EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = (storage.foldername(name))[1]::uuid
            AND cm.profile_id = auth.uid()
        )
    );
