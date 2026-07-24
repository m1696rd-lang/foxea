import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { loadFundState } from "@/lib/finance";
import { fmtMoney, fmtPct, fmtDate, cn } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/inversores")({
  head: () => ({ meta: [{ title: "Inversores — MRD Fund" }, { name: "robots", content: "noindex" }] }),
  component: Inversores,
});

function Inversores() {
  const { data, isLoading } = useQuery({ queryKey: ["fund-state"], queryFn: loadFundState });
  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <header>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Inversores</div>
        <h1 className="text-2xl font-semibold mt-1">Registro y desempeño</h1>
      </header>

      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                <th className="px-3 py-2.5 font-medium">Nombre</th>
                <th className="px-3 py-2.5 font-medium">Desde</th>
                <th className="px-3 py-2.5 font-medium text-right">Aporte Inicial</th>
                <th className="px-3 py-2.5 font-medium text-right">Cap. Aportado</th>
                <th className="px-3 py-2.5 font-medium text-right">Cap. Retirado</th>
                <th className="px-3 py-2.5 font-medium text-right">Cap. Actual</th>
                <th className="px-3 py-2.5 font-medium text-right">Resultado Econ.</th>
                <th className="px-3 py-2.5 font-medium text-right">Pend. Recup.</th>
                <th className="px-3 py-2.5 font-medium text-right">Participación</th>
                <th className="px-3 py-2.5 font-medium text-right">ROI</th>
                <th className="px-3 py-2.5 font-medium">Estatus</th>
              </tr>
            </thead>
            <tbody>
              {data.investors.map((r) => (
                <tr key={r.investor_id} className="border-b last:border-0 hover:bg-accent/30 transition">
                  <td className="px-3 py-3 font-medium">{r.display_name}</td>
                  <td className="px-3 py-3 text-muted-foreground">{fmtDate(r.date_joined)}</td>
                  <td className="px-3 py-3 text-right num">{fmtMoney(r.initial_contribution)}</td>
                  <td className="px-3 py-3 text-right num">{fmtMoney(r.total_contributed)}</td>
                  <td className="px-3 py-3 text-right num">{fmtMoney(r.total_withdrawn)}</td>
                  <td className="px-3 py-3 text-right num font-medium">{fmtMoney(r.current_capital)}</td>
                  <td className={cn("px-3 py-3 text-right num", r.economic_result > 0 && "pos", r.economic_result < 0 && "neg")}>{fmtMoney(r.economic_result, { sign: true })}</td>
                  <td className="px-3 py-3 text-right num text-xs text-muted-foreground">{fmtMoney(r.pending_recovery, { sign: true })}</td>
                  <td className="px-3 py-3 text-right num">{fmtPct(r.participation_pct)}</td>
                  <td className={cn("px-3 py-3 text-right num", r.roi_pct > 0 && "pos", r.roi_pct < 0 && "neg")}>{fmtPct(r.roi_pct)}</td>
                  <td className="px-3 py-3"><span className="text-[10px] uppercase tracking-wider text-positive">{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
