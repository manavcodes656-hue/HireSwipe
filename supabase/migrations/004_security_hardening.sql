-- HireSwipe Security Hardening Migration
-- File: supabase/migrations/004_security_hardening.sql
-- Description: Stage 1 fixes for defects confirmed against migrations 001-003:
--              1. Signup role: raw_user_meta_data can no longer grant 'admin'
--              2. Company creation / first-owner claim restricted to company-role users,
--                 company profile edits restricted to company owners/admins (and platform admins),
--                 non-recursive company_members INSERT/UPDATE/DELETE policies,
--                 active team members must be company accounts (and a company account
--                 cannot change role while it holds an active membership), a company
--                 always keeps an active owner (including on account deletion),
--                 plus atomic create_company_with_owner() RPC (one company per account)
--              3. profiles SELECT restricted to self and related users,
--                 plus find_profile_for_team_invite() RPC
--              4. Application insert validation (job, company, eligibility, resume ownership);
--                 check_application_eligibility no longer callable by clients
--              5. Matching: unpublished jobs never create matches; match keys immutable
--              6. Messaging: non-recursive conversation membership policies
--
-- Additive and re-runnable: functions use CREATE OR REPLACE, policies and triggers
-- are dropped by name before being recreated. No tables, columns or enum values added.
--
-- Frontend follow-ups (not part of this migration):
--   - CompanyService.addTeamMemberByEmail reads public.profiles by email. After this
--     migration that lookup only finds related profiles; switch it to
--     rpc('find_profile_for_team_invite', ...).
--   - CompanyService.createCompany may switch to rpc('create_company_with_owner', ...)
--     so a company row can never exist without its owner membership.
--   - CompanyService.updateCompany (profile, onboarding, logo URL) now updates no
--     rows for recruiters and hiring managers; PostgREST reports no error for a
--     zero-row update, so the UI should only offer these edits to owners/admins.

-- ============================================================================
-- 0. HELPER FUNCTIONS (SECURITY DEFINER: read membership without RLS recursion)
-- ============================================================================

-- True only for trusted database contexts: a request made with the service-role
-- key, or a direct database session with no API request at all (migrations,
-- SQL editor). API requests always carry JWT claims with a role.
CREATE OR REPLACE FUNCTION public.is_trusted_db_context()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN COALESCE(
                 NULLIF(current_setting('request.jwt.claim.role', true), ''),
                 NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
             ) = 'service_role' THEN TRUE
        WHEN NULLIF(current_setting('request.jwt.claim.role', true), '') IS NULL
             AND NULLIF(current_setting('request.jwt.claims', true), '') IS NULL
             AND NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NULL THEN TRUE
        ELSE FALSE
    END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_trusted_db_context() FROM PUBLIC, anon, authenticated;

-- True when the calling user's profile has one of the given roles.
CREATE OR REPLACE FUNCTION public.has_profile_role(p_roles public.user_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid()) AND role = ANY (p_roles)
    );
$$;

-- True when the company has any membership row (active or not).
CREATE OR REPLACE FUNCTION public.company_has_members(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.company_members WHERE company_id = p_company_id
    );
$$;

-- True when the calling user is an active member of the company with one of the given roles.
CREATE OR REPLACE FUNCTION public.has_company_member_role(p_company_id UUID, p_roles public.company_member_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.company_members
        WHERE company_id = p_company_id
          AND profile_id = (SELECT auth.uid())
          AND role = ANY (p_roles)
          AND is_active = TRUE
    );
$$;

-- True when the calling user is a participant of the conversation.
CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.conversation_members
        WHERE conversation_id = p_conversation_id
          AND profile_id = (SELECT auth.uid())
    );
$$;

-- True when the calling user may read the given profile row:
-- self, platform admin, teammate, conversation participant, or an active
-- company member viewing a candidate who applied to / matched with that company.
CREATE OR REPLACE FUNCTION public.can_view_profile(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(
        p_profile_id = (SELECT auth.uid())
        OR public.is_admin((SELECT auth.uid()))
        OR EXISTS (
            SELECT 1
            FROM public.company_members me
            JOIN public.company_members them ON them.company_id = me.company_id
            WHERE me.profile_id = (SELECT auth.uid())
              AND me.is_active = TRUE
              AND them.profile_id = p_profile_id
        )
        OR EXISTS (
            SELECT 1
            FROM public.conversation_members mine
            JOIN public.conversation_members theirs ON theirs.conversation_id = mine.conversation_id
            WHERE mine.profile_id = (SELECT auth.uid())
              AND theirs.profile_id = p_profile_id
        )
        OR EXISTS (
            SELECT 1
            FROM public.job_seeker_profiles jsp
            JOIN public.applications a ON a.job_seeker_id = jsp.id
            JOIN public.company_members cm ON cm.company_id = a.company_id
            WHERE jsp.profile_id = p_profile_id
              AND cm.profile_id = (SELECT auth.uid())
              AND cm.is_active = TRUE
        )
        OR EXISTS (
            SELECT 1
            FROM public.job_seeker_profiles jsp
            JOIN public.matches m ON m.job_seeker_id = jsp.id
            JOIN public.company_members cm ON cm.company_id = m.company_id
            WHERE jsp.profile_id = p_profile_id
              AND cm.profile_id = (SELECT auth.uid())
              AND cm.is_active = TRUE
        ),
        FALSE
    );
$$;

REVOKE EXECUTE ON FUNCTION public.has_profile_role(public.user_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.company_has_members(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_company_member_role(UUID, public.company_member_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_conversation_member(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_profile_role(public.user_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_has_members(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_company_member_role(UUID, public.company_member_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_profile(UUID) TO authenticated;

-- Migration 002 revoked these helpers from anon only, but functions are
-- executable by PUBLIC by default, so anon kept EXECUTE through PUBLIC and
-- could test arbitrary user ids for admin / company membership. No policy
-- that applies to anon uses them. authenticated keeps an explicit grant
-- because the RLS policies call them.
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_company_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_job_seeker_id_for_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_job_seeker_id_for_user(UUID) TO authenticated;

-- ============================================================================
-- 1. SIGNUP ROLE SECURITY
-- ============================================================================

-- raw_user_meta_data is supplied by the client at signUp(). Only the two
-- self-service roles are honoured; anything else (including 'admin' or an
-- unknown value, which previously made signup fail on the enum cast) becomes
-- 'job_seeker'. The rest of the body is unchanged from migration 002.
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
    v_requested_role TEXT;
    v_role public.user_role;
BEGIN
    v_raw_full_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), '');
    v_first_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'first_name'), '');
    v_last_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'last_name'), '');

    v_requested_role := LOWER(NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), ''));
    v_role := CASE
        WHEN v_requested_role IN ('job_seeker', 'company') THEN v_requested_role::public.user_role
        ELSE 'job_seeker'::public.user_role
    END;

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
        v_role,
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

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- With signup no longer able to grant 'admin', a trusted path is needed to
-- provision admins. API clients (anon / authenticated) still need an in-app
-- admin to change any role; trusted database roles (postgres, service_role)
-- may change roles. SECURITY INVOKER so current_user is the executing role.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (NEW.role IS DISTINCT FROM OLD.role)
       AND current_user IN ('anon', 'authenticated')
       AND NOT public.is_admin((SELECT auth.uid())) THEN
        RAISE EXCEPTION 'Unauthorized: Users are not permitted to change their own role'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_profile_role_update() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. COMPANY CREATION SECURITY
-- ============================================================================

-- Was WITH CHECK (TRUE): any authenticated user, including job seekers, could
-- create a company and then claim its owner seat.
DROP POLICY IF EXISTS "Authenticated users register company" ON public.companies;
DROP POLICY IF EXISTS "Company users register company" ON public.companies;
CREATE POLICY "Company users register company"
    ON public.companies FOR INSERT
    TO authenticated
    WITH CHECK (public.has_profile_role(ARRAY['company', 'admin']::public.user_role[]));

-- Was any active member (is_company_member), so a recruiter or hiring manager
-- could edit the company profile directly through the REST API. Business rule:
-- only active owners and admins of the company edit its profile; platform
-- admins keep access. Matches PATCH /api/company/:companyId/profile.
DROP POLICY IF EXISTS "Company members update their company" ON public.companies;
DROP POLICY IF EXISTS "Company owners and admins update their company" ON public.companies;
CREATE POLICY "Company owners and admins update their company"
    ON public.companies FOR UPDATE
    TO authenticated
    USING (
        public.has_company_member_role(id, ARRAY['owner', 'admin']::public.company_member_role[])
        OR public.is_admin((SELECT auth.uid()))
    )
    WITH CHECK (
        public.has_company_member_role(id, ARRAY['owner', 'admin']::public.company_member_role[])
        OR public.is_admin((SELECT auth.uid()))
    );

-- The 003 INSERT/UPDATE/DELETE policies on company_members subquery
-- company_members itself. Because every policy also contains a sub-select
-- ((SELECT auth.uid())), PostgreSQL rejects these statements with
-- "infinite recursion detected in policy" (42P17), so owner bootstrap,
-- team invites and member updates/removals could not succeed. They now
-- resolve membership through SECURITY DEFINER helpers; who may do what is
-- unchanged, except the first-owner clause below.
--
-- The first-owner clause also used NOT EXISTS over company_members under RLS,
-- which only sees the caller's own companies, and allowed any role. Now the
-- caller must be a company-role user claiming the owner seat of a company that
-- has no memberships at all.
DROP POLICY IF EXISTS "Company creator can insert first owner membership" ON public.company_members;
DROP POLICY IF EXISTS "Insert company membership" ON public.company_members;
CREATE POLICY "Insert company membership"
    ON public.company_members FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Creator adding the first (owner) membership
        (
            profile_id = (SELECT auth.uid())
            AND role = 'owner'
            AND public.has_profile_role(ARRAY['company']::public.user_role[])
            AND NOT public.company_has_members(company_id)
        )
        -- Or existing owner/admin inviting member
        OR public.has_company_member_role(company_id, ARRAY['owner', 'admin']::public.company_member_role[])
        OR public.is_admin((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Company owners and admins update memberships" ON public.company_members;
CREATE POLICY "Company owners and admins update memberships"
    ON public.company_members FOR UPDATE
    TO authenticated
    USING (
        public.has_company_member_role(company_id, ARRAY['owner', 'admin']::public.company_member_role[])
        OR public.is_admin((SELECT auth.uid()))
    )
    WITH CHECK (
        public.has_company_member_role(company_id, ARRAY['owner', 'admin']::public.company_member_role[])
        OR public.is_admin((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Company owners delete memberships" ON public.company_members;
CREATE POLICY "Company owners delete memberships"
    ON public.company_members FOR DELETE
    TO authenticated
    USING (
        public.has_company_member_role(company_id, ARRAY['owner']::public.company_member_role[])
        OR public.is_admin((SELECT auth.uid()))
    );

-- Same as migration 003, plus:
--   - membership changes are serialized per company (transaction-scoped advisory
--     lock), so two concurrent first-owner claims cannot both succeed;
--   - an active membership requires a 'company' profile (business rule: only
--     company accounts can be team members; existing non-company members can
--     still be deactivated, but not reactivated or edited while active);
--   - the first-member bootstrap also requires a company-role caller;
--   - trusted contexts (service-role key, direct SQL) may deactivate a
--     membership and nothing else. This is what lets a trusted operator change
--     a company account's role (memberships must be inactive first, see
--     prevent_company_role_loss_with_active_memberships). The last-owner rule
--     still applies.
CREATE OR REPLACE FUNCTION public.enforce_company_membership_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role public.company_member_role;
    v_is_first_member BOOLEAN;
    v_member_profile_role public.user_role;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('company_members:' || NEW.company_id::text, 0));

    IF NEW.is_active THEN
        SELECT role INTO v_member_profile_role FROM public.profiles WHERE id = NEW.profile_id;
        IF v_member_profile_role IS DISTINCT FROM 'company' THEN
            RAISE EXCEPTION 'Only company accounts can be active company team members'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE'
       AND public.is_trusted_db_context()
       AND OLD.is_active AND NOT NEW.is_active
       AND NEW.company_id = OLD.company_id
       AND NEW.profile_id = OLD.profile_id
       AND NEW.role = OLD.role THEN
        RETURN NEW;
    END IF;

    -- Check if company currently has zero members (initial creation)
    SELECT NOT EXISTS (
        SELECT 1 FROM public.company_members cm WHERE cm.company_id = NEW.company_id
    ) INTO v_is_first_member;

    IF TG_OP = 'INSERT' AND v_is_first_member THEN
        -- Initial company creator is allowed to assign themselves as owner
        IF NEW.profile_id = (SELECT auth.uid())
           AND NEW.role = 'owner'
           AND public.has_profile_role(ARRAY['company']::public.user_role[]) THEN
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

REVOKE EXECUTE ON FUNCTION public.enforce_company_membership_hierarchy() FROM PUBLIC, anon, authenticated;

-- Business rule: a company always keeps at least one active owner. Deleting,
-- deactivating, demoting or moving the last active owner is rejected, for every
-- caller. This includes the cascade from deleting the owner's account
-- (auth.users -> profiles -> company_members): a sole owner must transfer
-- ownership, or the company must be deleted, before the account can be deleted.
-- Only the cascade from deleting the company itself is allowed.
CREATE OR REPLACE FUNCTION public.prevent_last_owner_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT (OLD.role = 'owner' AND OLD.is_active) THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.role = 'owner' AND NEW.is_active AND NEW.company_id = OLD.company_id THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
        RETURN OLD;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('company_members:' || OLD.company_id::text, 0));

    IF NOT EXISTS (
        SELECT 1 FROM public.company_members
        WHERE company_id = OLD.company_id
          AND id <> OLD.id
          AND role = 'owner'
          AND is_active = TRUE
    ) THEN
        IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.profile_id) THEN
            RAISE EXCEPTION 'This account is the only active owner of company %. Transfer ownership or delete the company before deleting the account.', OLD.company_id
                USING ERRCODE = '23514';
        END IF;
        RAISE EXCEPTION 'A company must keep at least one active owner' USING ERRCODE = '23514';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_owner_removal ON public.company_members;
CREATE TRIGGER trg_prevent_last_owner_removal
    BEFORE UPDATE OR DELETE ON public.company_members
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_last_owner_removal();

REVOKE EXECUTE ON FUNCTION public.prevent_last_owner_removal() FROM PUBLIC, anon, authenticated;

-- The other half of "active team members are company accounts": a profile
-- cannot stop being 'company' while it still holds an active membership.
-- Every company-access path (is_company_member, has_company_member_role and
-- the inline policies) requires an active membership, so this keeps a former
-- company account from retaining team access. Deactivate the memberships
-- first (the last-owner rule still applies), then change the role.
CREATE OR REPLACE FUNCTION public.prevent_company_role_loss_with_active_memberships()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.role = 'company'
       AND NEW.role IS DISTINCT FROM 'company'
       AND EXISTS (
           SELECT 1 FROM public.company_members
           WHERE profile_id = OLD.id AND is_active = TRUE
       ) THEN
        RAISE EXCEPTION 'Deactivate this account''s company memberships before changing its role'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_company_role_loss ON public.profiles;
CREATE TRIGGER trg_prevent_company_role_loss
    BEFORE UPDATE OF role ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_company_role_loss_with_active_memberships();

REVOKE EXECUTE ON FUNCTION public.prevent_company_role_loss_with_active_memberships() FROM PUBLIC, anon, authenticated;

-- Atomic company creation: the company row and the caller's owner membership
-- are created in one transaction, so no ownerless company is left behind.
-- p_company accepts the existing public.companies profile columns; unknown keys are ignored.
-- Business rule: an account creates at most one company while it holds an active
-- membership. Calls are serialized per account (transaction-scoped advisory lock),
-- so two concurrent calls by the same account cannot both pass the check.
-- This covers this function only: being invited to another company is unchanged.
CREATE OR REPLACE FUNCTION public.create_company_with_owner(p_company JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := (SELECT auth.uid());
    v_input public.companies;
    v_company_id UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_profile_role(ARRAY['company']::public.user_role[]) THEN
        RAISE EXCEPTION 'Only company accounts can create a company' USING ERRCODE = '42501';
    END IF;

    v_input := jsonb_populate_record(NULL::public.companies, COALESCE(p_company, '{}'::jsonb));

    IF NULLIF(TRIM(v_input.name), '') IS NULL THEN
        RAISE EXCEPTION 'Company name is required' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('company_creator:' || v_uid::text, 0));

    IF EXISTS (
        SELECT 1 FROM public.company_members
        WHERE profile_id = v_uid AND is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'This account already belongs to a company' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.companies (
        name, description, industry, website, company_size, founded_year,
        logo_url, email, phone, location, city, state, country
    )
    VALUES (
        TRIM(v_input.name), v_input.description, v_input.industry, v_input.website,
        v_input.company_size, v_input.founded_year, v_input.logo_url, v_input.email,
        v_input.phone, v_input.location, v_input.city, v_input.state, v_input.country
    )
    RETURNING id INTO v_company_id;

    INSERT INTO public.company_members (company_id, profile_id, role, is_active)
    VALUES (v_company_id, v_uid, 'owner', TRUE);

    RETURN v_company_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_company_with_owner(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company_with_owner(JSONB) TO authenticated;

-- ============================================================================
-- 3. PROFILE DATA ACCESS
-- ============================================================================

-- Was USING (TRUE): every authenticated user could read every profile,
-- including email and phone.
DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable by self and related users" ON public.profiles;
CREATE POLICY "Profiles viewable by self and related users"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (public.can_view_profile(id));

-- Team invites look up an existing account by email. Only active owners/admins
-- of the given company (or platform admins) may call it; exact email match only.
-- Only 'company' accounts are returned, because only they can be active team
-- members; job-seeker accounts are indistinguishable from unknown emails.
-- The lookup only reads: adding the member still goes through the
-- company_members INSERT policy and the hierarchy trigger.
DROP FUNCTION IF EXISTS public.find_profile_for_team_invite(UUID, TEXT);
CREATE FUNCTION public.find_profile_for_team_invite(p_company_id UUID, p_email TEXT)
RETURNS TABLE (id UUID, email TEXT, full_name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
    IF NOT (
        public.is_admin((SELECT auth.uid()))
        OR EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = p_company_id
              AND cm.profile_id = (SELECT auth.uid())
              AND cm.role IN ('owner', 'admin')
              AND cm.is_active = TRUE
        )
    ) THEN
        RAISE EXCEPTION 'Only company owners and admins can look up team members' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
        SELECT p.id, p.email, p.full_name
        FROM public.profiles p
        WHERE LOWER(p.email) = LOWER(TRIM(p_email))
          AND p.role = 'company'
        LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.find_profile_for_team_invite(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_profile_for_team_invite(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 4. APPLICATION VALIDATION
-- ============================================================================

-- check_application_eligibility (002) is SECURITY DEFINER and accepts any
-- job_seeker_id, so any signed-in user could read another candidate's
-- application status/id and missing profile fields. It is now internal only:
-- validate_application_insert (below) calls it with definer rights.
REVOKE EXECUTE ON FUNCTION public.check_application_eligibility(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- The INSERT policy only checks job_seeker_id, so a candidate could apply to a
-- draft/closed job, send a company_id that does not own the job, start in any
-- status, set match_score, or attach another candidate's resume.
CREATE OR REPLACE FUNCTION public.validate_application_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_job_company_id UUID;
    v_eligibility JSONB;
BEGIN
    SELECT company_id INTO v_job_company_id FROM public.jobs WHERE id = NEW.job_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Job not found' USING ERRCODE = '23503';
    END IF;

    -- company_id is derived from the job; a mismatching value is rejected.
    IF NEW.company_id IS NULL THEN
        NEW.company_id := v_job_company_id;
    ELSIF NEW.company_id IS DISTINCT FROM v_job_company_id THEN
        RAISE EXCEPTION 'company_id does not match the company that owns this job' USING ERRCODE = '23514';
    END IF;

    IF NEW.resume_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.resumes r
        WHERE r.id = NEW.resume_id AND r.job_seeker_id = NEW.job_seeker_id
    ) THEN
        RAISE EXCEPTION 'Resume does not belong to this job seeker' USING ERRCODE = '23514';
    END IF;

    -- Only trusted contexts (service-role key, direct SQL) may backfill. Every API
    -- user, including platform admins, goes through the existing eligibility rules;
    -- there is no admin INSERT policy on applications, so an admin bypass would
    -- only ever apply to an admin applying for themselves.
    IF NOT public.is_trusted_db_context() THEN
        IF NEW.status IS DISTINCT FROM 'pending' THEN
            RAISE EXCEPTION 'New applications must start in pending status' USING ERRCODE = '42501';
        END IF;

        IF NEW.match_score IS NOT NULL THEN
            RAISE EXCEPTION 'match_score is assigned by the matching process' USING ERRCODE = '42501';
        END IF;

        v_eligibility := public.check_application_eligibility(NEW.job_seeker_id, NEW.job_id);
        IF NOT COALESCE((v_eligibility->>'is_eligible')::BOOLEAN, FALSE) THEN
            RAISE EXCEPTION 'Application not allowed: %', COALESCE(v_eligibility->>'reason', 'not eligible')
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_application_insert ON public.applications;
CREATE TRIGGER trg_validate_application_insert
    BEFORE INSERT ON public.applications
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_application_insert();

REVOKE EXECUTE ON FUNCTION public.validate_application_insert() FROM PUBLIC, anon, authenticated;

-- Same as migration 003, plus: resume_id may only point at the applicant's own
-- resume (a company member could otherwise repoint it and read any resume row),
-- and candidates cannot rewrite match_score or applied_at.
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

    IF NEW.resume_id IS DISTINCT FROM OLD.resume_id
       AND NEW.resume_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM public.resumes r
           WHERE r.id = NEW.resume_id AND r.job_seeker_id = OLD.job_seeker_id
       ) THEN
        RAISE EXCEPTION 'Resume does not belong to this job seeker' USING ERRCODE = '23514';
    END IF;

    -- Check actor authorization
    v_is_company_member := public.is_company_member(OLD.company_id, (SELECT auth.uid()));
    SELECT profile_id INTO v_candidate_user_id FROM public.job_seeker_profiles WHERE id = OLD.job_seeker_id;
    v_candidate_user_id := COALESCE(v_candidate_user_id, '00000000-0000-0000-0000-000000000000'::uuid);
    v_is_candidate := (v_candidate_user_id = (SELECT auth.uid()));

    IF v_is_candidate AND NOT v_is_company_member AND NOT public.is_admin((SELECT auth.uid())) THEN
        IF NEW.match_score IS DISTINCT FROM OLD.match_score THEN
            RAISE EXCEPTION 'Candidates cannot change match_score' USING ERRCODE = '42501';
        END IF;
        IF NEW.applied_at IS DISTINCT FROM OLD.applied_at THEN
            RAISE EXCEPTION 'Candidates cannot change applied_at' USING ERRCODE = '42501';
        END IF;
    END IF;

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

REVOKE EXECUTE ON FUNCTION public.validate_application_update() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5. MATCHING VALIDATION
-- ============================================================================

-- Same as migration 001, except only a 'like' on a published job creates a
-- match (and, through on_match_created, a conversation). The swipe itself is
-- still recorded so the seeker does not see the job again.
CREATE OR REPLACE FUNCTION public.check_and_create_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_job_company_id UUID;
BEGIN
    IF NEW.direction = 'like' THEN
        SELECT company_id INTO v_job_company_id
        FROM public.jobs
        WHERE id = NEW.job_id AND status = 'published';

        IF v_job_company_id IS NOT NULL THEN
            INSERT INTO public.matches (job_id, job_seeker_id, company_id, status)
            VALUES (NEW.job_id, NEW.job_seeker_id, v_job_company_id, 'active')
            ON CONFLICT (job_id, job_seeker_id) DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_and_create_match() FROM PUBLIC, anon, authenticated;

-- "Matches manageable by company or admin" allows UPDATE of any column, so a
-- company member could repoint job_seeker_id at any candidate and gain read
-- access to that candidate's profile data. Keys are immutable, mirroring the
-- existing rule for applications.
CREATE OR REPLACE FUNCTION public.prevent_match_key_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.job_id IS DISTINCT FROM OLD.job_id
       OR NEW.job_seeker_id IS DISTINCT FROM OLD.job_seeker_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
        RAISE EXCEPTION 'Cannot modify job_id, job_seeker_id or company_id of an existing match'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_match_key_update ON public.matches;
CREATE TRIGGER trg_prevent_match_key_update
    BEFORE UPDATE ON public.matches
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_match_key_update();

REVOKE EXECUTE ON FUNCTION public.prevent_match_key_update() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 6. MESSAGING POLICIES
-- ============================================================================

-- The 003 conversation_members SELECT policy queried conversation_members
-- itself, which PostgreSQL rejects with "infinite recursion detected in policy"
-- (42P17). Every policy that subqueried conversation_members inherited the
-- error. Membership is now resolved through is_conversation_member(); access
-- rules are unchanged: participants only, plus platform admins.

DROP POLICY IF EXISTS "Conversations accessible only by conversation members" ON public.conversations;
CREATE POLICY "Conversations accessible only by conversation members"
    ON public.conversations FOR SELECT
    TO authenticated
    USING (
        public.is_conversation_member(id)
        OR public.is_admin((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Conversation members view member list" ON public.conversation_members;
CREATE POLICY "Conversation members view member list"
    ON public.conversation_members FOR SELECT
    TO authenticated
    USING (
        public.is_conversation_member(conversation_id)
        OR public.is_admin((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Messages readable by conversation members" ON public.messages;
CREATE POLICY "Messages readable by conversation members"
    ON public.messages FOR SELECT
    TO authenticated
    USING (
        public.is_conversation_member(conversation_id)
        OR public.is_admin((SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Messages insertable by conversation members" ON public.messages;
CREATE POLICY "Messages insertable by conversation members"
    ON public.messages FOR INSERT
    TO authenticated
    WITH CHECK (
        sender_id = (SELECT auth.uid())
        AND public.is_conversation_member(conversation_id)
    );

DROP POLICY IF EXISTS "Message Attachments Access" ON storage.objects;
CREATE POLICY "Message Attachments Access"
    ON storage.objects FOR ALL
    TO authenticated
    USING (
        bucket_id = 'message-attachments'
        AND public.is_conversation_member((storage.foldername(name))[1]::uuid)
    );
