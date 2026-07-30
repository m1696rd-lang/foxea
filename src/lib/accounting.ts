import { supabase } from "@/integrations/supabase/client";

export interface LedgerPeriod {
  cycle_id: string;
  cycle_number: number;
  start_date: string;
  end_date: string | null;
  status: string;
  opening_balance: number;
  closing_balance: number | null;
  contributions: number;
  withdrawals: number;
  gross_profit: number;
  admin_fees: number;
  net_profit: number;
  return_pct: number;
  is_estimate: boolean;
}

export interface ReconciliationRow {
  cycle_id: string;
  cycle_number: number;
  reference_date: string;
  manual_balance: number | null;
  accounting_balance: number;
  difference: number;
  status: string;
  is_estimate: boolean;
}

export interface StatementLine {
  date: string;
  concept: string;
  kind: "contribution" | "withdrawal" | "profit" | "fee";
  cycle_number: number | null;
  amount: number;
  balance: number;
}

export interface InvestorStatement {
  investor_id: string;
  display_name: string;
  date_joined: string;
  lines: StatementLine[];
  totals: {
    contributed: number;
    withdrawn: number;
    gross_profit: number;
    admin_fees: number;
    net_profit: number;
    current_capital: number;
    pending_recovery: number;
  };
}

export interface AccountingData {
  fund_name: string;
  currency: string;
  manual_balance: number;
  periods: LedgerPeriod[];
  totals: {
    contributions: number;
    withdrawals: number;
    gross_profit: number;
    admin_fees: number;
    net_profit: number;
  };
  reconciliation: ReconciliationRow[];
  statements: InvestorStatement[];
}

const num = (v: unknown) => Number(v ?? 0);

/**
 * Builds the accounting view (income statement by cycle, balance reconciliation
 * and per-investor statements) from the immutable financial records.
 * RLS keeps non-admin users limited to their own positions.
 */
export async function loadAccounting(): Promise<AccountingData | null> {
  const { data: funds } = await supabase.from("funds").select("*").limit(1);
  const fund = funds?.[0];
  if (!fund) return null;

  const [{ data: investors }, { data: cycles }, { data: contribs }, { data: withdrawals }, { data: snapshots }] =
    await Promise.all([
      supabase.from("investors").select("*").eq("fund_id", fund.id).order("date_joined"),
      supabase.from("fund_cycles").select("*").eq("fund_id", fund.id).order("cycle_number"),
      supabase.from("capital_contributions").select("*").eq("fund_id", fund.id),
      supabase.from("capital_withdrawals").select("*").eq("fund_id", fund.id),
      supabase.from("investor_cycle_snapshots").select("*"),
    ]);

  const allCycles = cycles ?? [];
  const manualBalance = num(fund.current_balance_manual);

  const inRange = (d: string, start: string, end: string | null) =>
    d >= start && (end == null || d <= end);

  const periods: LedgerPeriod[] = allCycles.map((c) => {
    const snaps = (snapshots ?? []).filter((s) => s.cycle_id === c.id);
    const contribIn = (contribs ?? []).filter((x) => inRange(x.contribution_date, c.start_date, c.end_date));
    const wdIn = (withdrawals ?? []).filter((x) => inRange(x.withdrawal_date, c.start_date, c.end_date));
    const isOpen = c.status !== "closed";
    const gross = isOpen ? manualBalance - num(c.opening_balance) : num(c.gross_profit);
    const fees = snaps.reduce((a, s) => a + num(s.admin_fee_amount), 0);
    const net = isOpen ? gross : snaps.reduce((a, s) => a + num(s.net_profit), 0);
    return {
      cycle_id: c.id,
      cycle_number: c.cycle_number,
      start_date: c.start_date,
      end_date: c.end_date,
      status: c.status,
      opening_balance: num(c.opening_balance),
      closing_balance: c.closing_balance != null ? num(c.closing_balance) : isOpen ? manualBalance : null,
      contributions: contribIn.reduce((a, x) => a + num(x.amount), 0),
      withdrawals: wdIn.reduce((a, x) => a + num(x.amount), 0),
      gross_profit: gross,
      admin_fees: fees,
      net_profit: net,
      return_pct: num(c.opening_balance) > 0 ? (gross / num(c.opening_balance)) * 100 : 0,
      is_estimate: isOpen,
    };
  });

  const totals = periods.reduce(
    (a, p) => ({
      contributions: a.contributions + p.contributions,
      withdrawals: a.withdrawals + p.withdrawals,
      gross_profit: a.gross_profit + p.gross_profit,
      admin_fees: a.admin_fees + p.admin_fees,
      net_profit: a.net_profit + p.net_profit,
    }),
    { contributions: 0, withdrawals: 0, gross_profit: 0, admin_fees: 0, net_profit: 0 },
  );

  // Reconciliation: broker balance registered manually vs. accounting balance
  // derived from opening capital + movements + result of the period.
  const reconciliation: ReconciliationRow[] = periods.map((p) => {
    const snaps = (snapshots ?? []).filter((s) => s.cycle_id === p.cycle_id);
    const accounting = p.is_estimate
      ? p.opening_balance + p.contributions - p.withdrawals + p.gross_profit
      : snaps.length > 0
        ? snaps.reduce((a, s) => a + num(s.closing_capital), 0)
        : p.opening_balance + p.gross_profit;
    const manual = p.closing_balance;
    return {
      cycle_id: p.cycle_id,
      cycle_number: p.cycle_number,
      reference_date: p.end_date ?? p.start_date,
      manual_balance: manual,
      accounting_balance: accounting,
      difference: manual != null ? manual - accounting : 0,
      status: p.status,
      is_estimate: p.is_estimate,
    };
  });

  // Per-investor statements
  const openCycle = allCycles.find((c) => c.status === "open") ?? null;
  const statements: InvestorStatement[] = (investors ?? []).map((inv) => {
    const lines: StatementLine[] = [];
    const cycleOf = (date: string) =>
      allCycles.find((c) => inRange(date, c.start_date, c.end_date))?.cycle_number ?? null;

    for (const c of (contribs ?? []).filter((x) => x.investor_id === inv.id)) {
      lines.push({
        date: c.contribution_date,
        concept: c.is_correction ? "Aporte (corrección)" : "Aporte de capital",
        kind: "contribution",
        cycle_number: cycleOf(c.contribution_date),
        amount: num(c.amount),
        balance: 0,
      });
    }
    for (const w of (withdrawals ?? []).filter((x) => x.investor_id === inv.id)) {
      lines.push({
        date: w.withdrawal_date,
        concept: w.is_correction ? "Retiro (corrección)" : "Retiro de capital",
        kind: "withdrawal",
        cycle_number: cycleOf(w.withdrawal_date),
        amount: -num(w.amount),
        balance: 0,
      });
    }
    for (const s of (snapshots ?? []).filter((x) => x.investor_id === inv.id)) {
      const c = allCycles.find((cy) => cy.id === s.cycle_id);
      const date = c?.end_date ?? c?.start_date ?? "";
      lines.push({
        date,
        concept: `Utilidad bruta · Corte #${c?.cycle_number ?? "—"}`,
        kind: "profit",
        cycle_number: c?.cycle_number ?? null,
        amount: num(s.gross_profit),
        balance: 0,
      });
      if (num(s.admin_fee_amount) !== 0) {
        lines.push({
          date,
          concept: `Comisión de administración (${num(s.admin_fee_pct).toFixed(2)}%)`,
          kind: "fee",
          cycle_number: c?.cycle_number ?? null,
          amount: -num(s.admin_fee_amount),
          balance: 0,
        });
      }
    }

    lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let running = 0;
    for (const l of lines) {
      running += l.amount;
      l.balance = running;
    }

    const contributed = lines.filter((l) => l.kind === "contribution").reduce((a, l) => a + l.amount, 0);
    const withdrawn = -lines.filter((l) => l.kind === "withdrawal").reduce((a, l) => a + l.amount, 0);
    const grossProfit = lines.filter((l) => l.kind === "profit").reduce((a, l) => a + l.amount, 0);
    const fees = -lines.filter((l) => l.kind === "fee").reduce((a, l) => a + l.amount, 0);

    // Unrealized share of the open cycle, using opening participation.
    let unrealized = 0;
    if (openCycle) {
      const openingOf = (id: string) => {
        let o = 0;
        for (const c of contribs ?? []) if (c.investor_id === id && c.contribution_date <= openCycle.start_date) o += num(c.amount);
        for (const w of withdrawals ?? []) if (w.investor_id === id && w.withdrawal_date <= openCycle.start_date) o -= num(w.amount);
        for (const s of snapshots ?? []) {
          const sc = allCycles.find((cy) => cy.id === s.cycle_id);
          if (sc && sc.status === "closed" && sc.cycle_number < openCycle.cycle_number && s.investor_id === id) o += num(s.net_profit);
        }
        return o;
      };
      const totalOpening = (investors ?? []).reduce((a, i) => a + openingOf(i.id), 0);
      const cycleUnrealized = manualBalance - num(openCycle.opening_balance);
      unrealized = totalOpening > 0 ? (openingOf(inv.id) / totalOpening) * cycleUnrealized : 0;
    }

    const current = running + unrealized;
    return {
      investor_id: inv.id,
      display_name: inv.display_name,
      date_joined: inv.date_joined,
      lines,
      totals: {
        contributed,
        withdrawn,
        gross_profit: grossProfit,
        admin_fees: fees,
        net_profit: grossProfit - fees + unrealized,
        current_capital: current,
        pending_recovery: Math.max(contributed - withdrawn - current, 0),
      },
    };
  });

  return {
    fund_name: fund.name,
    currency: "USD",
    manual_balance: manualBalance,
    periods: [...periods].sort((a, b) => b.cycle_number - a.cycle_number),
    totals,
    reconciliation: [...reconciliation].sort((a, b) => b.cycle_number - a.cycle_number),
    statements,
  };
}

export function statementToCsv(s: InvestorStatement): string {
  const head = "Fecha,Concepto,Ciclo,Monto,Saldo";
  const rows = s.lines.map((l) =>
    [l.date, `"${l.concept}"`, l.cycle_number ?? "", l.amount.toFixed(2), l.balance.toFixed(2)].join(","),
  );
  return [head, ...rows].join("\n");
}

export function ledgerToCsv(periods: LedgerPeriod[]): string {
  const head = "Ciclo,Inicio,Fin,Estatus,Saldo inicial,Aportes,Retiros,Utilidad bruta,Comisiones,Utilidad neta,Rendimiento %";
  const rows = periods.map((p) =>
    [
      p.cycle_number,
      p.start_date,
      p.end_date ?? "",
      p.status,
      p.opening_balance.toFixed(2),
      p.contributions.toFixed(2),
      p.withdrawals.toFixed(2),
      p.gross_profit.toFixed(2),
      p.admin_fees.toFixed(2),
      p.net_profit.toFixed(2),
      p.return_pct.toFixed(2),
    ].join(","),
  );
  return [head, ...rows].join("\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
