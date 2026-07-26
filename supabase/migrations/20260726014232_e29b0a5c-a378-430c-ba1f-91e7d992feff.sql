-- =========================================================
-- 1. SCHEMA ADDITIONS
-- =========================================================
ALTER TABLE public.investors
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_label text,
  ADD COLUMN IF NOT EXISTS fee_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.funds
  ADD COLUMN IF NOT EXISTS default_admin_fee_pct numeric(5,2) NOT NULL DEFAULT 20.00;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS admin_notes text;

ALTER TABLE public.capital_contributions
  ADD COLUMN IF NOT EXISTS is_correction boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reverses_id uuid REFERENCES public.capital_contributions(id);

ALTER TABLE public.capital_withdrawals
  ADD COLUMN IF NOT EXISTS is_correction boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reverses_id uuid REFERENCES public.capital_withdrawals(id);

UPDATE public.funds SET name = 'SCALPING FOX Algorithmic Capital Fund' WHERE name = 'MRD Fund';

-- =========================================================
-- 2. IMMUTABILITY GUARDS
-- =========================================================
CREATE OR REPLACE FUNCTION public.prevent_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de % son inmutables. Registre un movimiento de correccion/reverso.', TG_TABLE_NAME
    USING ERRCODE = '42501';
END; $$;

DROP TRIGGER IF EXISTS contrib_immutable ON public.capital_contributions;
CREATE TRIGGER contrib_immutable BEFORE UPDATE OR DELETE ON public.capital_contributions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_write();

DROP TRIGGER IF EXISTS wd_immutable ON public.capital_withdrawals;
CREATE TRIGGER wd_immutable BEFORE UPDATE OR DELETE ON public.capital_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.prevent_write();

DROP TRIGGER IF EXISTS snap_immutable ON public.investor_cycle_snapshots;
CREATE TRIGGER snap_immutable BEFORE UPDATE OR DELETE ON public.investor_cycle_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.prevent_write();

DROP TRIGGER IF EXISTS funds_no_delete ON public.funds;
CREATE TRIGGER funds_no_delete BEFORE DELETE ON public.funds
  FOR EACH ROW EXECUTE FUNCTION public.prevent_write();

DROP TRIGGER IF EXISTS investors_no_delete ON public.investors;
CREATE TRIGGER investors_no_delete BEFORE DELETE ON public.investors
  FOR EACH ROW EXECUTE FUNCTION public.prevent_write();

CREATE OR REPLACE FUNCTION public.guard_fund_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los cortes no pueden eliminarse.' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'El corte % ya esta cerrado y es inmutable.', OLD.cycle_number USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'closed' AND NEW.open_positions THEN
    RAISE EXCEPTION 'No se puede cerrar el corte con operaciones abiertas.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS cycles_guard ON public.fund_cycles;
CREATE TRIGGER cycles_guard BEFORE UPDATE OR DELETE ON public.fund_cycles
  FOR EACH ROW EXECUTE FUNCTION public.guard_fund_cycle();

-- =========================================================
-- 3. SERVER-SIDE AUDIT TRAIL (append-only, DB generated)
-- =========================================================
CREATE OR REPLACE FUNCTION public.audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_id uuid;
  v_meta jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entity_id := OLD.id;
    v_meta := to_jsonb(OLD);
  ELSE
    v_entity_id := NEW.id;
    v_meta := to_jsonb(NEW);
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, metadata)
  VALUES (auth.uid(), lower(TG_OP), TG_TABLE_NAME, v_entity_id, v_meta);

  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS audit_contrib ON public.capital_contributions;
CREATE TRIGGER audit_contrib AFTER INSERT ON public.capital_contributions
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

DROP TRIGGER IF EXISTS audit_wd ON public.capital_withdrawals;
CREATE TRIGGER audit_wd AFTER INSERT ON public.capital_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

DROP TRIGGER IF EXISTS audit_snap ON public.investor_cycle_snapshots;
CREATE TRIGGER audit_snap AFTER INSERT ON public.investor_cycle_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

DROP TRIGGER IF EXISTS audit_cycles ON public.fund_cycles;
CREATE TRIGGER audit_cycles AFTER INSERT OR UPDATE ON public.fund_cycles
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

DROP TRIGGER IF EXISTS audit_funds ON public.funds;
CREATE TRIGGER audit_funds AFTER UPDATE ON public.funds
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

DROP TRIGGER IF EXISTS audit_investors ON public.investors;
CREATE TRIGGER audit_investors AFTER INSERT OR UPDATE ON public.investors
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

DROP TRIGGER IF EXISTS audit_roles ON public.user_roles;
CREATE TRIGGER audit_roles AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

DROP TRIGGER IF EXISTS audit_profiles ON public.profiles;
CREATE TRIGGER audit_profiles AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

-- audit_logs itself is append-only and not writable from the API
DROP POLICY IF EXISTS audit_insert ON public.audit_logs;
DROP TRIGGER IF EXISTS audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_write();

-- =========================================================
-- 4. ROLE MANAGEMENT POLICIES (admin lookout panel)
-- =========================================================
DROP POLICY IF EXISTS user_roles_admin_insert ON public.user_roles;
CREATE POLICY user_roles_admin_insert ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS user_roles_admin_delete ON public.user_roles;
CREATE POLICY user_roles_admin_delete ON public.user_roles
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()) AND user_id <> auth.uid());

-- profiles: users may edit their own non-privileged data, admins may edit all
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING ((auth.uid() = id) OR public.is_admin(auth.uid()))
  WITH CHECK ((auth.uid() = id) OR public.is_admin(auth.uid()));

-- =========================================================
-- 5. GRANTS: least privilege + hard immutability at API layer
-- =========================================================
REVOKE ALL ON public.audit_logs, public.capital_contributions, public.capital_withdrawals,
  public.investor_cycle_snapshots, public.fund_cycles, public.funds, public.investors,
  public.profiles, public.user_roles FROM anon, authenticated;

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.capital_contributions TO authenticated;
GRANT SELECT, INSERT ON public.capital_withdrawals TO authenticated;
GRANT SELECT, INSERT ON public.investor_cycle_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.fund_cycles TO authenticated;
GRANT SELECT, UPDATE ON public.funds TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.investors TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated;

GRANT ALL ON public.audit_logs, public.capital_contributions, public.capital_withdrawals,
  public.investor_cycle_snapshots, public.fund_cycles, public.funds, public.investors,
  public.profiles, public.user_roles TO service_role;

-- =========================================================
-- 6. SECURITY DEFINER SURFACE HARDENING
-- =========================================================
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_fund_cycle() FROM PUBLIC, anon, authenticated;

-- Only the two role checks required by RLS policies stay callable, and only for signed-in users.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

-- =========================================================
-- 7. GENESIS PROVISIONING
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'username'),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  IF NEW.email = 'm1696rd@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'investor') ON CONFLICT DO NOTHING;
    UPDATE public.profiles SET username = 'MauRD16', full_name = 'Mauricio' WHERE id = NEW.id;
    -- Genesis owns BOTH internal financial positions
    UPDATE public.investors SET user_id = NEW.id
      WHERE display_name IN ('Mauricio', 'Alfredo') AND user_id IS NULL;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'investor') ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS set_funds_updated_at ON public.funds;
CREATE TRIGGER set_funds_updated_at BEFORE UPDATE ON public.funds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_investors_updated_at ON public.investors;
CREATE TRIGGER set_investors_updated_at BEFORE UPDATE ON public.investors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();