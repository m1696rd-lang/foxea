import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, fmtPct, cn } from "@/lib/format";
import { loadFundState } from "@/lib/finance";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/configuracion")({
  head: () => ({ meta: [{ title: "Configuración — SCALPING FOX" }, { name: "robots", content: "noindex" }] }),
  component: Configuracion,
});

function Configuracion() {
  const auth = useAuth();
  const qc = useQueryClient();
  const { data: fs, isLoading } = useQuery({ queryKey: ["fund-state"], queryFn: loadFundState });

  if (!auth.isAdmin) return <div className="text-sm text-muted-foreground">Acceso restringido.</div>;
  if (isLoading || !fs) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-6 max-w-[900px]">
      <header>
        <div className="text-[10px] uppercase tracking-[0.25em] text-primary font-mono">Configuración</div>
        <h1 className="text-2xl font-semibold mt-1 tracking-tight">Parámetros del fondo</h1>
        <p className="text-sm text-muted-foreground mt-1">Ajustes administrativos. Los cambios se reflejan inmediatamente.</p>
      </header>

      <FundSettingsCard fund={fs.fund} onDone={() => qc.invalidateQueries()} />
      <InvestorFeesCard investors={fs.investors} onDone={() => qc.invalidateQueries()} />
    </div>
  );
}

function FundSettingsCard({ fund, onDone }: { fund: NonNullable<Awaited<ReturnType<typeof loadFundState>>>["fund"]; onDone: () => void }) {
  const [name, setName] = useState(fund.name);
  const [balance, setBalance] = useState(String(fund.current_balance));
  const [feePct, setFeePct] = useState(String(fund.default_admin_fee_pct));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("funds").update({
        name,
        current_balance_manual: Number(balance),
        default_admin_fee_pct: Number(feePct),
      }).eq("id", fund.fund_id);
      if (error) throw error;
    },
    onSuccess: () => { setSaved(true); onDone(); setTimeout(() => setSaved(false), 2000); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <section className="bg-card border rounded-lg p-5">
      <h2 className="text-sm font-semibold mb-4">Parámetros generales</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Nombre del fondo">
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full bg-input border rounded-md px-3 py-2 text-sm" />
        </Field>
        <Field label="Balance actual (USD)">
          <input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)}
            className="w-full bg-input border rounded-md px-3 py-2 text-sm num" />
        </Field>
        <Field label="Fee administración default (%)">
          <input type="number" step="0.01" value={feePct} onChange={(e) => setFeePct(e.target.value)}
            className="w-full bg-input border rounded-md px-3 py-2 text-sm num" />
        </Field>
      </div>
      {error && <div className="text-sm text-negative mt-3">{error}</div>}
      <div className="flex items-center gap-3 mt-4">
        <button disabled={mut.isPending} onClick={() => mut.mutate()}
          className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50">
          {mut.isPending ? "Guardando…" : "Guardar cambios"}
        </button>
        {saved && <span className="text-xs text-positive">Guardado</span>}
      </div>
    </section>
  );
}

function InvestorFeesCard({ investors, onDone }: {
  investors: NonNullable<Awaited<ReturnType<typeof loadFundState>>>["investors"];
  onDone: () => void;
}) {
  return (
    <section className="bg-card border rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b">
        <h2 className="text-sm font-semibold">Fee de administración por inversor</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Si un inversor no tiene fee propio, se usa el fee default del fondo al generar el corte.
        </p>
      </div>
      <div className="divide-y">
        {investors.map((inv) => (
          <InvestorFeeRow key={inv.investor_id} investor={inv} onDone={onDone} />
        ))}
      </div>
    </section>
  );
}

function InvestorFeeRow({ investor, onDone }: {
  investor: NonNullable<Awaited<ReturnType<typeof loadFundState>>>["investors"][number];
  onDone: () => void;
}) {
  const [feePct, setFeePct] = useState<string>(investor.fee_pct != null ? String(investor.fee_pct) : "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setFeePct(investor.fee_pct != null ? String(investor.fee_pct) : "");
  }, [investor.fee_pct]);

  const mut = useMutation({
    mutationFn: async () => {
      const value = feePct === "" ? null : Number(feePct);
      const { error } = await supabase.from("investors").update({ fee_pct: value }).eq("id", investor.investor_id);
      if (error) throw error;
    },
    onSuccess: () => { setSaved(true); onDone(); setTimeout(() => setSaved(false), 2000); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-2">
          {investor.display_name}
          {investor.is_internal && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">Interno</span>}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          Capital actual: {fmtMoney(investor.current_capital)} · Participación {fmtPct(investor.participation_pct)}
        </div>
        {error && <div className="text-[11px] text-negative mt-1">{error}</div>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number" step="0.01" placeholder="default" value={feePct}
          onChange={(e) => setFeePct(e.target.value)}
          className="w-20 bg-input border rounded-md px-2 py-1.5 text-sm num text-right"
        />
        <span className="text-xs text-muted-foreground">%</span>
        <button disabled={mut.isPending} onClick={() => mut.mutate()}
          className={cn("text-xs px-2.5 py-1.5 rounded-md border font-medium transition",
            saved ? "border-positive text-positive" : "hover:bg-accent")}>
          {saved ? "✓" : "Guardar"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
