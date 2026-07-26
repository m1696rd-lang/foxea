/*
# Harden SECURITY DEFINER functions (generate_corte, has_role, is_admin)

## Purpose
Resolve three security findings on the privileged SECURITY DEFINER functions without
weakening the authorization model or the atomic corte-generation transaction.

## Findings addressed
1. `public.has_role(_user_id uuid, _role app_role)` — SECURITY DEFINER with a string
   `search_path = 'public'`. Hardened: fixed `search_path = public, pg_temp`, read-only
   STABLE, cannot modify data. Retained SECURITY DEFINER because RLS policies on
   `user_roles` itself call `is_admin(auth.uid())` — without an owner-context read of
   `user_roles`, those policies would recurse infinitely / fail. This is the only
   legitimate reason for SECURITY DEFINER here.
2. `public.is_admin(_user_id uuid)` — same hardening; thin wrapper over `has_role`.
3. `public.generate_corte(p_closing_balance numeric, p_admin_fee_pct numeric)` —
   privileged atomic financial operation. Retained SECURITY DEFINER because it must
   write immutable snapshots + close the cycle + open the next cycle in ONE transaction
   regardless of RLS (RLS would otherwise block the cross-table multi-row write and
   break atomicity). Hardened: fixed `search_path = public, pg_temp`, strict input
   validation (closing balance > 0, fee 0..100), and a server-side admin authorization
   check via the hardened `is_admin(auth.uid())` so an investor invoking the RPC
   directly is rejected at the database layer.

## Security changes
- All three functions now use `SET search_path = public, pg_temp` (fixed, schema-qualified,
  includes pg_temp last so temp-table resolution still works for generate_corte's
  `CREATE TEMP TABLE _corte_alloc` without shadowing public objects).
- `has_role` / `is_admin` remain STABLE, read-only, SECURITY DEFINER — required by RLS.
- `generate_corte` remains SECURITY DEFINER — required for atomic cross-table writes.
  Added input validation: `p_closing_balance` must be > 0; `p_admin_fee_pct` (when
  provided) must be between 0 and 100 inclusive. Added explicit admin check that raises
  `42501` for non-admins (defense in depth on top of RLS).
- No RLS policies changed. No financial data modified. No accounting model changed.

## Notes
- The functions are re-created in dependency order: has_role -> is_admin -> generate_corte.
- Grants are re-asserted: has_role/is_admin executable by authenticated only (NOT anon);
  generate_corte executable by authenticated only (NOT anon). anon is explicitly revoked.
*/

-- =========================================================
-- 1. has_role: harden search_path, keep SECURITY DEFINER (required by RLS)
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- =========================================================
-- 2. is_admin: harden search_path, keep SECURITY DEFINER (required by RLS)
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

-- =========================================================
-- 3. generate_corte: harden search_path + input validation, keep SECURITY DEFINER
--    (required for the atomic cross-table financial transaction)
-- =========================================================
CREATE OR REPLACE FUNCTION public.generate_corte(
  p_closing_balance numeric,
  p_admin_fee_pct numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fund        RECORD;
  v_cycle       RECORD;
  v_closing     numeric;
  v_opening     numeric;
  v_profit      numeric;
  v_return_pct  numeric;
  v_fee_default numeric;
  v_today       date := CURRENT_DATE;
  v_now         timestamptz := now();
  v_investors   RECORD;
  v_inv_opening numeric;
  v_total_opening numeric := 0;
  v_gross       numeric;
  v_fee_pct     numeric;
  v_fee         numeric;
  v_net         numeric;
  v_closing_cap numeric;
  v_roi         numeric;
  v_snap_count  int := 0;
  v_next_num    int;
BEGIN
  -- Defense-in-depth: only admins may generate a corte. Enforced server-side.
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el administrador puede generar cortes.' USING ERRCODE = '42501';
  END IF;

  -- Input validation: closing balance must be positive.
  IF p_closing_balance IS NULL OR p_closing_balance <= 0 THEN
    RAISE EXCEPTION 'El balance de cierre debe ser un valor positivo.' USING ERRCODE = '23514';
  END IF;

  -- Input validation: admin fee (when provided) must be in [0, 100].
  IF p_admin_fee_pct IS NOT NULL AND (p_admin_fee_pct < 0 OR p_admin_fee_pct > 100) THEN
    RAISE EXCEPTION 'El fee de administracion debe estar entre 0 y 100.' USING ERRCODE = '23514';
  END IF;

  -- Single fund assumption (as elsewhere in the app).
  SELECT * INTO v_fund FROM public.funds LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe un fondo configurado.' USING ERRCODE = 'P0002';
  END IF;

  -- Currently open cycle.
  SELECT * INTO v_cycle FROM public.fund_cycles
    WHERE fund_id = v_fund.id AND status = 'open'
    ORDER BY cycle_number DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay un ciclo abierto para cerrar.' USING ERRCODE = 'P0002';
  END IF;

  IF v_cycle.open_positions THEN
    RAISE EXCEPTION 'No se puede cerrar el corte con operaciones abiertas.' USING ERRCODE = '42501';
  END IF;

  v_closing := p_closing_balance;
  v_opening := v_cycle.opening_balance;
  v_profit  := v_closing - v_opening;
  v_return_pct := CASE WHEN v_opening > 0 THEN round((v_profit / v_opening) * 10000) / 10000 ELSE 0 END;
  v_fee_default := COALESCE(p_admin_fee_pct, v_fund.default_admin_fee_pct, 0);

  -- Temp table for allocation; pg_temp is last in search_path so it cannot shadow public.
  CREATE TEMP TABLE _corte_alloc (
    investor_id uuid,
    opening numeric,
    participation numeric,
    gross numeric,
    fee_pct numeric,
    fee numeric,
    net numeric,
    closing_capital numeric,
    roi numeric
  ) ON COMMIT DROP;

  -- First pass: compute each investor's opening capital and the total.
  FOR v_investors IN SELECT id FROM public.investors WHERE fund_id = v_fund.id ORDER BY date_joined LOOP
    SELECT
      COALESCE((SELECT COALESCE(sum(amount),0) FROM public.capital_contributions
                 WHERE investor_id = v_investors.id AND contribution_date <= v_cycle.start_date),0)
      - COALESCE((SELECT COALESCE(sum(amount),0) FROM public.capital_withdrawals
                 WHERE investor_id = v_investors.id AND withdrawal_date <= v_cycle.start_date),0)
      + COALESCE((SELECT COALESCE(sum(s.net_profit),0) FROM public.investor_cycle_snapshots s
                   JOIN public.fund_cycles c ON c.id = s.cycle_id
                   WHERE s.investor_id = v_investors.id AND c.status = 'closed'
                     AND c.cycle_number < v_cycle.cycle_number),0)
    INTO v_inv_opening;

    v_total_opening := v_total_opening + v_inv_opening;
  END LOOP;

  -- Second pass: allocate profit per participation, compute fees, insert snapshots.
  FOR v_investors IN
    SELECT inv.id, inv.fee_pct, inv.display_name
    FROM public.investors inv
    WHERE inv.fund_id = v_fund.id
    ORDER BY inv.date_joined
  LOOP
    SELECT
      COALESCE((SELECT COALESCE(sum(amount),0) FROM public.capital_contributions
                 WHERE investor_id = v_investors.id AND contribution_date <= v_cycle.start_date),0)
      - COALESCE((SELECT COALESCE(sum(amount),0) FROM public.capital_withdrawals
                 WHERE investor_id = v_investors.id AND withdrawal_date <= v_cycle.start_date),0)
      + COALESCE((SELECT COALESCE(sum(s.net_profit),0) FROM public.investor_cycle_snapshots s
                   JOIN public.fund_cycles c ON c.id = s.cycle_id
                   WHERE s.investor_id = v_investors.id AND c.status = 'closed'
                     AND c.cycle_number < v_cycle.cycle_number),0)
    INTO v_inv_opening;

    IF v_total_opening > 0 THEN
      v_gross := (v_inv_opening / v_total_opening) * v_profit;
    ELSE
      v_gross := 0;
    END IF;

    v_fee_pct := COALESCE(v_investors.fee_pct, v_fee_default);
    IF v_gross > 0 AND v_fee_pct > 0 THEN
      v_fee := v_gross * (v_fee_pct / 100);
    ELSE
      v_fee := 0;
    END IF;
    v_net := v_gross - v_fee;
    v_closing_cap := v_inv_opening + v_net;
    v_roi := CASE WHEN v_inv_opening > 0 THEN round((v_net / v_inv_opening) * 10000) / 10000 ELSE 0 END;

    INSERT INTO public.investor_cycle_snapshots (
      cycle_id, investor_id,
      opening_capital, contributions_in_cycle, withdrawals_in_cycle,
      participation_pct, gross_profit,
      admin_fee_pct, admin_fee_amount, net_profit,
      closing_capital, cycle_roi_pct
    ) VALUES (
      v_cycle.id, v_investors.id,
      v_inv_opening, 0, 0,
      CASE WHEN v_total_opening > 0 THEN round((v_inv_opening / v_total_opening) * 10000) / 10000 ELSE 0 END,
      v_gross,
      CASE WHEN v_gross > 0 THEN v_fee_pct ELSE 0 END,
      v_fee, v_net,
      v_closing_cap, v_roi
    );
    v_snap_count := v_snap_count + 1;
  END LOOP;

  -- Close the current cycle.
  UPDATE public.fund_cycles SET
    closing_balance = v_closing,
    gross_profit = v_profit,
    fund_return_pct = v_return_pct,
    status = 'closed',
    closed_at = v_now,
    end_date = v_today,
    investor_count = v_snap_count
  WHERE id = v_cycle.id;

  -- Open the next cycle.
  v_next_num := v_cycle.cycle_number + 1;
  INSERT INTO public.fund_cycles (
    fund_id, cycle_number, start_date,
    opening_balance, status, open_positions
  ) VALUES (
    v_fund.id, v_next_num, v_today,
    v_closing, 'open', false
  );

  -- Return a summary the frontend can display.
  RETURN jsonb_build_object(
    'closed_cycle', jsonb_build_object(
      'cycle_number', v_cycle.cycle_number,
      'opening_balance', v_opening,
      'closing_balance', v_closing,
      'gross_profit', v_profit,
      'return_pct', v_return_pct,
      'investor_count', v_snap_count
    ),
    'new_cycle', jsonb_build_object(
      'cycle_number', v_next_num,
      'opening_balance', v_closing,
      'start_date', v_today
    )
  );
END; $$;

REVOKE ALL ON FUNCTION public.generate_corte(numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_corte(numeric, numeric) TO authenticated;