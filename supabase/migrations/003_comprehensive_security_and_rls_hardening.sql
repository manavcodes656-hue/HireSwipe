-- HireSwipe Comprehensive Security & RLS Hardening Migration
-- File: supabase/migrations/003_comprehensive_security_and_rls_hardening.sql
-- Description: Phase 2 security implementation:
--              1. Profile role privilege-escalation prevention trigger
--              2. Application status transition integrity trigger
--              3. Company membership hierarchy protection trigger
--              4. Optimized RLS policies across all tables using (SELECT auth.uid())
--              5. Storage security hardening with company read access for applicant resumes
--              6. Storage bucket MIME type and file size constraints
--              7. Candidate application withdrawal authorization fix

-- ============================================================================
-- 1. PRIVILEGE ESCALATION PREVENTION TRIGGERS & FUNCTIONS
-- ============================================================================

-- A. Prevent users from altering their own role in public.profiles
CREATE OR REPLACE FUNCTION public.prevent_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (NEW.role IS DISTINCT FROM OLD.role) AND NOT public.is_admin((SELECT auth.uid())) THEN
        RAISE EXCEPTION 'Unauthorized: Users are not permitted to change their own role';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_update ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_profile_role_update();

REVOKE EXECUTE ON FUNCTION public.prevent_profile_role_update() FROM PUBLIC, anon, authenticated;

-- B. Validate application status transitions & prevent tampering with immutable fields
CREATE OR REPLACE FUNCTION public.validate_application_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_company_member BOOLEAN;
    v_is_candidate BOOLEAN;
    v_candidate_user_id UUID;
BEGIN
    -- Prevent altering relational keys
    IF NEW.job_id IS DISTINCT FROM OLD.job_id THEN
        RAISE EXCEPTION 'Cannot modify job_id of an existing application';
    END IF;
    IF NEW.job_seeker_id IS DISTINCT FROM OLD.job_seeker_id THEN
        RAISE EXCEPTION 'Cannot modify job_seeker_id of an existing application';
    END IF;
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
        RAISE EXCEPTION 'Cannot modify company_id of an existing application';
    END IF;

    -- Check actor authorization
    v_is_company_member := public.is_company_member(OLD.company_id, (SELECT auth.uid()));
    SELECT profile_id INTO v_candidate_user_id FROM public.job_seeker_profiles WHERE id = OLD.job_seeker_id;
    v_candidate_user_id := COALESCE(v_candidate_user_id, '00000000-0000-0000-0000-000000000000'::uuid);
    v_is_candidate := (v_candidate_user_id = (SELECT auth.uid()));

    -- If status is changing, enforce valid roles
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF v_is_candidate AND NOT v_is_company_member AND NOT public.is_admin((SELECT auth.uid())) THEN
            -- Candidate can ONLY change status to 'withdrawn'
            IF NEW.status != 'withdrawn' THEN
                RAISE EXCEPTION 'Candidates can only update application status to withdrawn';
            END IF;
            IF OLD.status IN ('accepted', 'rejected', 'withdrawn') THEN
                RAISE EXCEPTION 'Cannot withdraw application that is already in terminal state %', OLD.status;
            END IF;
        ELSIF NOT v_is_company_member AND NOT public.is_admin((SELECT auth.uid())) THEN
            RAISE EXCEPTION 'Unauthorized to update application status';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_application_update ON public.applications;
CREATE TRIGGER trg_validate_application_update
    BEFORE UPDATE ON public.applications
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_application_update();

REVOKE EXECUTE ON FUNCTION public.validate_application_update() FROM PUBLIC, anon, authenticated;

-- C. Enforce company membership hierarchy
CREATE OR REPLACE FUNCTION public.enforce_company_membership_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role public.company_member_role;
    v_is_first_member BOOLEAN;
BEGIN
    -- Check if company currently has zero members (initial creation)
    SELECT NOT EXISTS (
        SELECT 1 FROM public.company_members cm WHERE cm.company_id = NEW.company_id
    ) INTO v_is_first_member;

    IF TG_OP = 'INSERT' AND v_is_first_member THEN
        -- Initial company creator is allowed to assign themselves as owner
        IF NEW.profile_id = (SELECT auth.uid()) AND NEW.role = 'owner' THEN
            RETURN NEW;
        END IF;
    END IF;

    -- For standard operations, verify caller role
    SELECT role INTO v_caller_role
    FROM public.company_members
    WHERE company_id = NEW.company_id 
      AND profile_id = (SELECT auth.uid()) 
      AND is_active = TRUE;

    IF public.is_admin((SELECT auth.uid())) THEN
        RETURN NEW;
    END IF;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not an active member of this company';
    END IF;

    -- Only owners can grant or revoke 'owner' role
    IF (NEW.role = 'owner' OR (TG_OP = 'UPDATE' AND OLD.role = 'owner')) AND v_caller_role != 'owner' THEN
        RAISE EXCEPTION 'Unauthorized: Only existing company owners can manage owner memberships';
    END IF;

    -- Recruiters and hiring managers cannot manage company members
    IF v_caller_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only company owners and admins can manage team members';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_company_membership_hierarchy ON public.company_members;
CREATE TRIGGER trg_enforce_company_membership_hierarchy
    BEFORE INSERT OR UPDATE ON public.company_members
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_company_membership_hierarchy();

REVOKE EXECUTE ON FUNCTION public.enforce_company_membership_hierarchy() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. ROW LEVEL SECURITY (RLS) POLICIES HARMONIZATION & REFRESH
-- ============================================================================

-- Clean up existing policies across all public tables for clean recreation
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

-- --- PROFILES ---
CREATE POLICY "Profiles viewable by authenticated users"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Users update own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "Admins full management profiles"
    ON public.profiles FOR ALL
    TO authenticated
    USING (public.is_admin((SELECT auth.uid())))
    WITH CHECK (public.is_admin((SELECT auth.uid())));

-- --- JOB SEEKER PROFILES ---
CREATE POLICY "Job seekers manage own job seeker profile"
    ON public.job_seeker_profiles FOR ALL
    TO authenticated
    USING (profile_id = (SELECT auth.uid()))
    WITH CHECK (profile_id = (SELECT auth.uid()));

CREATE POLICY "Company members view candidate profiles of applicants or matches"
    ON public.job_seeker_profiles FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            JOIN public.company_members cm ON cm.company_id = a.company_id
            WHERE a.job_seeker_id = public.job_seeker_profiles.id
            AND cm.profile_id = (SELECT auth.uid()) AND cm.is_active = TRUE
        )
        OR EXISTS (
            SELECT 1 FROM public.matches m
            JOIN public.company_members cm ON cm.company_id = m.company_id
            WHERE m.job_seeker_id = public.job_seeker_profiles.id
            AND cm.profile_id = (SELECT auth.uid()) AND cm.is_active = TRUE
        )
        OR public.is_admin((SELECT auth.uid()))
    );

-- --- RESUMES ---
CREATE POLICY "Job seekers manage own resumes"
    ON public.resumes FOR ALL
    TO authenticated
    USING (job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid())))
    WITH CHECK (job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid())));

CREATE POLICY "Company members view applicant resumes"
    ON public.resumes FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            JOIN public.company_members cm ON cm.company_id = a.company_id
            WHERE a.resume_id = public.resumes.id
            AND cm.profile_id = (SELECT auth.uid()) AND cm.is_active = TRUE
        )
        OR public.is_admin((SELECT auth.uid()))
    );

-- --- EDUCATION & EXPERIENCE ---
CREATE POLICY "Job seekers manage own education"
    ON public.education FOR ALL
    TO authenticated
    USING (job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid())))
    WITH CHECK (job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid())));

CREATE POLICY "Company members view applicant education"
    ON public.education FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            JOIN public.company_members cm ON cm.company_id = a.company_id
            WHERE a.job_seeker_id = public.education.job_seeker_id
            AND cm.profile_id = (SELECT auth.uid()) AND cm.is_active = TRUE
        )
        OR public.is_admin((SELECT auth.uid()))
    );

CREATE POLICY "Job seekers manage own experience"
    ON public.experience FOR ALL
    TO authenticated
    USING (job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid())))
    WITH CHECK (job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid())));

CREATE POLICY "Company members view applicant experience"
    ON public.experience FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            JOIN public.company_members cm ON cm.company_id = a.company_id
            WHERE a.job_seeker_id = public.experience.job_seeker_id
            AND cm.profile_id = (SELECT auth.uid()) AND cm.is_active = TRUE
        )
        OR public.is_admin((SELECT auth.uid()))
    );

-- --- SKILLS & PREFERENCES ---
CREATE POLICY "Skills viewable by authenticated users"
    ON public.skills FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Admins manage skills catalog"
    ON public.skills FOR ALL
    TO authenticated
    USING (public.is_admin((SELECT auth.uid())))
    WITH CHECK (public.is_admin((SELECT auth.uid())));

CREATE POLICY "Job seekers manage own skills"
    ON public.job_seeker_skills FOR ALL
    TO authenticated
    USING (job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid())))
    WITH CHECK (job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid())));

CREATE POLICY "Company members view applicant skills"
    ON public.job_seeker_skills FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            JOIN public.company_members cm ON cm.company_id = a.company_id
            WHERE a.job_seeker_id = public.job_seeker_skills.job_seeker_id
            AND cm.profile_id = (SELECT auth.uid()) AND cm.is_active = TRUE
        )
        OR public.is_admin((SELECT auth.uid()))
    );

CREATE POLICY "Job seekers manage own preferences"
    ON public.job_seeker_preferences FOR ALL
    TO authenticated
    USING (job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid())))
    WITH CHECK (job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid())));

-- --- COMPANIES ---
CREATE POLICY "Companies viewable by authenticated users"
    ON public.companies FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Authenticated users register company"
    ON public.companies FOR INSERT
    TO authenticated
    WITH CHECK (TRUE);

CREATE POLICY "Company members update their company"
    ON public.companies FOR UPDATE
    TO authenticated
    USING (public.is_company_member(id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())))
    WITH CHECK (public.is_company_member(id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())));

-- --- COMPANY MEMBERS ---
CREATE POLICY "Company members view team members"
    ON public.company_members FOR SELECT
    TO authenticated
    USING (public.is_company_member(company_id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())));

CREATE POLICY "Insert company membership"
    ON public.company_members FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Either creator adding first owner membership
        (
            profile_id = (SELECT auth.uid())
            AND NOT EXISTS (
                SELECT 1 FROM public.company_members cm WHERE cm.company_id = public.company_members.company_id
            )
        )
        -- Or existing owner/admin inviting member
        OR EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = public.company_members.company_id
            AND cm.profile_id = (SELECT auth.uid())
            AND cm.role IN ('owner', 'admin')
            AND cm.is_active = TRUE
        )
        OR public.is_admin((SELECT auth.uid()))
    );

CREATE POLICY "Company owners and admins update memberships"
    ON public.company_members FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = public.company_members.company_id
            AND cm.profile_id = (SELECT auth.uid())
            AND cm.role IN ('owner', 'admin')
            AND cm.is_active = TRUE
        )
        OR public.is_admin((SELECT auth.uid()))
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = public.company_members.company_id
            AND cm.profile_id = (SELECT auth.uid())
            AND cm.role IN ('owner', 'admin')
            AND cm.is_active = TRUE
        )
        OR public.is_admin((SELECT auth.uid()))
    );

CREATE POLICY "Company owners delete memberships"
    ON public.company_members FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = public.company_members.company_id
            AND cm.profile_id = (SELECT auth.uid())
            AND cm.role = 'owner'
            AND cm.is_active = TRUE
        )
        OR public.is_admin((SELECT auth.uid()))
    );

-- --- JOBS DOMAIN ---
CREATE POLICY "View published or company jobs"
    ON public.jobs FOR SELECT
    TO authenticated
    USING (
        status = 'published' 
        OR public.is_company_member(company_id, (SELECT auth.uid())) 
        OR public.is_admin((SELECT auth.uid()))
    );

CREATE POLICY "Company members manage company jobs"
    ON public.jobs FOR ALL
    TO authenticated
    USING (public.is_company_member(company_id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())))
    WITH CHECK (public.is_company_member(company_id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())));

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
            AND public.is_company_member(j.company_id, (SELECT auth.uid()))
        )
        OR public.is_admin((SELECT auth.uid()))
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
            AND public.is_company_member(j.company_id, (SELECT auth.uid()))
        )
        OR public.is_admin((SELECT auth.uid()))
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
            AND public.is_company_member(j.company_id, (SELECT auth.uid()))
        )
        OR public.is_admin((SELECT auth.uid()))
    );

-- --- SWIPES & MATCHES ---
CREATE POLICY "Job seekers view own swipes"
    ON public.job_swipes FOR SELECT
    TO authenticated
    USING (job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid())));

CREATE POLICY "Job seekers insert own swipes"
    ON public.job_swipes FOR INSERT
    TO authenticated
    WITH CHECK (job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid())));

CREATE POLICY "Matches viewable by relevant candidate or company"
    ON public.matches FOR SELECT
    TO authenticated
    USING (
        job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid()))
        OR public.is_company_member(company_id, (SELECT auth.uid()))
        OR public.is_admin((SELECT auth.uid()))
    );

CREATE POLICY "Matches manageable by company or admin"
    ON public.matches FOR UPDATE
    TO authenticated
    USING (public.is_company_member(company_id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())))
    WITH CHECK (public.is_company_member(company_id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())));

-- --- APPLICATIONS DOMAIN ---
CREATE POLICY "Applications viewable by candidate or authorized company"
    ON public.applications FOR SELECT
    TO authenticated
    USING (
        job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid()))
        OR public.is_company_member(company_id, (SELECT auth.uid()))
        OR public.is_admin((SELECT auth.uid()))
    );

CREATE POLICY "Job seekers submit own application"
    ON public.applications FOR INSERT
    TO authenticated
    WITH CHECK (
        job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid()))
    );

CREATE POLICY "Update applications"
    ON public.applications FOR UPDATE
    TO authenticated
    USING (
        -- Company member managing application
        public.is_company_member(company_id, (SELECT auth.uid()))
        -- OR candidate withdrawing own application
        OR job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid()))
        OR public.is_admin((SELECT auth.uid()))
    )
    WITH CHECK (
        public.is_company_member(company_id, (SELECT auth.uid()))
        OR job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid()))
        OR public.is_admin((SELECT auth.uid()))
    );

CREATE POLICY "Application status history viewable by participants"
    ON public.application_status_history FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            WHERE a.id = public.application_status_history.application_id
            AND (
                a.job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid()))
                OR public.is_company_member(a.company_id, (SELECT auth.uid()))
            )
        )
        OR public.is_admin((SELECT auth.uid()))
    );

-- --- SAVED JOBS ---
CREATE POLICY "Job seekers manage saved jobs"
    ON public.saved_jobs FOR ALL
    TO authenticated
    USING (job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid())))
    WITH CHECK (job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid())));

-- --- COMMUNICATIONS ---
CREATE POLICY "Conversations accessible only by conversation members"
    ON public.conversations FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = public.conversations.id
            AND cm.profile_id = (SELECT auth.uid())
        )
        OR public.is_admin((SELECT auth.uid()))
    );

CREATE POLICY "Conversation members view member list"
    ON public.conversation_members FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = public.conversation_members.conversation_id
            AND cm.profile_id = (SELECT auth.uid())
        )
        OR public.is_admin((SELECT auth.uid()))
    );

CREATE POLICY "Messages readable by conversation members"
    ON public.messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = public.messages.conversation_id
            AND cm.profile_id = (SELECT auth.uid())
        )
        OR public.is_admin((SELECT auth.uid()))
    );

CREATE POLICY "Messages insertable by conversation members"
    ON public.messages FOR INSERT
    TO authenticated
    WITH CHECK (
        sender_id = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = public.messages.conversation_id
            AND cm.profile_id = (SELECT auth.uid())
        )
    );

-- --- INTERVIEWS ---
CREATE POLICY "Interviews viewable by applicant and company members"
    ON public.interviews FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            WHERE a.id = public.interviews.application_id
            AND (
                a.job_seeker_id = public.get_job_seeker_id_for_user((SELECT auth.uid()))
                OR public.is_company_member(a.company_id, (SELECT auth.uid()))
            )
        )
        OR public.is_admin((SELECT auth.uid()))
    );

CREATE POLICY "Company members manage interviews"
    ON public.interviews FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.applications a
            WHERE a.id = public.interviews.application_id
            AND public.is_company_member(a.company_id, (SELECT auth.uid()))
        )
        OR public.is_admin((SELECT auth.uid()))
    );

-- --- NOTIFICATIONS ---
CREATE POLICY "Users view and manage own notifications"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (profile_id = (SELECT auth.uid()));

CREATE POLICY "Users update own notifications read status"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (profile_id = (SELECT auth.uid()))
    WITH CHECK (profile_id = (SELECT auth.uid()));

CREATE POLICY "Users delete own notifications"
    ON public.notifications FOR DELETE
    TO authenticated
    USING (profile_id = (SELECT auth.uid()));

CREATE POLICY "Admins full management notifications"
    ON public.notifications FOR ALL
    TO authenticated
    USING (public.is_admin((SELECT auth.uid())));

-- --- SAFETY & AUDIT ---
CREATE POLICY "Users manage own blocked list"
    ON public.blocked_users FOR ALL
    TO authenticated
    USING (blocker_id = (SELECT auth.uid()))
    WITH CHECK (blocker_id = (SELECT auth.uid()));

CREATE POLICY "Users create safety reports"
    ON public.reports FOR INSERT
    TO authenticated
    WITH CHECK (reported_by = (SELECT auth.uid()));

CREATE POLICY "Users view own submitted reports"
    ON public.reports FOR SELECT
    TO authenticated
    USING (reported_by = (SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())));

CREATE POLICY "Admins manage all reports"
    ON public.reports FOR ALL
    TO authenticated
    USING (public.is_admin((SELECT auth.uid())));

CREATE POLICY "Users view own activity logs"
    ON public.activity_logs FOR SELECT
    TO authenticated
    USING (profile_id = (SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())));

-- ============================================================================
-- 3. STORAGE BUCKET CONSTRAINTS & STORAGE OBJECT POLICIES
-- ============================================================================

-- Configure bucket file size and MIME type limits
UPDATE storage.buckets SET
    file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'avatars';

UPDATE storage.buckets SET
    file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
WHERE id = 'company-logos';

UPDATE storage.buckets SET
    file_size_limit = 10485760, -- 10 MB
    allowed_mime_types = ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
WHERE id = 'resumes';

UPDATE storage.buckets SET
    file_size_limit = 15728640 -- 15 MB
WHERE id IN ('job-attachments', 'message-attachments');

-- Clean and recreate storage policies
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
            'Resume Private Owner Access', 'Company members can read applicant resumes',
            'Job Attachments Company Manage', 'Message Attachments Access'
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
    USING (
        bucket_id = 'avatars' 
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    )
    WITH CHECK (
        bucket_id = 'avatars' 
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );

CREATE POLICY "Company Logo Public Read"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'company-logos');

CREATE POLICY "Company Member Logo Manage"
    ON storage.objects FOR ALL
    TO authenticated
    USING (
        bucket_id = 'company-logos'
        AND public.is_company_member((storage.foldername(name))[1]::uuid, (SELECT auth.uid()))
    );

CREATE POLICY "Resume Private Owner Access"
    ON storage.objects FOR ALL
    TO authenticated
    USING (
        bucket_id = 'resumes'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    )
    WITH CHECK (
        bucket_id = 'resumes'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );

CREATE POLICY "Company members can read applicant resumes"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'resumes'
        AND EXISTS (
            SELECT 1 FROM public.applications a
            JOIN public.company_members cm ON cm.company_id = a.company_id
            JOIN public.job_seeker_profiles jsp ON jsp.id = a.job_seeker_id
            WHERE jsp.profile_id::text = (storage.foldername(name))[1]
            AND cm.profile_id = (SELECT auth.uid())
            AND cm.is_active = TRUE
        )
    );

CREATE POLICY "Job Attachments Company Manage"
    ON storage.objects FOR ALL
    TO authenticated
    USING (
        bucket_id = 'job-attachments'
        AND public.is_company_member((storage.foldername(name))[1]::uuid, (SELECT auth.uid()))
    );

CREATE POLICY "Message Attachments Access"
    ON storage.objects FOR ALL
    TO authenticated
    USING (
        bucket_id = 'message-attachments'
        AND EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = (storage.foldername(name))[1]::uuid
            AND cm.profile_id = (SELECT auth.uid())
        )
    );
