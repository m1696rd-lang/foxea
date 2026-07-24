
-- ============ ROLES ENUM + user_roles ============
CREATE TYPE public.app_role AS ENUM ('admin', 'investor');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'admin'::app_role) $$;

-- ============ FUNDS ============
CREATE TABLE public.funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  initial_capital NUMERIC(18,2) NOT NULL DEFAULT 0,
  current_balance_manual NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.funds TO authenticated;
GRANT ALL ON public.funds TO service_role;
ALTER TABLE public.funds ENABLE ROW LEVEL SECURITY;

-- ============ INVESTORS ============
CREATE TABLE public.investors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES public.funds(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  date_joined DATE NOT NULL DEFAULT CURRENT_DATE,
  initial_contribution NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(fund_id, user_id)
);
CREATE INDEX ON public.investors(user_id);
GRANT SELECT, INSERT, UPDATE ON public.investors TO authenticated;
GRANT ALL ON public.investors TO service_role;
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;

-- ============ FUND CYCLES ============
CREATE TABLE public.fund_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES public.funds(id) ON DELETE RESTRICT,
  cycle_number INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(18,2),
  gross_profit NUMERIC(18,2),
  fund_return_pct NUMERIC(9,4),
  investor_count INT,
  status TEXT NOT NULL DEFAULT 'open', -- open | closed
  open_positions BOOLEAN NOT NULL DEFAULT false,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(fund_id, cycle_number)
);
GRANT SELECT, INSERT, UPDATE ON public.fund_cycles TO authenticated;
GRANT ALL ON public.fund_cycles TO service_role;
ALTER TABLE public.fund_cycles ENABLE ROW LEVEL SECURITY;

-- ============ CAPITAL CONTRIBUTIONS ============
CREATE TABLE public.capital_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES public.funds(id),
  investor_id UUID NOT NULL REFERENCES public.investors(id),
  cycle_id UUID REFERENCES public.fund_cycles(id),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  contribution_date DATE NOT NULL DEFAULT CURRENT_DATE,
  contribution_type TEXT NOT NULL DEFAULT 'additional', -- initial | additional | new_investor
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.capital_contributions(investor_id);
CREATE INDEX ON public.capital_contributions(cycle_id);
GRANT SELECT, INSERT ON public.capital_contributions TO authenticated;
GRANT ALL ON public.capital_contributions TO service_role;
ALTER TABLE public.capital_contributions ENABLE ROW LEVEL SECURITY;

-- ============ CAPITAL WITHDRAWALS ============
CREATE TABLE public.capital_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES public.funds(id),
  investor_id UUID NOT NULL REFERENCES public.investors(id),
  cycle_id UUID REFERENCES public.fund_cycles(id),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  withdrawal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.capital_withdrawals(investor_id);
CREATE INDEX ON public.capital_withdrawals(cycle_id);
GRANT SELECT, INSERT ON public.capital_withdrawals TO authenticated;
GRANT ALL ON public.capital_withdrawals TO service_role;
ALTER TABLE public.capital_withdrawals ENABLE ROW LEVEL SECURITY;

-- ============ INVESTOR CYCLE SNAPSHOTS (immutable historical) ============
CREATE TABLE public.investor_cycle_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.fund_cycles(id),
  investor_id UUID NOT NULL REFERENCES public.investors(id),
  opening_capital NUMERIC(18,2) NOT NULL,
  contributions_in_cycle NUMERIC(18,2) NOT NULL DEFAULT 0,
  withdrawals_in_cycle NUMERIC(18,2) NOT NULL DEFAULT 0,
  participation_pct NUMERIC(9,4) NOT NULL,
  gross_profit NUMERIC(18,2) NOT NULL,
  admin_fee_pct NUMERIC(9,4) NOT NULL DEFAULT 0,
  admin_fee_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_profit NUMERIC(18,2) NOT NULL,
  closing_capital NUMERIC(18,2) NOT NULL,
  cycle_roi_pct NUMERIC(9,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cycle_id, investor_id)
);
GRANT SELECT, INSERT ON public.investor_cycle_snapshots TO authenticated;
GRANT ALL ON public.investor_cycle_snapshots TO service_role;
ALTER TABLE public.investor_cycle_snapshots ENABLE ROW LEVEL SECURITY;

-- ============ AUDIT LOGS ============
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.audit_logs(created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_funds_upd BEFORE UPDATE ON public.funds FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_investors_upd BEFORE UPDATE ON public.investors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cycles_upd BEFORE UPDATE ON public.fund_cycles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ RLS POLICIES ============

-- profiles: users see their own; admins see all; users update their own; admins update all
CREATE POLICY "profiles_select_self" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin(auth.uid()));
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_admin(auth.uid()));
CREATE POLICY "profiles_admin_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR auth.uid() = id);

-- user_roles: users read own; admins read all; only service role writes (admin ops via server fn)
CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- funds: everyone authenticated reads; only admins update
CREATE POLICY "funds_select" ON public.funds FOR SELECT TO authenticated USING (true);
CREATE POLICY "funds_admin_update" ON public.funds FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "funds_admin_insert" ON public.funds FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- investors: user sees own; admin sees all
CREATE POLICY "investors_select" ON public.investors FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "investors_admin_insert" ON public.investors FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "investors_admin_update" ON public.investors FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- cycles: all authenticated read; admin writes
CREATE POLICY "cycles_select" ON public.fund_cycles FOR SELECT TO authenticated USING (true);
CREATE POLICY "cycles_admin_insert" ON public.fund_cycles FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "cycles_admin_update" ON public.fund_cycles FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- contributions: user sees own; admin sees all; admin inserts
CREATE POLICY "contrib_select" ON public.capital_contributions FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR investor_id IN (SELECT id FROM public.investors WHERE user_id = auth.uid()));
CREATE POLICY "contrib_admin_insert" ON public.capital_contributions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- withdrawals: same as contributions
CREATE POLICY "wd_select" ON public.capital_withdrawals FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR investor_id IN (SELECT id FROM public.investors WHERE user_id = auth.uid()));
CREATE POLICY "wd_admin_insert" ON public.capital_withdrawals FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- snapshots: user sees own; admin sees all
CREATE POLICY "snap_select" ON public.investor_cycle_snapshots FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR investor_id IN (SELECT id FROM public.investors WHERE user_id = auth.uid()));
CREATE POLICY "snap_admin_insert" ON public.investor_cycle_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- audit: admin only reads; authenticated can insert (server fns tag actor)
CREATE POLICY "audit_admin_select" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- ============ auto-create profile on signup ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'username')
  )
  ON CONFLICT (id) DO NOTHING;

  -- Auto-grant Genesis Admin roles by email
  IF NEW.email = 'm1696rd@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'investor') ON CONFLICT DO NOTHING;
    -- Update the username to MauRD16
    UPDATE public.profiles SET username = 'MauRD16', full_name = 'Mauricio' WHERE id = NEW.id;
    -- Link the pre-seeded Mauricio investor to this user
    UPDATE public.investors SET user_id = NEW.id
      WHERE display_name = 'Mauricio' AND user_id IS NULL;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'investor') ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ SEED: fund, cycle, investors, initial contributions ============
DO $$
DECLARE
  v_fund_id UUID;
  v_cycle_id UUID;
  v_mauricio UUID;
  v_alfredo UUID;
BEGIN
  INSERT INTO public.funds (name, status, initial_capital, current_balance_manual)
  VALUES ('MRD Fund', 'active', 172.52, 172.52)
  RETURNING id INTO v_fund_id;

  INSERT INTO public.fund_cycles (fund_id, cycle_number, start_date, opening_balance, status, open_positions)
  VALUES (v_fund_id, 1, DATE '2026-07-13', 172.52, 'open', false)
  RETURNING id INTO v_cycle_id;

  INSERT INTO public.investors (fund_id, display_name, date_joined, initial_contribution)
  VALUES (v_fund_id, 'Mauricio', DATE '2026-07-13', 121.80)
  RETURNING id INTO v_mauricio;

  INSERT INTO public.investors (fund_id, display_name, date_joined, initial_contribution)
  VALUES (v_fund_id, 'Alfredo', DATE '2026-07-13', 50.72)
  RETURNING id INTO v_alfredo;

  INSERT INTO public.capital_contributions (fund_id, investor_id, cycle_id, amount, contribution_date, contribution_type, notes)
  VALUES
    (v_fund_id, v_mauricio, v_cycle_id, 121.80, DATE '2026-07-13', 'initial', 'Aporte inicial'),
    (v_fund_id, v_alfredo, v_cycle_id, 50.72, DATE '2026-07-13', 'initial', 'Aporte inicial');
END $$;
