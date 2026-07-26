import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, fmtPct, fmtDate, cn } from "@/lib/format";
import { loadCycleHistory, loadCorteSnapshots, type CycleHistoryRow, type CorteSnapshotRow } from "@/lib/finance";
import { useAuth } from "@/hooks/use-auth";
import { ChevronLeft, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cortes")({
  head: () => ({ meta: [{ title: "Cortes — SCALPING FOX" }, { name: "robots", content: "noindex" }] }),
  component: Cortes,
});

function Cortes() {
  const auth = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["cycle-history"], queryFn: loadCycleHistory });
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);

  if (!auth.isAdmin) return <div className="text-sm text-muted-foreground">Acceso restringido.</div>;
  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Cargando cortes…</div>;

  if (selectedCycleId) {
    const cycle = data.find((c) => c.id === selectedCycleId);
    if (cycle) {
      return <CorteDetail cycle={cycle} onBack={() => setSelectedCycleId(null)} />;
    }
  }

  return (
    <div className="space-y-6 max-w-[1500px]">
      <header>
        <div className="text-[10px] uppercase tracking-[0.25em] text-primary font-mono">Cortes</div>
        <h1 className="text-2xl font-semibold mt-1 tracking-tight">Ciclos contables del fondo</h1>
        <p className="text-sm text-muted-foreground mt-1">Historial inmutable de cortes cerrados y ciclo activo.</p>
      </header>

      <section>
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                  <th className="px-3 py-2.5 font-medium">Corte</th>
                  <th className="px-3 py-2.5 font-medium">Fecha de Inicio</th>
                  <th className="px-3 py-2.5 font-medium">Fecha de Cierre</th>
                  <th className="px-3 py-2.5 font-medium text-right">Balance Inicial</th>
                  <th className="px-3 py-2.5 font-medium text-right">Balance Final</th>
                  <th className="px-3 py-2.5 font-medium text-right">Profit del Corte</th>
                  <th className="px-3 py-2.5 font-medium text-right">Rentabilidad</th>
                  <th className="px-3 py-2.5 font-medium text-right">Participantes</th>
                  <th className="px-3 py-2.5 font-medium">Estado</th>
                  <th className="px-3 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-accent/20 transition">
                    <td className="px-3 py-3 font-medium">#{c.cycle_number}</td>
                    <td className="px-3 py-3 text-muted-foreground">{fmtDate(c.start_date)}</td>
                    <td className="px-3 py-3 text-muted-foreground">{c.end_date ? fmtDate(c.end_date) : "—"}</td>
                    <td className="px-3 py-3 text-right num">{fmtMoney(c.opening_balance)}</td>
                    <td className="px-3 py-3 text-right num">{c.closing_balance != null ? fmtMoney(c.closing_balance) : "—"}</td>
                    <td className={cn("px-3 py-3 text-right num", (c.gross_profit ?? 0) > 0 && "pos", (c.gross_profit ?? 0) < 0 && "neg")}>
                      {c.gross_profit != null ? fmtMoney(c.gross_profit, { sign: true }) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right num">{c.fund_return_pct != null ? fmtPct(c.fund_return_pct) : "—"}</td>
                    <td className="px-3 py-3 text-right num text-muted-foreground">{c.investor_count ?? "—"}</td>
                    <td className="px-3 py-3">
                      {c.status === "open" ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-primary">
                          <span className="h-1.5 w-1.5 rounded-full bg-positive animate-pulse" /> Abierto
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <Lock className="h-3 w-3" /> Cerrado
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {c.status === "closed" && (
                        <button
                          onClick={() => setSelectedCycleId(c.id)}
                          className="text-xs px-2.5 py-1 rounded-md border hover:bg-accent transition"
                        >
                          Ver detalle
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {data.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">No hay cortes registrados.</div>
        )}
      </section>

      <div className="bg-card border rounded-lg p-5 text-sm text-muted-foreground">
        <div className="font-medium text-foreground mb-2">Sobre los cortes</div>
        <p className="text-xs leading-relaxed">
          Cada corte captura el estado financiero inmutable del fondo en el momento de su cierre. Los snapshots
          de cada inversor se generan atómicamente y no pueden modificarse. El balance final de un corte se
          convierte en el balance inicial del siguiente. El ciclo activo se gestiona desde el{" "}
          <Link to="/dashboard" className="text-primary hover:underline">Dashboard</Link>.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Corte Detail View                                                   */
/* ------------------------------------------------------------------ */
function CorteDetail({ cycle, onBack }: { cycle: CycleHistoryRow; onBack: () => void }) {
  const { data: snapshots, isLoading } = useQuery({
    queryKey: ["corte-snapshots", cycle.id],
    queryFn: () => loadCorteSnapshots(cycle.id),
  });

  const profit = cycle.gross_profit ?? 0;
  const returnPct = cycle.fund_return_pct ?? 0;

  return (
    <div className="space-y-6 max-w-[1500px]">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition">
        <ChevronLeft className="h-4 w-4" /> Volver a Cortes
      </button>

      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Lock className="h-3 w-3" /> Cerrado
            </span>
          </div>
          <h1 className="text-2xl font-semibold mt-1 tracking-tight">Corte #{cycle.cycle_number}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {fmtDate(cycle.start_date)} → {cycle.end_date ? fmtDate(cycle.end_date) : "—"}
          </p>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DetailStat label="Balance Inicial" value={fmtMoney(cycle.opening_balance)} />
        <DetailStat label="Balance Final" value={cycle.closing_balance != null ? fmtMoney(cycle.closing_balance) : "—"} />
        <DetailStat label="Profit del Corte" value={fmtMoney(profit, { sign: true })} tone={profit} />
        <DetailStat label="Rentabilidad" value={fmtPct(returnPct)} tone={returnPct} />
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <span>Snapshot de Inversores</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">— Inmutable</span>
        </h2>
        <div className="bg-card border rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground text-center">Cargando snapshots…</div>
          ) : !snapshots || snapshots.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No hay snapshots registrados para este corte.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                    <th className="px-3 py-2.5 font-medium">#</th>
                    <th className="px-3 py-2.5 font-medium">Nombre</th>
                    <th className="px-3 py-2.5 font-medium text-right">Capital al Inicio</th>
                    <th className="px-3 py-2.5 font-medium text-right">Participación</th>
                    <th className="px-3 py-2.5 font-medium text-right">Ganancia Bruta</th>
                    <th className="px-3 py-2.5 font-medium text-right">Fee Admin. %</th>
                    <th className="px-3 py-2.5 font-medium text-right">Fee Admin. $</th>
                    <th className="px-3 py-2.5 font-medium text-right">Ganancia Neta</th>
                    <th className="px-3 py-2.5 font-medium text-right">Capital al Cierre</th>
                    <th className="px-3 py-2.5 font-medium text-right">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s: CorteSnapshotRow, i: number) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-accent/20 transition">
                      <td className="px-3 py-3 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-3 font-medium">{s.display_name}</td>
                      <td className="px-3 py-3 text-right num">{fmtMoney(s.opening_capital)}</td>
                      <td className="px-3 py-3 text-right num">{fmtPct(s.participation_pct)}</td>
                      <td className={cn("px-3 py-3 text-right num", s.gross_profit > 0 && "pos", s.gross_profit < 0 && "neg")}>
                        {fmtMoney(s.gross_profit, { sign: true })}
                      </td>
                      <td className="px-3 py-3 text-right num text-xs text-muted-foreground">{fmtPct(s.admin_fee_pct)}</td>
                      <td className="px-3 py-3 text-right num text-xs">{fmtMoney(s.admin_fee_amount)}</td>
                      <td className={cn("px-3 py-3 text-right num font-medium", s.net_profit > 0 && "pos", s.net_profit < 0 && "neg")}>
                        {fmtMoney(s.net_profit, { sign: true })}
                      </td>
                      <td className="px-3 py-3 text-right num font-medium">{fmtMoney(s.closing_capital)}</td>
                      <td className={cn("px-3 py-3 text-right num", s.cycle_roi_pct > 0 && "pos", s.cycle_roi_pct < 0 && "neg")}>
                        {fmtPct(s.cycle_roi_pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="px-3 py-2 text-[11px] text-muted-foreground">
          Los snapshots son registros inmutables generados atómicamente al cerrar el corte. No pueden editarse ni eliminarse.
        </div>
      </section>
    </div>
  );
}

function DetailStat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const toneCls = tone === undefined ? "" : tone > 0 ? "text-positive" : tone < 0 ? "text-negative" : "";
  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("num text-xl mt-2 font-semibold", toneCls)}>{value}</div>
    </div>
  );
}
