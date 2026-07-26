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
  is_internal: boolean;
  fee_pct: number | null;
  group_label: string | null;
}

export interface FundState {
  fund_id: string;
  name: string;
  initial_capital: number;
  current_balance: number;
  accumulated_profit: number;
  accumulated_return_pct: number;
  default_admin_fee_pct: number;
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
  participant_count: number;
}

export interface CycleHistoryRow {
  id: string;
  cycle_number: number;
  start_date: string;
  end_date: string | null;
  opening_balance: number;
  closing_balance: number | null;
  gross_profit: number | null;
  fund_return_pct: number | null;
  investor_count: number | null;
  status: string;
  open_positions: boolean;
}

export interface CorteSnapshotRow {
  id: string;
  cycle_id: string;
  investor_id: string;
  display_name: string;
  opening_capital: number;
  participation_pct: number;
  gross_profit: number;
  admin_fee_pct: number;
  admin_fee_amount: number;
  net_profit: number;
  closing_capital: number;
  cycle_roi_pct: number;
}

export interface ActivityRow {
  id: string;
  created_at: string;
  action: string;
  entity: string;
  entity_id: string | null;
  user_id: string | null;
  metadata: Record<string, unknown> | null;
  actor_label: string;
  label: string;
  kind: "contribution" | "withdrawal" | "cycle" | "snapshot" | "investor" | "role" | "fund" | "profile";
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

  const contribByInv = new Map<string, number>();
  const wdByInv = new Map<string, number>();
  for (const c of contribs ?? []) contribByInv.set(c.investor_id, (contribByInv.get(c.investor_id) ?? 0) + Number(c.amount));
  for (const w of withdrawals ?? []) wdByInv.set(w.investor_id, (wdByInv.get(w.investor_id) ?? 0) + Number(w.amount));

  const realizedByInv = new Map<string, number>();
  for (const s of snapshots ?? []) {
    realizedByInv.set(s.investor_id, (realizedByInv.get(s.investor_id) ?? 0) + Number(s.net_profit));
  }

  const openingByInv = new Map<string, number>();
  if (openCycle) {
    const start = openCycle.start_date;
    for (const inv of investors ?? []) {
      let opening = 0;
      for (const c of contribs ?? []) if (c.investor_id === inv.id && c.contribution_date <= start) opening += Number(c.amount);
      for (const w of withdrawals ?? []) if (w.investor_id === inv.id && w.withdrawal_date <= start) opening -= Number(w.amount);
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
      is_internal: inv.is_internal ?? false,
      fee_pct: inv.fee_pct,
      group_label: inv.group_label,
    };
  });

  const cycleProfit = openCycle ? cycleUnrealized : 0;
  const accumulatedProfit = (snapshots ?? []).reduce((a, s) => a + Number(s.net_profit), 0) + cycleProfit;
  const accumulatedReturnPct = initialCapital > 0 ? (accumulatedProfit / initialCapital) * 100 : 0;

  return {
    fund: {
      fund_id: fund.id,
      name: fund.name,
      initial_capital: initialCapital,
      current_balance: currentBalance,
      accumulated_profit: accumulatedProfit,
      accumulated_return_pct: accumulatedReturnPct,
      default_admin_fee_pct: Number(fund.default_admin_fee_pct ?? 0),
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
      participant_count: investors?.length ?? 0,
    },
    investors: summaries,
  };
}

export async function loadCycleHistory(): Promise<CycleHistoryRow[]> {
  const { data: cycles } = await supabase
    .from("fund_cycles")
    .select("*")
    .order("cycle_number", { ascending: false });
  return (cycles ?? []).map((c) => ({
    id: c.id,
    cycle_number: c.cycle_number,
    start_date: c.start_date,
    end_date: c.end_date,
    opening_balance: Number(c.opening_balance),
    closing_balance: c.closing_balance != null ? Number(c.closing_balance) : null,
    gross_profit: c.gross_profit != null ? Number(c.gross_profit) : null,
    fund_return_pct: c.fund_return_pct != null ? Number(c.fund_return_pct) : null,
    investor_count: c.investor_count,
    status: c.status,
    open_positions: c.open_positions,
  }));
}

export async function loadCorteSnapshots(cycleId: string): Promise<CorteSnapshotRow[]> {
  const [{ data: snapshots }, { data: investors }] = await Promise.all([
    supabase.from("investor_cycle_snapshots").select("*").eq("cycle_id", cycleId),
    supabase.from("investors").select("id, display_name"),
  ]);
  const name = (id: string) => investors?.find((i) => i.id === id)?.display_name ?? "—";
  return (snapshots ?? [])
    .map((s) => ({
      id: s.id,
      cycle_id: s.cycle_id,
      investor_id: s.investor_id,
      display_name: name(s.investor_id),
      opening_capital: Number(s.opening_capital),
      participation_pct: Number(s.participation_pct),
      gross_profit: Number(s.gross_profit),
      admin_fee_pct: Number(s.admin_fee_pct),
      admin_fee_amount: Number(s.admin_fee_amount),
      net_profit: Number(s.net_profit),
      closing_capital: Number(s.closing_capital),
      cycle_roi_pct: Number(s.cycle_roi_pct),
    }))
    .sort((a, b) => b.opening_capital - a.opening_capital);
}

export async function loadRecentActivity(limit = 25): Promise<ActivityRow[]> {
  const [{ data: logs }, { data: profiles }] = await Promise.all([
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(limit),
    supabase.from("profiles").select("id, username, full_name, email"),
  ]);

  const actorLabel = (uid: string | null) => {
    if (!uid) return "Sistema";
    const p = profiles?.find((x) => x.id === uid);
    return p?.full_name || p?.username || p?.email || "—";
  };

  const kindFor = (entity: string): ActivityRow["kind"] => {
    switch (entity) {
      case "capital_contributions": return "contribution";
      case "capital_withdrawals": return "withdrawal";
      case "fund_cycles": return "cycle";
      case "investor_cycle_snapshots": return "snapshot";
      case "investors": return "investor";
      case "user_roles": return "role";
      case "funds": return "fund";
      case "profiles": return "profile";
      default: return "fund";
    }
  };

  const labelFor = (action: string, entity: string, meta: Record<string, unknown> | null): string => {
    const num = meta && typeof meta === "object" ? (meta as Record<string, unknown>).cycle_number : null;
    const amt = meta && typeof meta === "object" ? (meta as Record<string, unknown>).amount : null;
    const name = meta && typeof meta === "object" ? (meta as Record<string, unknown>).display_name : null;
    switch (entity) {
      case "capital_contributions":
        return `Aporte registrado${amt ? ` · $${Number(amt).toFixed(2)}` : ""}`;
      case "capital_withdrawals":
        return `Retiro registrado${amt ? ` · $${Number(amt).toFixed(2)}` : ""}`;
      case "fund_cycles":
        if (action === "insert") return `Nuevo ciclo abierto${num ? ` #${num}` : ""}`;
        if (action === "update") return `Corte cerrado${num ? ` #${num}` : ""}`;
        return `Ciclo ${action}`;
      case "investor_cycle_snapshots":
        return `Snapshot de liquidación creado`;
      case "investors":
        return `Inversor ${action === "insert" ? "registrado" : "actualizado"}${name ? ` · ${String(name)}` : ""}`;
      case "user_roles":
        return `Rol de usuario ${action === "insert" ? "asignado" : "removido"}`;
      case "funds":
        return `Fondo actualizado`;
      case "profiles":
        return `Perfil actualizado`;
      default:
        return `${entity} · ${action}`;
    }
  };

  return (logs ?? []).map((l) => ({
    id: l.id,
    created_at: l.created_at,
    action: l.action,
    entity: l.entity,
    entity_id: l.entity_id,
    user_id: l.user_id,
    metadata: l.metadata as Record<string, unknown> | null,
    actor_label: actorLabel(l.user_id),
    label: labelFor(l.action, l.entity, l.metadata as Record<string, unknown> | null),
    kind: kindFor(l.entity),
  }));
}

/**
 * Preview the allocation that WOULD be produced if a corte were generated now,
 * without writing anything. Mirrors the server-side generate_corte logic for
 * display in the confirmation modal.
 */
export async function previewCorteAllocation(closingBalance: number, adminFeePct: number): Promise<
  {
    investor_id: string;
    display_name: string;
    opening_capital: number;
    participation_pct: number;
    gross_profit: number;
    admin_fee_pct: number;
    admin_fee_amount: number;
    net_profit: number;
    closing_capital: number;
    cycle_roi_pct: number;
  }[]
> {
  const { data: funds } = await supabase.from("funds").select("*").limit(1);
  const fund = funds?.[0];
  if (!fund) return [];

  const [{ data: investors }, { data: cycles }, { data: contribs }, { data: withdrawals }, { data: snapshots }] = await Promise.all([
    supabase.from("investors").select("*").eq("fund_id", fund.id).order("date_joined"),
    supabase.from("fund_cycles").select("*").eq("fund_id", fund.id).order("cycle_number"),
    supabase.from("capital_contributions").select("*").eq("fund_id", fund.id),
    supabase.from("capital_withdrawals").select("*").eq("fund_id", fund.id),
    supabase.from("investor_cycle_snapshots").select("*"),
  ]);

  const openCycle = cycles?.find((c) => c.status === "open");
  if (!openCycle) return [];

  const opening = Number(openCycle.opening_balance);
  const profit = closingBalance - opening;
  const feeDefault = adminFeePct;

  const openings = (investors ?? []).map((inv) => {
    let o = 0;
    for (const c of contribs ?? []) if (c.investor_id === inv.id && c.contribution_date <= openCycle.start_date) o += Number(c.amount);
    for (const w of withdrawals ?? []) if (w.investor_id === inv.id && w.withdrawal_date <= openCycle.start_date) o -= Number(w.amount);
    for (const s of snapshots ?? []) {
      const sc = cycles?.find((cy) => cy.id === s.cycle_id);
      if (sc && sc.status === "closed" && sc.cycle_number < openCycle.cycle_number && s.investor_id === inv.id) o += Number(s.net_profit);
    }
    return { inv, o };
  });

  const totalOpening = openings.reduce((a, b) => a + b.o, 0);

  return openings.map(({ inv, o }) => {
    const partPct = totalOpening > 0 ? (o / totalOpening) * 100 : 0;
    const gross = totalOpening > 0 ? (o / totalOpening) * profit : 0;
    const feePct = inv.fee_pct != null ? Number(inv.fee_pct) : feeDefault;
    const fee = gross > 0 && feePct > 0 ? gross * (feePct / 100) : 0;
    const net = gross - fee;
    const closingCap = o + net;
    const roi = o > 0 ? (net / o) * 100 : 0;
    return {
      investor_id: inv.id,
      display_name: inv.display_name,
      opening_capital: o,
      participation_pct: partPct,
      gross_profit: gross,
      admin_fee_pct: gross > 0 ? feePct : 0,
      admin_fee_amount: fee,
      net_profit: net,
      closing_capital: closingCap,
      cycle_roi_pct: roi,
    };
  });
}
