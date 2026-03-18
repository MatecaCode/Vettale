-- ============================================================
-- Modify link_client_when_email_confirmed() to emit
-- client_account_claimed admin notifications.
--
-- INVARIANTS PRESERVED:
--   • All existing link/role-upsert logic is untouched.
--   • Notification only fires when the UPDATE actually linked
--     an admin-created client (ROW_COUNT guard).
--   • Notification emit is wrapped in BEGIN/EXCEPTION so any
--     failure CANNOT affect the claim path.
--   • Dedupe key prevents duplicate notifications on retry.
-- ============================================================

CREATE OR REPLACE FUNCTION public.link_client_when_email_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_client_name    text;
  v_client_id      uuid;
  v_rows_updated   integer;
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND (OLD.email_confirmed_at IS NULL
          OR OLD.email_confirmed_at <> NEW.email_confirmed_at) THEN

    -- Read the admin-created client name (for notification body)
    SELECT c.name
      INTO v_client_name
      FROM public.clients c
     WHERE c.admin_created = true
       AND lower(c.email)  = lower(NEW.email)
     ORDER BY c.created_at DESC
     LIMIT 1;

    -- Link client to auth user (unchanged)
    UPDATE public.clients c
       SET user_id    = NEW.id,
           claimed_at = COALESCE(c.claimed_at, NOW())
     WHERE c.user_id IS NULL
       AND c.admin_created = true
       AND lower(c.email)  = lower(NEW.email);

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    -- Upsert role (unchanged)
    INSERT INTO public.user_roles (user_id, role, name)
    VALUES (
      NEW.id,
      'client',
      COALESCE(v_client_name, NEW.raw_user_meta_data->>'name', NEW.email, 'Cliente')
    )
    ON CONFLICT (user_id) DO UPDATE SET
      role = 'client',
      name = COALESCE(EXCLUDED.name, public.user_roles.name);

    RAISE LOG '✅ Client claimed; role upserted with name=%, user_id=%',
      COALESCE(v_client_name, NEW.raw_user_meta_data->>'name', NEW.email, 'Cliente'),
      NEW.id;

    -- Emit admin notification only when an admin-created client was linked
    IF v_rows_updated > 0 THEN
      BEGIN
        SELECT c.id INTO v_client_id
          FROM public.clients c
         WHERE c.user_id      = NEW.id
           AND c.admin_created = true
         LIMIT 1;

        IF v_client_id IS NOT NULL THEN
          PERFORM public.notify_all_admins(
            'client_account_claimed',
            'client',
            v_client_id,
            'Conta de Cliente Vinculada',
            COALESCE(v_client_name, NEW.email, 'Cliente') ||
              ' confirmou o e-mail e vinculou sua conta.',
            '/admin/clients?highlight=' || v_client_id::text,
            'link_client_when_email_confirmed',
            jsonb_build_object(
              'client_id',    v_client_id,
              'auth_user_id', NEW.id,
              'email',        NEW.email
            ),
            'client_account_claimed:' || v_client_id::text
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG '[link_client_when_email_confirmed] notification emit failed: %', SQLERRM;
      END;
    END IF;

  END IF;
  RETURN NEW;
END;
$function$;
