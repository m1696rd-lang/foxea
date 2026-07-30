import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  loadFundState,
  loadCycleHistory,
  loadRecentActivity,
  previewCorteAllocation,
  type ActivityRow,
} from "@/lib/finance";
import { fmtMoney, fmtPct, fmtDate, fmtRelative, cn } from "@/lib/format";
import { useAuth, useViewMode } from "@/hooks/use-auth";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import type { FundState } from "@/lib/finance";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import TradingViewEventsWidget from "@/components/trading-view-events";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — SCALPING FOX" },
      { name: "description", content: "Centro de control financiero del fondo SCALPING FOX." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const mode = localStorage.getItem("mrd_view_mode");
      if (mode === "investor") throw redirect({ to: "/mi-inversion" });
    }
  },
  component: Dashboard,
});

function Dashboard() {
  const auth = useAuth();
  const [viewMode] = useViewMode();
  const qc = useQueryClient();
  const { data: fs, isLoading } = useQuery({ queryKey: ["fund-state"], queryFn: loadFundState });
  const { data: history } = useQuery({ queryKey: ["cycle-history"], queryFn: loadCycleHistory });
  const { data: activity } = useQuery({ queryKey: ["recent-activity"], queryFn: () => loadRecentActivity(12) });
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (auth.isAdmin && viewMode === "investor") {
    if (typeof window !== "undefined") window.location.href = "/mi-inversion";
    return null;
  }
  if (!auth.isAdmin) {
    if (typeof window !== "undefined") window.location.href = "/mi-inversion";
    return null;
  }

  if (isLoading || !fs) return <div className="text-sm text-muted-foreground">Cargando fondo…</div>;
  const { fund, investors } = fs;
  const cycle = fund.current_cycle;

  return (
    <div className="space-y-8 max-w-[1500px]">
      <DashboardHeader fundName={fund.name} cycle={cycle} />

      <KpiGrid fund={fund} investors={investors} />

      <CurrentCycleCard
        fund={fund}
        cycle={cycle}
        onGenerate={() => setConfirmOpen(true)}
      />

      <ChartsSection history={history ?? []} fund={fund} />

      <EconomicCalendarSection />

      <InvestorPerformanceTable investors={investors} cycle={cycle} />

      <ActivitySection activity={activity ?? []} />

      {confirmOpen && cycle && (
        <GenerateCorteModal
          fund={fund}
          cycle={cycle}
          onClose={() => setConfirmOpen(false)}
          onDone={() => {
            setConfirmOpen(false);
            qc.invalidateQueries();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */
function DashboardHeader({ fundName, cycle }: { fundName: string; cycle: FundState["current_cycle"] }) {
  return (
    <header className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-primary font-mono">Centro de Control</div>
        <h1 className="text-2xl font-semibold mt-1 tracking-tight">{fundName}</h1>
      </div>
      <div className="flex items-center gap-2 text-xs font-mono">
        <span className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border",
          cycle ? "border-primary/30 text-primary" : "border-border text-muted-foreground"
        )}>
          <span className={cn("h-1.5 w-1.5 rounded-full", cycle ? "bg-positive animate-pulse" : "bg-muted-foreground")} />
          {cycle ? `Corte #${cycle.number} · Abierto` : "Sin corte activo"}
        </span>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* KPI Grid                                                            */
/* ------------------------------------------------------------------ */
function KpiGrid({ fund, investors }: { fund: FundState; investors: NonNullable<Awaited<ReturnType<typeof loadFundState>>>["investors"] }) {
  const cycle = fund.current_cycle;
  const kpis = [
    { label: "Capital Inicial", value: fmtMoney(fund.initial_capital), hint: "Capital base del fondo" },
    { label: "Balance Actual", value: fmtMoney(fund.current_balance), hint: "Balance manual del fondo", emphasis: true },
    { label: "Profit Acumulado", value: fmtMoney(fund.accumulated_profit, { sign: true }), tone: fund.accumulated_profit, hint: "Histórico cerrado + corte actual" },
    { label: "Rentabilidad Acumulada", value: fmtPct(fund.accumulated_return_pct), tone: fund.accumulated_return_pct, hint: "vs. capital inicial" },
    { label: "Profit del Corte", value: fmtMoney(cycle?.profit ?? 0, { sign: true }), tone: cycle?.profit ?? 0, hint: cycle ? `Corte #${cycle.number}` : "—" },
    { label: "Rentabilidad del Corte", value: fmtPct(cycle?.return_pct ?? 0), tone: cycle?.return_pct ?? 0, hint: "vs. balance de apertura" },
    { label: "Participantes", value: String(fund.participant_count), hint: "Inversores activos" },
    { label: "Corte Anterior", value: fund.previous_cycle_number ? `#${fund.previous_cycle_number}` : "—", hint: "Último corte cerrado" },
  ];

  return (
    <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {kpis.map((k) => (
        <Kpi key={k.label} {...k} />
      ))}
      <Kpi label="Fee Admin. Default" value={fmtPct(fund.default_admin_fee_pct)} hint="Aplicable a nuevos inversores" />
    </section>
  );
}

function Kpi({ label, value, tone, sub, hint, emphasis }: {
  label: string; value: string; tone?: number; sub?: string; hint?: string; emphasis?: boolean;
}) {
  const toneCls = tone === undefined ? "" : tone > 0 ? "text-positive" : tone < 0 ? "text-negative" : "";
  return (
    <div className={cn(
      "bg-card border rounded-lg p-4 transition-colors hover:border-primary/20",
      emphasis && "ring-1 ring-primary/30 bg-primary/5",
    )}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        {emphasis && <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
      </div>
      <div className={cn("num text-xl mt-2 font-semibold", toneCls)}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
      {hint && <div className="text-[10px] text-muted-foreground/70 mt-1 truncate" title={hint}>{hint}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Current Cycle Card — the control center                             */
/* ------------------------------------------------------------------ */
function CurrentCycleCard({ fund, cycle, onGenerate }: {
  fund: FundState; cycle: FundState["current_cycle"]; onGenerate: () => void;
}) {
  const qc = useQueryClient();
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState(String(fund.current_balance));
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const balanceMut = useMutation({
    mutationFn: async (v: number) => {
      const { error } = await supabase.from("funds").update({ current_balance_manual: v }).eq("id", fund.fund_id);
      if (error) throw error;
    },
    onSuccess: () => { setEditingBalance(false); qc.invalidateQueries(); },
    onError: (e: Error) => setBalanceError(e.message),
  });

  const opsMut = useMutation({
    mutationFn: async (v: boolean) => {
      if (!cycle) return;
      const { error } = await supabase.from("fund_cycles").update({ open_positions: v }).eq("id", cycle.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  if (!cycle) {
    return (
      <section className="bg-card border rounded-lg p-6">
        <div className="text-sm text-muted-foreground">No hay ningún ciclo abierto. Contacta al administrador del sistema.</div>
      </section>
    );
  }

  const canGenerate = !cycle.open_positions && cycle.status === "open";

  return (
    <section className="bg-card border rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between flex-wrap gap-3 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-2.5 w-2.5 rounded-full",
            cycle.status === "open" ? "bg-positive animate-pulse" : "bg-muted-foreground"
          )} />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ciclo Actual</div>
            <div className="text-lg font-semibold">Corte #{cycle.number}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cycle.status === "open" ? (
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-positive/10 text-positive font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-positive" /> Ciclo abierto
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-muted text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" /> Corte cerrado
            </span>
          )}
        </div>
      </div>

      <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
        <CycleStat label="Fecha de Inicio" value={fmtDate(cycle.start_date)} />
        <CycleStat label="Balance Inicial" value={fmtMoney(cycle.opening_balance)} />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Balance Actual</div>
          {editingBalance ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.01"
                value={balanceInput}
                onChange={(e) => setBalanceInput(e.target.value)}
                className="w-28 bg-input border rounded-md px-2 py-1 text-sm num"
              />
              <button
                disabled={balanceMut.isPending}
                onClick={() => balanceMut.mutate(Number(balanceInput))}
                className="text-xs px-2 py-1 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50"
              >✓</button>
              <button onClick={() => { setEditingBalance(false); setBalanceInput(String(fund.current_balance)); }}
                className="text-xs px-2 py-1 rounded-md border">×</button>
            </div>
          ) : (
            <button onClick={() => { setEditingBalance(true); setBalanceInput(String(fund.current_balance)); }}
              className="num text-lg font-semibold hover:text-primary transition text-left flex items-center gap-1.5">
              {fmtMoney(fund.current_balance)}
              <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100">✎</span>
            </button>
          )}
          {balanceError && <div className="text-[10px] text-negative mt-1">{balanceError}</div>}
        </div>
        <CycleStat label="Profit del Ciclo" value={fmtMoney(cycle.profit, { sign: true })} tone={cycle.profit} />
        <CycleStat label="Rentabilidad" value={fmtPct(cycle.return_pct)} tone={cycle.return_pct} />
        <CycleStat label="Participantes" value={String(fund.participant_count)} />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Operaciones Abiertas</div>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <button
              role="switch"
              aria-checked={cycle.open_positions}
              disabled={opsMut.isPending}
              onClick={() => opsMut.mutate(!cycle.open_positions)}
              className={cn(
                "relative h-5 w-9 rounded-full transition-colors disabled:opacity-50",
                cycle.open_positions ? "bg-warning" : "bg-muted",
              )}
            >
              <span className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform",
                cycle.open_positions ? "translate-x-4" : "translate-x-0.5",
              )} />
            </button>
            <span className={cn("text-sm font-medium", cycle.open_positions ? "text-warning" : "text-positive")}>
              {cycle.open_positions ? "Sí" : "No"}
            </span>
          </label>
        </div>
      </div>

      <div className="px-5 py-4 border-t bg-secondary/30">
        {canGenerate ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-positive" />
              <span className="text-positive font-medium">Listo para generar corte</span>
              <span className="text-muted-foreground">· No hay operaciones abiertas</span>
            </div>
            <button
              onClick={onGenerate}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition shadow-lg shadow-primary/20"
            >
              GENERAR CORTE
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
              <span className="text-warning font-medium">NO SE PUEDE GENERAR EL CORTE</span>
              <span className="text-muted-foreground">· Existen operaciones abiertas. Cierre todas las operaciones antes de generar el corte.</span>
            </div>
            <button
              disabled
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-muted text-muted-foreground font-semibold text-sm cursor-not-allowed"
            >
              GENERAR CORTE
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function CycleStat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const toneCls = tone === undefined ? "" : tone > 0 ? "text-positive" : tone < 0 ? "text-negative" : "";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={cn("num text-lg font-semibold", toneCls)}>{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Charts                                                              */
/* ------------------------------------------------------------------ */
function ChartsSection({ history, fund }: { history: Awaited<ReturnType<typeof loadCycleHistory>>; fund: FundState }) {
  // Build balance evolution: start from initial capital, then each closed cycle's closing balance.
  const balanceData = useMemo(() => {
    const closed = [...history].filter((h) => h.status === "closed").sort((a, b) => a.cycle_number - b.cycle_number);
    const points: { label: string; balance: number; profit: number }[] = [];
    let running = fund.initial_capital;
    points.push({ label: "Inicio", balance: running, profit: 0 });
    for (const c of closed) {
      const profit = Number(c.gross_profit ?? 0);
      running += profit;
      points.push({ label: `Corte #${c.cycle_number}`, balance: running, profit });
    }
    // Current open cycle point
    points.push({ label: fund.current_cycle ? `Corte #${fund.current_cycle.number}` : "Actual", balance: fund.current_balance, profit: fund.current_cycle?.profit ?? 0 });
    return points;
  }, [history, fund]);

  const profitByCycle = useMemo(() => {
    const closed = [...history].filter((h) => h.status === "closed").sort((a, b) => a.cycle_number - b.cycle_number);
    const rows = closed.map((c) => ({
      label: `#${c.cycle_number}`,
      profit: Number(c.gross_profit ?? 0),
      return: Number(c.fund_return_pct ?? 0),
    }));
    if (fund.current_cycle) {
      rows.push({
        label: `#${fund.current_cycle.number}*`,
        profit: fund.current_cycle.profit,
        return: fund.current_cycle.return_pct,
      });
    }
    return rows;
  }, [history, fund]);

  const hasData = balanceData.length > 1 || profitByCycle.length > 0;

  if (!hasData) {
    return (
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Evolución del Balance del Fondo" subtitle="USD">
          <EmptyChart />
        </ChartCard>
        <ChartCard title="Rentabilidad por Corte" subtitle="%">
          <EmptyChart />
        </ChartCard>
      </section>
    );
  }

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Evolución del Balance del Fondo" subtitle="USD">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={balanceData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `$${Number(v).toFixed(0)}`} />
            <Tooltip content={<ChartTooltip fmt="money" />} />
            <Area type="monotone" dataKey="balance" stroke="var(--color-primary)" strokeWidth={2} fill="url(#balGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Rentabilidad por Corte" subtitle="% por corte">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={profitByCycle} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} />
            <Tooltip content={<ChartTooltip fmt="pct" />} />
            <ReferenceLine y={0} stroke="var(--color-border)" />
            <Bar dataKey="return" radius={[3, 3, 0, 0]}>
              {profitByCycle.map((d, i) => (
                <Cell key={i} fill={d.return >= 0 ? "var(--color-positive)" : "var(--color-negative)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded-md">
      Sin datos históricos suficientes
    </div>
  );
}

function ChartTooltip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  const display = fmt === "money" ? fmtMoney(v) : fmt === "pct" ? fmtPct(v) : String(v);
  return (
    <div className="bg-popover border rounded-md px-3 py-2 shadow-xl text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="num font-semibold mt-0.5">{display}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Economic Calendar (tabbed widgets)                                  */
/* ------------------------------------------------------------------ */
function EconomicCalendarSection() {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold">Calendario Económico</h2>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Eventos del mercado</span>
      </div>
      <Tabs defaultValue="tradingview" className="w-full">
        <TabsList>
          <TabsTrigger value="tradingview">TradingView</TabsTrigger>
          <TabsTrigger value="investing">Investing.com</TabsTrigger>
        </TabsList>
        <TabsContent value="tradingview" className="mt-3">
          <div className="bg-card border rounded-lg p-2 h-[480px] overflow-hidden">
            <TradingViewEventsWidget />
          </div>
        </TabsContent>
        <TabsContent value="investing" className="mt-3">
          <div className="bg-card border rounded-lg p-3 h-[520px] overflow-hidden flex flex-col">
            <iframe
              src="https://sslecal2.investing.com?columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&features=datepicker,timezone&countries=25,32,6,37,15,72,22,17,39,14,10,35,43,56,36,110,11,26,12,143,4,5&calType=day&timeZone=55&lang=1"
              width="100%"
              height="100%"
              frameBorder="0"
              allowTransparency
              marginWidth={0}
              marginHeight={0}
              className="flex-1 w-full rounded-md"
              title="Calendario económico — Investing.com"
            />
            <div className="text-[10px] text-muted-foreground text-center pt-2">
              Real Time Economic Calendar provided by{" "}
              <a href="https://www.investing.com/" rel="nofollow" target="_blank" className="text-primary">Investing.com</a>.
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Investor Performance                                                */
/* ------------------------------------------------------------------ */
function InvestorPerformanceTable({ investors, cycle }: {
  investors: NonNullable<Awaited<ReturnType<typeof loadFundState>>>["investors"];
  cycle: FundState["current_cycle"];
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <span>Performance de Inversores</span>
          <span className="text-xs text-muted-foreground font-normal">— Vista interna completa</span>
        </h2>
      </div>
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                <th className="px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Nombre</th>
                <th className="px-3 py-2.5 font-medium text-right">Capital Actual</th>
                <th className="px-3 py-2.5 font-medium text-right">Ganancia Personal</th>
                <th className="px-3 py-2.5 font-medium text-right">Pend. Recuperar</th>
                <th className="px-3 py-2.5 font-medium text-right">Participación</th>
                <th className="px-3 py-2.5 font-medium text-right">ROI</th>
                <th className="px-3 py-2.5 font-medium text-right">Ganancia del Corte</th>
                <th className="px-3 py-2.5 font-medium text-right">Fee Admin.</th>
              </tr>
            </thead>
            <tbody>
              {investors.map((r, i) => {
                const cycleGain = (r.participation_pct / 100) * (cycle?.profit ?? 0);
                const feePct = r.fee_pct;
                return (
                  <tr key={r.investor_id} className="border-b last:border-0 hover:bg-accent/20 transition">
                    <td className="px-3 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-3 font-medium flex items-center gap-2">
                      {r.display_name}
                      {r.is_internal && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">Interno</span>}
                    </td>
                    <td className="px-3 py-3 text-right num font-medium">{fmtMoney(r.current_capital)}</td>
                    <td className={cn("px-3 py-3 text-right num", r.economic_result > 0 && "pos", r.economic_result < 0 && "neg")}>
                      {fmtMoney(r.economic_result, { sign: true })}
                    </td>
                    <td className={cn("px-3 py-3 text-right num text-xs", r.pending_recovery < 0 && "pos", r.pending_recovery > 0 && "text-muted-foreground")}>
                      {fmtMoney(r.pending_recovery, { sign: true })}
                    </td>
                    <td className="px-3 py-3 text-right num">{fmtPct(r.participation_pct)}</td>
                    <td className={cn("px-3 py-3 text-right num", r.roi_pct > 0 && "pos", r.roi_pct < 0 && "neg")}>{fmtPct(r.roi_pct)}</td>
                    <td className={cn("px-3 py-3 text-right num", cycleGain > 0 && "pos", cycleGain < 0 && "neg")}>
                      {fmtMoney(cycleGain, { sign: true })}
                    </td>
                    <td className="px-3 py-3 text-right num text-xs text-muted-foreground">
                      {feePct != null ? fmtPct(Number(feePct)) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Recent Activity                                                     */
/* ------------------------------------------------------------------ */
function ActivitySection({ activity }: { activity: ActivityRow[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold mb-3">Actividad Reciente</h2>
      <div className="bg-card border rounded-lg overflow-hidden">
        {activity.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Sin actividad registrada.</div>
        ) : (
          <ul className="divide-y">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/20 transition">
                <ActivityIcon kind={a.kind} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{a.label}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {a.actor_label} · {fmtRelative(a.created_at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ActivityIcon({ kind }: { kind: ActivityRow["kind"] }) {
  const map: Record<ActivityRow["kind"], { bg: string; dot: string }> = {
    contribution: { bg: "bg-positive/10", dot: "bg-positive" },
    withdrawal: { bg: "bg-negative/10", dot: "bg-negative" },
    cycle: { bg: "bg-primary/10", dot: "bg-primary" },
    snapshot: { bg: "bg-accent", dot: "bg-foreground" },
    investor: { bg: "bg-secondary", dot: "bg-muted-foreground" },
    role: { bg: "bg-secondary", dot: "bg-muted-foreground" },
    fund: { bg: "bg-secondary", dot: "bg-muted-foreground" },
    profile: { bg: "bg-secondary", dot: "bg-muted-foreground" },
  };
  const s = map[kind];
  return (
    <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0", s.bg)}>
      <span className={cn("h-2 w-2 rounded-full", s.dot)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Generate Corte Modal                                               */
/* ------------------------------------------------------------------ */
function GenerateCorteModal({ fund, cycle, onClose, onDone }: {
  fund: FundState;
  cycle: NonNullable<FundState["current_cycle"]>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [closingBalance, setClosingBalance] = useState(String(fund.current_balance));
  const [feePct, setFeePct] = useState(String(fund.default_admin_fee_pct));
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewCorteAllocation>> | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const opening = cycle.opening_balance;
  const closing = Number(closingBalance) || 0;
  const profit = closing - opening;
  const returnPct = opening > 0 ? (profit / opening) * 100 : 0;

  // Load preview allocation when inputs change (debounced)
  useEffect(() => {
    let cancelled = false;
    setLoadingPreview(true);
    const t = setTimeout(async () => {
      const p = await previewCorteAllocation(closing, Number(feePct) || 0);
      if (!cancelled) { setPreview(p); setLoadingPreview(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [closing, feePct]);

  const mut = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)("generate_corte", {
        p_closing_balance: closing,
        p_admin_fee_pct: Number(feePct) || 0,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: onDone,
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center px-5 py-4 border-b sticky top-0 bg-card z-10">
          <div>
            <h3 className="font-semibold">¿Generar corte del ciclo actual?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Corte #{cycle.number} · {fmtDate(cycle.start_date)}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Financial preview */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <PreviewStat label="Balance Inicial del Ciclo" value={fmtMoney(opening)} />
            <PreviewStat label="Balance Actual del Fondo" value={fmtMoney(closing)} />
            <PreviewStat label="Profit del Ciclo" value={fmtMoney(profit, { sign: true })} tone={profit} />
            <PreviewStat label="Rentabilidad del Ciclo" value={fmtPct(returnPct)} tone={returnPct} />
            <PreviewStat label="Participantes" value={String(fund.participant_count)} />
            <PreviewStat label="Fee Admin. Default" value={fmtPct(Number(feePct) || 0)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="text-xs font-medium text-muted-foreground mb-1">Balance de cierre (USD)</div>
              <input type="number" step="0.01" value={closingBalance} onChange={(e) => setClosingBalance(e.target.value)}
                className="w-full bg-input border rounded-md px-3 py-2 text-sm num focus:outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <label className="block">
              <div className="text-xs font-medium text-muted-foreground mb-1">Fee administración % (default)</div>
              <input type="number" step="0.01" value={feePct} onChange={(e) => setFeePct(e.target.value)}
                className="w-full bg-input border rounded-md px-3 py-2 text-sm num focus:outline-none focus:ring-2 focus:ring-ring" />
            </label>
          </div>

          {/* Allocation preview */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Liquidación por inversor (preview)</div>
            {loadingPreview ? (
              <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">Calculando…</div>
            ) : preview && preview.length > 0 ? (
              <table className="w-full text-xs border rounded-md overflow-hidden">
                <thead className="bg-secondary text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Nombre</th>
                    <th className="px-2 py-1.5 text-right">Cap. Inicio</th>
                    <th className="px-2 py-1.5 text-right">Part %</th>
                    <th className="px-2 py-1.5 text-right">Bruto</th>
                    <th className="px-2 py-1.5 text-right">Fee $</th>
                    <th className="px-2 py-1.5 text-right">Neto</th>
                    <th className="px-2 py-1.5 text-right">Cap. Cierre</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((a) => (
                    <tr key={a.investor_id} className="border-t">
                      <td className="px-2 py-2 font-medium">{a.display_name}</td>
                      <td className="px-2 py-2 text-right num">{fmtMoney(a.opening_capital)}</td>
                      <td className="px-2 py-2 text-right num">{fmtPct(a.participation_pct)}</td>
                      <td className={cn("px-2 py-2 text-right num", a.gross_profit > 0 && "pos", a.gross_profit < 0 && "neg")}>{fmtMoney(a.gross_profit, { sign: true })}</td>
                      <td className="px-2 py-2 text-right num">{fmtMoney(a.admin_fee_amount)}</td>
                      <td className={cn("px-2 py-2 text-right num font-medium", a.net_profit > 0 && "pos", a.net_profit < 0 && "neg")}>{fmtMoney(a.net_profit, { sign: true })}</td>
                      <td className="px-2 py-2 text-right num">{fmtMoney(a.closing_capital)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">Sin inversores para liquidar.</div>
            )}
          </div>

          {/* Explanation */}
          <div className="bg-secondary/50 rounded-md p-3 text-xs text-muted-foreground space-y-1">
            <p>Esta acción registrará el estado financiero actual del fondo y cerrará el ciclo actual.</p>
            <p>Se generará un snapshot histórico de la posición de cada inversor.</p>
            <p>El corte cerrado no podrá modificarse directamente.</p>
          </div>

          {error && <div className="text-sm text-negative bg-negative/10 rounded-md px-3 py-2">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-md border hover:bg-accent transition">Cancelar</button>
            <button
              disabled={mut.isPending}
              onClick={() => mut.mutate()}
              className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-50 hover:bg-primary/90 transition shadow-lg shadow-primary/20"
            >
              {mut.isPending ? "Generando…" : "Confirmar y generar corte"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewStat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const toneCls = tone === undefined ? "" : tone > 0 ? "text-positive" : tone < 0 ? "text-negative" : "";
  return (
    <div className="bg-secondary rounded-md p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={cn("num mt-1 font-semibold", toneCls)}>{value}</div>
    </div>
  );
}
