-- Migration 005: signup must never self-assign a privileged role.
-- handle_new_user() trusted raw_user_meta_data->>'role', which any client can set
-- via supabase.auth.signUp, so {"role":"admin"} produced an admin profile.
-- NOT APPLIED to any database; review and apply deliberately.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_raw_full_name TEXT := NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), '');
    v_first_name TEXT := NULLIF(TRIM(NEW.raw_user_meta_data->>'first_name'), '');
    v_last_name TEXT := NULLIF(TRIM(NEW.raw_user_meta_data->>'last_name'), '');
    v_role public.user_role;
BEGIN
    IF v_raw_full_name IS NOT NULL AND v_first_name IS NULL THEN
        v_first_name := split_part(v_raw_full_name, ' ', 1);
        v_last_name := NULLIF(TRIM(substr(v_raw_full_name, length(v_first_name) + 1)), '');
    END IF;
    IF v_raw_full_name IS NULL AND (v_first_name IS NOT NULL OR v_last_name IS NOT NULL) THEN
        v_raw_full_name := TRIM(CONCAT_WS(' ', v_first_name, v_last_name));
    END IF;

    -- Only the two public roles are honoured; anything else falls back to job_seeker.
    v_role := CASE WHEN NEW.raw_user_meta_data->>'role' = 'company'
                   THEN 'company'::public.user_role ELSE 'job_seeker'::public.user_role END;

    INSERT INTO public.profiles (id, email, role, first_name, last_name, full_name, avatar_url, phone)
    VALUES (NEW.id, NEW.email, v_role, v_first_name, v_last_name, v_raw_full_name,
            NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'phone')
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
