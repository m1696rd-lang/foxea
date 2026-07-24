import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { loadFundState } from "@/lib/finance";
import { fmtMoney, fmtPct, fmtDate, cn } from "@/lib/format";
import { useAuth, useViewMode } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — MRD Fund" },
      { name: "description", content: "Performance del fondo MRD, KPIs, participantes y actividad reciente." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: () => {
    // Investor-only users get redirected to their view
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
  const { data, isLoading } = useQuery({ queryKey: ["fund-state"], queryFn: loadFundState });

  // Investor mode redirect (client-side safety net)
  if (auth.isAdmin && viewMode === "investor") {
    if (typeof window !== "undefined") window.location.href = "/mi-inversion";
    return null;
  }
  if (!auth.isAdmin) {
    if (typeof window !== "undefined") window.location.href = "/mi-inversion";
    return null;
  }

  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Cargando fondo…</div>;
  const { fund, investors } = data;
  const cycle = fund.current_cycle;

  const kpis = [
    { label: "Capital Inicial", value: fmtMoney(fund.initial_capital) },
    { label: "Balance del Corte (Apertura)", value: fmtMoney(cycle?.opening_balance ?? 0) },
    { label: "Balance Actual del Fondo", value: fmtMoney(fund.current_balance), emphasis: true },
    { label: "Profit del Corte", value: fmtMoney(cycle?.profit ?? 0, { sign: true }), tone: (cycle?.profit ?? 0) },
    { label: "Profit Acumulado", value: fmtMoney(fund.accumulated_profit, { sign: true }), tone: fund.accumulated_profit },
    { label: "Rentabilidad", value: fmtPct(cycle?.return_pct ?? 0), tone: cycle?.return_pct ?? 0 },
    { label: "Corte Anterior", value: fund.previous_cycle_number ? `#${fund.previous_cycle_number}` : "—" },
    { label: "Corte Actual", value: cycle ? `#${cycle.number}` : "—", sub: cycle ? fmtDate(cycle.start_date) : "" },
    { label: "Participantes", value: String(investors.length) },
  ];

  return (
    <div className="space-y-8 max-w-[1400px]">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Performance del Fondo</div>
          <h1 className="text-2xl font-semibold mt-1">{fund.name}</h1>
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          {cycle ? `Corte #${cycle.number} · ${cycle.status === "open" ? "Abierto" : "Cerrado"}` : "Sin corte activo"}
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Kpi key={k.label} label={k.label} value={k.value} tone={k.tone} sub={k.sub} emphasis={k.emphasis} />
        ))}
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <span>Performance de Usuarios</span>
          <span className="text-xs text-muted-foreground font-normal">— Corte #{cycle?.number ?? "—"}</span>
        </h2>
        <InvestorTable rows={investors} />
      </section>
    </div>
  );
}

function Kpi({ label, value, tone, sub, emphasis }: { label: string; value: string; tone?: number; sub?: string; emphasis?: boolean }) {
  const toneCls = tone === undefined ? "" : tone > 0 ? "text-positive" : tone < 0 ? "text-negative" : "";
  return (
    <div className={cn("bg-card border rounded-lg p-4", emphasis && "ring-1 ring-primary/30")}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("num text-xl mt-2 font-semibold", toneCls)}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function InvestorTable({ rows }: { rows: Awaited<ReturnType<typeof loadFundState>> extends infer T ? T extends { investors: infer I } ? I : never : never }) {
  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b">
              <th className="px-3 py-2.5 font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">Nombre</th>
              <th className="px-3 py-2.5 font-medium">Fecha Inicio</th>
              <th className="px-3 py-2.5 font-medium text-right">Aporte Inicial</th>
              <th className="px-3 py-2.5 font-medium text-right">Capital Aportado</th>
              <th className="px-3 py-2.5 font-medium text-right">Capital Retirado</th>
              <th className="px-3 py-2.5 font-medium text-right">Capital Actual</th>
              <th className="px-3 py-2.5 font-medium text-right">Ganancia / Pérdida</th>
              <th className="px-3 py-2.5 font-medium text-right" title="Capital Aportado − Retirado − Actual. Negativo = ya recuperó su capital.">Cap. Pend. Recup.</th>
              <th className="px-3 py-2.5 font-medium text-right">Participación</th>
              <th className="px-3 py-2.5 font-medium text-right">ROI Personal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.investor_id} className="border-b last:border-0 hover:bg-accent/30 transition">
                <td className="px-3 py-3 text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-3 font-medium">{r.display_name}</td>
                <td className="px-3 py-3 text-muted-foreground">{fmtDate(r.date_joined)}</td>
                <td className="px-3 py-3 text-right num">{fmtMoney(r.initial_contribution)}</td>
                <td className="px-3 py-3 text-right num">{fmtMoney(r.total_contributed)}</td>
                <td className="px-3 py-3 text-right num">{fmtMoney(r.total_withdrawn)}</td>
                <td className="px-3 py-3 text-right num font-medium">{fmtMoney(r.current_capital)}</td>
                <td className={cn("px-3 py-3 text-right num", r.economic_result > 0 && "pos", r.economic_result < 0 && "neg")}>
                  {fmtMoney(r.economic_result, { sign: true })}
                </td>
                <td className={cn("px-3 py-3 text-right num text-xs", r.pending_recovery < 0 && "pos", r.pending_recovery > 0 && "text-muted-foreground")}>
                  {fmtMoney(r.pending_recovery, { sign: true })}
                </td>
                <td className="px-3 py-3 text-right num">{fmtPct(r.participation_pct)}</td>
                <td className={cn("px-3 py-3 text-right num", r.roi_pct > 0 && "pos", r.roi_pct < 0 && "neg")}>{fmtPct(r.roi_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-2 border-t text-[11px] text-muted-foreground">
        <span className="font-medium">Capital Pendiente de Recuperación</span> = Capital Aportado − Capital Retirado − Capital Actual. Un valor negativo significa que el inversor ya recuperó su capital y el monto negativo representa ganancia económica acumulada.
      </div>
    </div>
  );
}
