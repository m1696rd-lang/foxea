import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, fmtPct, fmtDate, cn } from "@/lib/format";
import { loadFundState } from "@/lib/finance";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/cortes")({
  head: () => ({ meta: [{ title: "Cortes — MRD Fund" }, { name: "robots", content: "noindex" }] }),
  component: Cortes,
});

async function loadCycles() {
  const [{ data: cycles }, { data: snapshots }, { data: investors }] = await Promise.all([
    supabase.from("fund_cycles").select("*").order("cycle_number", { ascending: false }),
    supabase.from("investor_cycle_snapshots").select("*"),
    supabase.from("investors").select("*"),
  ]);
  return { cycles: cycles ?? [], snapshots: snapshots ?? [], investors: investors ?? [] };
}

function Cortes() {
  const auth = useAuth();
  const qc = useQueryClient();
  const { data: cy } = useQuery({ queryKey: ["cycles"], queryFn: loadCycles });
  const { data: fs } = useQuery({ queryKey: ["fund-state"], queryFn: loadFundState });
  const [closingCycleId, setClosingCycleId] = useState<string | null>(null);

  if (!cy || !fs) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  const openCycle = cy.cycles.find((c) => c.status === "open");

  return (
    <div className="space-y-8 max-w-[1400px]">
      <header>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Cortes</div>
        <h1 className="text-2xl font-semibold mt-1">Ciclos contables del fondo</h1>
      </header>

      {openCycle && auth.isAdmin && (
        <section className="bg-card border rounded-lg p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Corte activo</div>
              <div className="text-lg font-semibold mt-1">Corte #{openCycle.cycle_number}</div>
              <div className="text-xs text-muted-foreground mt-1">Inicio: {fmtDate(openCycle.start_date)} · Apertura: {fmtMoney(openCycle.opening_balance)}</div>
            </div>
            <div className="flex items-center gap-2">
              <OpenPositionsToggle cycle={openCycle} onDone={() => qc.invalidateQueries()} />
              <button
                disabled={openCycle.open_positions}
                onClick={() => setClosingCycleId(openCycle.id)}
                className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-40"
                title={openCycle.open_positions ? "No se puede cerrar con operaciones abiertas" : ""}
              >Cerrar corte</button>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold mb-3">Historial</h2>
        <div className="bg-card border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                <th className="px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Inicio</th>
                <th className="px-3 py-2.5 font-medium">Fin</th>
                <th className="px-3 py-2.5 font-medium text-right">Apertura</th>
                <th className="px-3 py-2.5 font-medium text-right">Cierre</th>
                <th className="px-3 py-2.5 font-medium text-right">Profit</th>
                <th className="px-3 py-2.5 font-medium text-right">Return</th>
                <th className="px-3 py-2.5 font-medium">Estatus</th>
              </tr>
            </thead>
            <tbody>
              {cy.cycles.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-3 py-3 font-medium">#{c.cycle_number}</td>
                  <td className="px-3 py-3 text-muted-foreground">{fmtDate(c.start_date)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{c.end_date ? fmtDate(c.end_date) : "—"}</td>
                  <td className="px-3 py-3 text-right num">{fmtMoney(c.opening_balance)}</td>
                  <td className="px-3 py-3 text-right num">{c.closing_balance != null ? fmtMoney(c.closing_balance) : "—"}</td>
                  <td className={cn("px-3 py-3 text-right num", (c.gross_profit ?? 0) > 0 && "pos", (c.gross_profit ?? 0) < 0 && "neg")}>{c.gross_profit != null ? fmtMoney(c.gross_profit, { sign: true }) : "—"}</td>
                  <td className="px-3 py-3 text-right num">{c.fund_return_pct != null ? fmtPct(c.fund_return_pct) : "—"}</td>
                  <td className="px-3 py-3"><span className={`text-[10px] uppercase tracking-wider ${c.status === "open" ? "text-primary" : "text-muted-foreground"}`}>{c.status === "open" ? "Abierto" : "Cerrado"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {closingCycleId && openCycle && (
        <CloseCycleModal cycle={openCycle} fundState={fs} onClose={() => setClosingCycleId(null)} onDone={() => { setClosingCycleId(null); qc.invalidateQueries(); }} />
      )}
    </div>
  );
}

function OpenPositionsToggle({ cycle, onDone }: { cycle: { id: string; open_positions: boolean }; onDone: () => void }) {
  const mut = useMutation({
    mutationFn: async (v: boolean) => {
      const { error } = await supabase.from("fund_cycles").update({ open_positions: v }).eq("id", cycle.id);
      if (error) throw error;
    },
    onSuccess: onDone,
  });
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground border rounded-md px-3 py-1.5">
      <span>Operaciones abiertas</span>
      <input type="checkbox" checked={cycle.open_positions} onChange={(e) => mut.mutate(e.target.checked)} />
    </label>
  );
}

function CloseCycleModal({
  cycle, fundState, onClose, onDone,
}: {
  cycle: { id: string; cycle_number: number; opening_balance: number | string; start_date: string };
  fundState: NonNullable<Awaited<ReturnType<typeof loadFundState>>>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [closingBalance, setClosingBalance] = useState(String(fundState.fund.current_balance));
  const [defaultFeePct, setDefaultFeePct] = useState("0");
  const [error, setError] = useState<string | null>(null);

  const opening = Number(cycle.opening_balance);
  const closing = Number(closingBalance) || 0;
  const grossProfit = closing - opening;
  const returnPct = opening > 0 ? (grossProfit / opening) * 100 : 0;
  const feePct = Number(defaultFeePct) || 0;

  // Preview allocations
  const totalOpening = fundState.investors.reduce((a, i) => {
    // approximate opening = current_capital - unrealized share
    // Simpler: use participation_pct * opening
    return a + (i.participation_pct / 100) * opening;
  }, 0);
  const allocations = fundState.investors.map((i) => {
    const partPct = i.participation_pct;
    const investorOpening = (partPct / 100) * opening;
    const gross = (partPct / 100) * grossProfit;
    const fee = gross > 0 ? gross * (feePct / 100) : 0;
    const net = gross - fee;
    return { ...i, participation_pct: partPct, investor_opening: investorOpening, gross, fee, net, closing: investorOpening + net };
  });

  const mut = useMutation({
    mutationFn: async () => {
      // Insert snapshots + update cycle. Do sequentially (no service role client available).
      const { error: e1 } = await supabase.from("fund_cycles").update({
        closing_balance: closing, gross_profit: grossProfit, fund_return_pct: returnPct,
        status: "closed", closed_at: new Date().toISOString(), end_date: new Date().toISOString().slice(0, 10),
        investor_count: allocations.length,
      }).eq("id", cycle.id);
      if (e1) throw e1;

      for (const a of allocations) {
        const { error: e2 } = await supabase.from("investor_cycle_snapshots").insert({
          cycle_id: cycle.id, investor_id: a.investor_id,
          opening_capital: a.investor_opening, contributions_in_cycle: 0, withdrawals_in_cycle: 0,
          participation_pct: a.participation_pct, gross_profit: a.gross,
          admin_fee_pct: a.gross > 0 ? feePct : 0, admin_fee_amount: a.fee, net_profit: a.net,
          closing_capital: a.closing, cycle_roi_pct: a.investor_opening > 0 ? (a.net / a.investor_opening) * 100 : 0,
        });
        if (e2) throw e2;
      }

      // Open next cycle with next cycle_number, opening = closing
      const { error: e3 } = await supabase.from("fund_cycles").insert({
        fund_id: fundState.fund.fund_id, cycle_number: cycle.cycle_number + 1,
        start_date: new Date().toISOString().slice(0, 10),
        opening_balance: closing, status: "open", open_positions: false,
      });
      if (e3) throw e3;
    },
    onSuccess: onDone,
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-5 py-4 border-b sticky top-0 bg-card">
          <h3 className="font-semibold">Cerrar corte #{cycle.cycle_number}</h3>
          <button onClick={onClose} className="text-muted-foreground text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="text-xs font-medium text-muted-foreground mb-1">Balance de cierre (USD)</div>
              <input type="number" value={closingBalance} onChange={(e) => setClosingBalance(e.target.value)}
                className="w-full bg-input border rounded-md px-3 py-2 text-sm num" />
            </label>
            <label className="block">
              <div className="text-xs font-medium text-muted-foreground mb-1">Fee administración % (default)</div>
              <input type="number" value={defaultFeePct} onChange={(e) => setDefaultFeePct(e.target.value)}
                className="w-full bg-input border rounded-md px-3 py-2 text-sm num" />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-secondary rounded-md p-3"><div className="text-[10px] uppercase text-muted-foreground">Apertura</div><div className="num mt-1 font-medium">{fmtMoney(opening)}</div></div>
            <div className="bg-secondary rounded-md p-3"><div className="text-[10px] uppercase text-muted-foreground">Cierre</div><div className="num mt-1 font-medium">{fmtMoney(closing)}</div></div>
            <div className="bg-secondary rounded-md p-3"><div className="text-[10px] uppercase text-muted-foreground">Profit / Return</div><div className={cn("num mt-1 font-medium", grossProfit > 0 && "pos", grossProfit < 0 && "neg")}>{fmtMoney(grossProfit, { sign: true })} · {fmtPct(returnPct)}</div></div>
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Liquidación por inversor (preview inmutable)</div>
            <table className="w-full text-xs border rounded-md overflow-hidden">
              <thead className="bg-secondary text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-2 py-1.5 text-left">Nombre</th><th className="px-2 py-1.5 text-right">Part %</th><th className="px-2 py-1.5 text-right">Bruto</th><th className="px-2 py-1.5 text-right">Fee</th><th className="px-2 py-1.5 text-right">Neto</th></tr>
              </thead>
              <tbody>
                {allocations.map((a) => (
                  <tr key={a.investor_id} className="border-t">
                    <td className="px-2 py-2 font-medium">{a.display_name}</td>
                    <td className="px-2 py-2 text-right num">{fmtPct(a.participation_pct)}</td>
                    <td className={cn("px-2 py-2 text-right num", a.gross > 0 && "pos", a.gross < 0 && "neg")}>{fmtMoney(a.gross, { sign: true })}</td>
                    <td className="px-2 py-2 text-right num">{fmtMoney(a.fee)}</td>
                    <td className={cn("px-2 py-2 text-right num font-medium", a.net > 0 && "pos", a.net < 0 && "neg")}>{fmtMoney(a.net, { sign: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <div className="text-sm text-negative">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md border">Cancelar</button>
            <button disabled={mut.isPending} onClick={() => mut.mutate()} className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50">
              {mut.isPending ? "Cerrando…" : "Confirmar cierre"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
