import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { loadFundState } from "@/lib/finance";
import { fmtMoney, fmtPct, fmtDate, cn } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/mi-inversion")({
  head: () => ({
    meta: [
      { title: "Mi Inversión — MRD Fund" },
      { name: "description", content: "Vista personal del inversor: capital, resultado económico, participación y ROI." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MiInversion,
});

function MiInversion() {
  const auth = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["fund-state"], queryFn: loadFundState });

  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  const me = data.investors.find((i) => i.user_id === auth.user?.id);

  if (!me) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold mb-2">Mi Inversión</h1>
        <p className="text-sm text-muted-foreground">Tu cuenta aún no está vinculada a un registro de inversor. Contacta al administrador.</p>
      </div>
    );
  }

  const cycle = data.fund.current_cycle;

  return (
    <div className="space-y-8 max-w-4xl">
      <header>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Mi Inversión</div>
        <h1 className="text-2xl font-semibold mt-1">{me.display_name}</h1>
        <div className="text-xs text-muted-foreground mt-1">Desde {fmtDate(me.date_joined)} · Corte #{cycle?.number ?? "—"}</div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card label="Capital Actual" value={fmtMoney(me.current_capital)} emphasis />
        <Card label="Resultado Económico" value={fmtMoney(me.economic_result, { sign: true })} tone={me.economic_result} />
        <Card label="Participación" value={fmtPct(me.participation_pct)} />
        <Card label="ROI Personal" value={fmtPct(me.roi_pct)} tone={me.roi_pct} />
        <Card label="Capital Aportado" value={fmtMoney(me.total_contributed)} />
        <Card label="Capital Retirado" value={fmtMoney(me.total_withdrawn)} />
        <Card label="Aporte Inicial" value={fmtMoney(me.initial_contribution)} />
        <Card
          label="Cap. Pendiente Recuperación"
          value={fmtMoney(me.pending_recovery, { sign: true })}
          hint="Aportado − Retirado − Actual. Negativo = ya recuperaste tu capital."
        />
        <Card label="Profit del Corte (est.)" value={fmtMoney((me.participation_pct / 100) * (cycle?.profit ?? 0), { sign: true })} tone={cycle?.profit ?? 0} />
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-3">Estado del Fondo</h2>
        <div className="bg-card border rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><div className="text-[10px] uppercase text-muted-foreground">Balance actual</div><div className="num mt-1 font-medium">{fmtMoney(data.fund.current_balance)}</div></div>
          <div><div className="text-[10px] uppercase text-muted-foreground">Profit del corte</div><div className={cn("num mt-1 font-medium", (cycle?.profit ?? 0) > 0 && "pos", (cycle?.profit ?? 0) < 0 && "neg")}>{fmtMoney(cycle?.profit ?? 0, { sign: true })}</div></div>
          <div><div className="text-[10px] uppercase text-muted-foreground">Rentabilidad</div><div className={cn("num mt-1 font-medium", (cycle?.return_pct ?? 0) > 0 && "pos")}>{fmtPct(cycle?.return_pct ?? 0)}</div></div>
          <div><div className="text-[10px] uppercase text-muted-foreground">Participantes</div><div className="num mt-1 font-medium">{data.investors.length}</div></div>
        </div>
      </section>
    </div>
  );
}

function Card({ label, value, tone, emphasis, hint }: { label: string; value: string; tone?: number; emphasis?: boolean; hint?: string }) {
  const toneCls = tone === undefined ? "" : tone > 0 ? "text-positive" : tone < 0 ? "text-negative" : "";
  return (
    <div className={cn("bg-card border rounded-lg p-4", emphasis && "ring-1 ring-primary/30")} title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("num text-xl mt-2 font-semibold", toneCls)}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
