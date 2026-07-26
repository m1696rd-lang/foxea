/*
# Atomic corte generation function

## Purpose
Provides a single atomic server-side function `generate_corte(p_closing_balance, p_admin_fee_pct)`
that closes the current open fund cycle, creates immutable investor snapshots, and opens the
next cycle — all within one database transaction. If any step fails, the entire operation
rolls back, so snapshots / cycle-closing / next-cycle-creation can never partially succeed.

## What it does (in order, inside the transaction)
1. Loads the single fund row and the currently-open cycle.
2. Validates the open cycle has no open positions (raises exception otherwise).
3. Captures opening balance, computes cycle profit = closing - opening, return %.
4. For each investor, computes opening capital at cycle start:
   contributions with contribution_date <= cycle.start_date
   minus withdrawals with withdrawal_date <= cycle.start_date
   plus realized net_profit from prior closed-cycle snapshots.
5. Participation % = investor opening / total opening.
6. Gross cycle profit = participation % * cycle profit.
7. Admin fee = gross * fee_pct/100 (only when gross > 0). Fee % comes from
   investor.fee_pct, falling back to fund.default_admin_fee_pct.
8. Net profit = gross - fee.
9. Inserts immutable investor_cycle_snapshots (one per investor).
10. Closes the current cycle: closing_balance, gross_profit, fund_return_pct,
    status='closed', closed_at, end_date, investor_count.
11. Opens the next cycle: cycle_number + 1, opening_balance = closing balance,
    status='open', open_positions=false.
12. Returns a JSON summary of the new closed cycle + new open cycle.

## Security
- SECURITY DEFINER, runs as the database owner (service_role-equivalent) so it can write
  to all tables in one transaction regardless of RLS.
- The audit_row triggers still fire on each INSERT/UPDATE, recording the caller via auth.uid().
- Caller must be authenticated; the function itself does NOT enforce admin — RLS on
  fund_cycles (admin-only UPDATE/INSERT) plus the guard_fund_cycle trigger already enforce
  that only admins can mutate cycles. We additionally check is_admin() here for defense in depth.

## Notes
- Does NOT recalculate or overwrite existing closed-cycle snapshots (they are immutable).
- Does NOT modify any contribution/withdrawal records.
- Does NOT change the fund's current_balance_manual (the admin sets that separately to reflect
  the broker balance; this function only reads it as the closing balance of the cycle).
- p_closing_balance is passed explicitly so the admin confirms the closing figure in the UI
  preview before committing.
*/

CREATE OR REPLACE FUNCTION public.generate_corte(
  p_closing_balance numeric,
  p_admin_fee_pct numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  -- Defense-in-depth: only admins may generate a corte.
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el administrador puede generar cortes.' USING ERRCODE = '42501';
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

  v_closing := COALESCE(p_closing_balance, v_fund.current_balance_manual);
  v_opening := v_cycle.opening_balance;
  v_profit  := v_closing - v_opening;
  v_return_pct := CASE WHEN v_opening > 0 THEN round((v_profit / v_opening) * 10000) / 10000 ELSE 0 END;
  v_fee_default := COALESCE(p_admin_fee_pct, v_fund.default_admin_fee_pct, 0);

  -- First pass: compute each investor's opening capital and the total.
  -- We build a temporary table to hold the computed values so the second pass
  -- (snapshot insert) can use them without recomputing.
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

-- Only authenticated users may invoke; RLS + is_admin() inside the function enforce admin.
REVOKE ALL ON FUNCTION public.generate_corte(numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_corte(numeric, numeric) TO authenticated;