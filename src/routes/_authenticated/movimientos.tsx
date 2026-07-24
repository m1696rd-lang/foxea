import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, fmtDate } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/movimientos")({
  head: () => ({ meta: [{ title: "Movimientos — MRD Fund" }, { name: "robots", content: "noindex" }] }),
  component: Movimientos,
});

async function loadMovements() {
  const [{ data: funds }, { data: investors }, { data: contribs }, { data: withdrawals }, { data: cycles }] = await Promise.all([
    supabase.from("funds").select("*").limit(1),
    supabase.from("investors").select("*"),
    supabase.from("capital_contributions").select("*").order("contribution_date", { ascending: false }),
    supabase.from("capital_withdrawals").select("*").order("withdrawal_date", { ascending: false }),
    supabase.from("fund_cycles").select("*"),
  ]);
  return { fund: funds?.[0], investors: investors ?? [], contribs: contribs ?? [], withdrawals: withdrawals ?? [], cycles: cycles ?? [] };
}

function Movimientos() {
  const auth = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["movements"], queryFn: loadMovements });
  const [tab, setTab] = useState<"contribuciones" | "retiros">("contribuciones");

  if (!data?.fund) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <header className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Movimientos</div>
          <h1 className="text-2xl font-semibold mt-1">Contribuciones y retiros</h1>
        </div>
        {auth.isAdmin && (
          <div className="flex gap-2">
            <NewContributionButton {...data} onDone={() => qc.invalidateQueries()} />
            <NewWithdrawalButton {...data} onDone={() => qc.invalidateQueries()} />
          </div>
        )}
      </header>

      <div className="flex gap-1 border-b">
        {(["contribuciones", "retiros"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize border-b-2 transition ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "contribuciones" ? (
        <TxTable rows={data.contribs.map((c) => ({
          id: c.id, date: c.contribution_date, investor: data.investors.find((i) => i.id === c.investor_id)?.display_name ?? "—",
          amount: Number(c.amount), type: c.contribution_type, notes: c.notes ?? "",
          cycle: data.cycles.find((cy) => cy.id === c.cycle_id)?.cycle_number ?? "—",
        }))} kind="in" />
      ) : (
        <TxTable rows={data.withdrawals.map((w) => ({
          id: w.id, date: w.withdrawal_date, investor: data.investors.find((i) => i.id === w.investor_id)?.display_name ?? "—",
          amount: Number(w.amount), type: "withdrawal", notes: w.notes ?? "",
          cycle: data.cycles.find((cy) => cy.id === w.cycle_id)?.cycle_number ?? "—",
        }))} kind="out" />
      )}
    </div>
  );
}

function TxTable({ rows, kind }: { rows: Array<{ id: string; date: string; investor: string; amount: number; type: string; notes: string; cycle: number | string }>; kind: "in" | "out" }) {
  if (rows.length === 0) return <div className="bg-card border rounded-lg p-8 text-center text-sm text-muted-foreground">Sin movimientos registrados.</div>;
  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b">
            <th className="px-3 py-2.5 font-medium">Fecha</th>
            <th className="px-3 py-2.5 font-medium">Inversor</th>
            <th className="px-3 py-2.5 font-medium">Corte</th>
            <th className="px-3 py-2.5 font-medium">Tipo</th>
            <th className="px-3 py-2.5 font-medium">Notas</th>
            <th className="px-3 py-2.5 font-medium text-right">Monto</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="px-3 py-3 text-muted-foreground">{fmtDate(r.date)}</td>
              <td className="px-3 py-3 font-medium">{r.investor}</td>
              <td className="px-3 py-3 text-muted-foreground">#{r.cycle}</td>
              <td className="px-3 py-3 text-xs uppercase tracking-wider text-muted-foreground">{r.type}</td>
              <td className="px-3 py-3 text-muted-foreground truncate max-w-xs">{r.notes}</td>
              <td className={`px-3 py-3 text-right num font-medium ${kind === "in" ? "pos" : "neg"}`}>{kind === "in" ? "+" : "−"}{fmtMoney(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewContributionButton(props: Awaited<ReturnType<typeof loadMovements>> & { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [investorId, setInvestorId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<"additional" | "new_investor" | "initial">("additional");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const openCycle = props.cycles.find((c) => c.status === "open");

  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("capital_contributions").insert({
        fund_id: props.fund!.id, investor_id: investorId, cycle_id: openCycle?.id ?? null,
        amount: Number(amount), contribution_date: date, contribution_type: type, notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { setOpen(false); setAmount(""); setNotes(""); props.onDone(); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium">
        + Contribución
      </button>
      {open && (
        <Modal title="Nueva contribución" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <Select label="Inversor" value={investorId} onChange={setInvestorId}
              options={props.investors.map((i) => ({ value: i.id, label: i.display_name }))} />
            <Input label="Monto (USD)" type="number" value={amount} onChange={setAmount} />
            <Input label="Fecha" type="date" value={date} onChange={setDate} />
            <Select label="Tipo" value={type} onChange={(v) => setType(v as typeof type)}
              options={[{ value: "additional", label: "Adicional" }, { value: "new_investor", label: "Nuevo inversor" }, { value: "initial", label: "Inicial" }]} />
            <Input label="Notas" value={notes} onChange={setNotes} />
            {error && <div className="text-sm text-negative">{error}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setOpen(false)} className="text-sm px-3 py-1.5 rounded-md border">Cancelar</button>
              <button disabled={!investorId || !amount || mut.isPending} onClick={() => mut.mutate()} className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50">
                {mut.isPending ? "Guardando…" : "Registrar"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function NewWithdrawalButton(props: Awaited<ReturnType<typeof loadMovements>> & { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [investorId, setInvestorId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const openCycle = props.cycles.find((c) => c.status === "open");

  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("capital_withdrawals").insert({
        fund_id: props.fund!.id, investor_id: investorId, cycle_id: openCycle?.id ?? null,
        amount: Number(amount), withdrawal_date: date, notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { setOpen(false); setAmount(""); setNotes(""); props.onDone(); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-sm px-3 py-1.5 rounded-md border font-medium">
        − Retiro
      </button>
      {open && (
        <Modal title="Nuevo retiro" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <Select label="Inversor" value={investorId} onChange={setInvestorId}
              options={props.investors.map((i) => ({ value: i.id, label: i.display_name }))} />
            <Input label="Monto (USD)" type="number" value={amount} onChange={setAmount} />
            <Input label="Fecha" type="date" value={date} onChange={setDate} />
            <Input label="Notas" value={notes} onChange={setNotes} />
            {error && <div className="text-sm text-negative">{error}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setOpen(false)} className="text-sm px-3 py-1.5 rounded-md border">Cancelar</button>
              <button disabled={!investorId || !amount || mut.isPending} onClick={() => mut.mutate()} className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50">
                {mut.isPending ? "Guardando…" : "Registrar"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex justify-between items-center px-5 py-4 border-b">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-muted-foreground mb-1">{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-input border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
    </label>
  );
}
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-muted-foreground mb-1">{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-input border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
        <option value="">Seleccionar…</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
