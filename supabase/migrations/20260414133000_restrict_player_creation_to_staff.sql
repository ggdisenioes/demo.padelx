-- Restrict direct player creation to admin/manager roles.
-- This protects the table even if someone bypasses the app UI and calls Supabase directly.

CREATE OR REPLACE FUNCTION public.enforce_player_creator_role()
RETURNS trigger AS $$
DECLARE
  v_role text;
  v_active boolean;
  v_tenant_id uuid;
  v_jwt_role text;
BEGIN
  v_jwt_role := coalesce(current_setting('request.jwt.claim.role', true), '');

  -- Server-side jobs/API routes using the service role are already trusted callers.
  IF v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT p.role, p.active, p.tenant_id
    INTO v_role, v_active, v_tenant_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_active IS DISTINCT FROM true
    OR v_role NOT IN ('admin', 'manager', 'super_admin')
    OR v_tenant_id IS NULL
  THEN
    RAISE EXCEPTION 'PLAYER_CREATE_FORBIDDEN: Solo un admin o manager puede crear jugadores.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_tenant_id;
  ELSIF NEW.tenant_id IS DISTINCT FROM v_tenant_id AND v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'PLAYER_CREATE_FORBIDDEN: No puedes crear jugadores fuera de tu club.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_player_creator_role ON public.players;
CREATE TRIGGER trg_enforce_player_creator_role
  BEFORE INSERT ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_player_creator_role();
