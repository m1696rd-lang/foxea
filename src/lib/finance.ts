import { supabase } from "@/integrations/supabase/client";

export interface InvestorSummary {
  investor_id: string;
  user_id: string | null;
  display_name: string;
  date_joined: string;
  initial_contribution: number;
  total_contributed: number;
  total_withdrawn: number;
  current_capital: number;
  economic_result: number;
  pending_recovery: number;
  participation_pct: number;
  roi_pct: number;
  status: string;
}

export interface FundState {
  fund_id: string;
  name: string;
  initial_capital: number;
  current_balance: number;
  accumulated_profit: number;
  current_cycle: {
    id: string;
    number: number;
    start_date: string;
    opening_balance: number;
    profit: number;
    return_pct: number;
    open_positions: boolean;
    status: string;
  } | null;
  previous_cycle_number: number | null;
}

/**
 * Compute investor and fund state from raw records.
 * Distributes fund unrealized P/L across investors using their current-cycle
 * opening participation. Snapshots (closed cycles) are the source of truth
 * for historical results.
 */
export async function loadFundState(): Promise<{
  fund: FundState;
  investors: InvestorSummary[];
} | null> {
  const { data: funds } = await supabase.from("funds").select("*").limit(1);
  const fund = funds?.[0];
  if (!fund) return null;

  const [{ data: investors }, { data: cycles }, { data: contribs }, { data: withdrawals }, { data: snapshots }] = await Promise.all([
    supabase.from("investors").select("*").eq("fund_id", fund.id).order("date_joined"),
    supabase.from("fund_cycles").select("*").eq("fund_id", fund.id).order("cycle_number"),
    supabase.from("capital_contributions").select("*").eq("fund_id", fund.id),
    supabase.from("capital_withdrawals").select("*").eq("fund_id", fund.id),
    supabase.from("investor_cycle_snapshots").select("*"),
  ]);

  const openCycle = cycles?.find((c) => c.status === "open") ?? null;
  const lastClosedCycle = [...(cycles ?? [])].reverse().find((c) => c.status === "closed") ?? null;

  const currentBalance = Number(fund.current_balance_manual);
  const initialCapital = Number(fund.initial_capital);

  // Sum contributions & withdrawals per investor
  const contribByInv = new Map<string, number>();
  const wdByInv = new Map<string, number>();
  for (const c of contribs ?? []) contribByInv.set(c.investor_id, (contribByInv.get(c.investor_id) ?? 0) + Number(c.amount));
  for (const w of withdrawals ?? []) wdByInv.set(w.investor_id, (wdByInv.get(w.investor_id) ?? 0) + Number(w.amount));

  // Realized profit from closed snapshots per investor (net_profit sum)
  const realizedByInv = new Map<string, number>();
  for (const s of snapshots ?? []) {
    realizedByInv.set(s.investor_id, (realizedByInv.get(s.investor_id) ?? 0) + Number(s.net_profit));
  }

  // Capital basis for CURRENT open cycle participation:
  //  = investor's opening capital at cycle open
  //  = (contributions <= cycle.start_date) - (withdrawals <= cycle.start_date) + prior realized net_profit
  // For MVP with only cycle 1 open, opening = initial contributions.
  const openingByInv = new Map<string, number>();
  if (openCycle) {
    const start = openCycle.start_date;
    for (const inv of investors ?? []) {
      let opening = 0;
      for (const c of contribs ?? []) if (c.investor_id === inv.id && c.contribution_date <= start) opening += Number(c.amount);
      for (const w of withdrawals ?? []) if (w.investor_id === inv.id && w.withdrawal_date <= start) opening -= Number(w.amount);
      // Add realized net_profit from cycles that closed before this cycle
      for (const s of snapshots ?? []) {
        const sc = cycles?.find((cy) => cy.id === s.cycle_id);
        if (sc && sc.status === "closed" && sc.cycle_number < openCycle.cycle_number && s.investor_id === inv.id) {
          opening += Number(s.net_profit);
        }
      }
      openingByInv.set(inv.id, opening);
    }
  }

  const totalOpening = Array.from(openingByInv.values()).reduce((a, b) => a + b, 0);
  const cycleUnrealized = openCycle ? currentBalance - Number(openCycle.opening_balance) : 0;

  const summaries: InvestorSummary[] = (investors ?? []).map((inv) => {
    const total_contributed = contribByInv.get(inv.id) ?? 0;
    const total_withdrawn = wdByInv.get(inv.id) ?? 0;
    const opening = openingByInv.get(inv.id) ?? 0;
    const participation = totalOpening > 0 ? (opening / totalOpening) * 100 : 0;
    const unrealizedShare = totalOpening > 0 ? (opening / totalOpening) * cycleUnrealized : 0;
    const realized = realizedByInv.get(inv.id) ?? 0;
    // Current capital = opening + unrealized share (mid-cycle contributions/withdrawals of THIS cycle also affect it)
    // For MVP: mid-cycle flows in the open cycle apply to next cycle per user spec, so:
    const current_capital = opening + unrealizedShare;
    const economic_result = total_withdrawn + current_capital - total_contributed;
    const pending_recovery = total_contributed - total_withdrawn - current_capital;
    const roi_pct = total_contributed > 0 ? (economic_result / total_contributed) * 100 : 0;
    return {
      investor_id: inv.id,
      user_id: inv.user_id,
      display_name: inv.display_name,
      date_joined: inv.date_joined,
      initial_contribution: Number(inv.initial_contribution),
      total_contributed,
      total_withdrawn,
      current_capital,
      economic_result,
      pending_recovery,
      participation_pct: participation,
      roi_pct,
      status: inv.status,
    };
  });

  const cycleProfit = openCycle ? cycleUnrealized : 0;
  const accumulatedProfit = (snapshots ?? []).reduce((a, s) => a + Number(s.net_profit), 0) + cycleProfit;

  return {
    fund: {
      fund_id: fund.id,
      name: fund.name,
      initial_capital: initialCapital,
      current_balance: currentBalance,
      accumulated_profit: accumulatedProfit,
      current_cycle: openCycle
        ? {
            id: openCycle.id,
            number: openCycle.cycle_number,
            start_date: openCycle.start_date,
            opening_balance: Number(openCycle.opening_balance),
            profit: cycleProfit,
            return_pct: Number(openCycle.opening_balance) > 0 ? (cycleProfit / Number(openCycle.opening_balance)) * 100 : 0,
            open_positions: openCycle.open_positions,
            status: openCycle.status,
          }
        : null,
      previous_cycle_number: lastClosedCycle?.cycle_number ?? null,
    },
    investors: summaries,
  };
}
