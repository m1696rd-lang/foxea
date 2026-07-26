import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { loadRecentActivity, type ActivityRow } from "@/lib/finance";
import { fmtDateTime, fmtRelative, cn } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/historial")({
  head: () => ({ meta: [{ title: "Historial — SCALPING FOX" }, { name: "robots", content: "noindex" }] }),
  component: Historial,
});

function Historial() {
  const auth = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["recent-activity", "all"], queryFn: () => loadRecentActivity(100) });

  if (!auth.isAdmin) return <div className="text-sm text-muted-foreground">Acceso restringido.</div>;
  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Cargando historial…</div>;

  return (
    <div className="space-y-6 max-w-[1100px]">
      <header>
        <div className="text-[10px] uppercase tracking-[0.25em] text-primary font-mono">Historial</div>
        <h1 className="text-2xl font-semibold mt-1 tracking-tight">Actividad del fondo</h1>
        <p className="text-sm text-muted-foreground mt-1">Registro inmutable de eventos financieros y administrativos.</p>
      </header>

      {data.length === 0 ? (
        <div className="bg-card border rounded-lg p-8 text-center text-sm text-muted-foreground">
          Sin actividad registrada.
        </div>
      ) : (
        <div className="bg-card border rounded-lg overflow-hidden">
          <ul className="divide-y">
            {data.map((a: ActivityRow) => (
              <li key={a.id} className="flex items-start gap-3 px-4 py-3 hover:bg-accent/20 transition">
                <ActivityIcon kind={a.kind} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{a.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{a.actor_label}</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span title={fmtDateTime(a.created_at)}>{fmtRelative(a.created_at)}</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider">{a.entity}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
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
    <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5", s.bg)}>
      <span className={cn("h-2 w-2 rounded-full", s.dot)} />
    </div>
  );
}
