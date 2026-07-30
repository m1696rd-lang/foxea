import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  loadAccounting,
  statementToCsv,
  ledgerToCsv,
  downloadCsv,
  type LedgerPeriod,
  type ReconciliationRow,
  type InvestorStatement,
} from "@/lib/accounting";
import { fmtMoney, fmtPct, fmtDate, cn } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/contabilidad")({
  head: () => ({
    meta: [
      { title: "Contabilidad — SCALPING FOX" },
      { name: "description", content: "Libro contable, conciliación de saldo y estados de cuenta del fondo." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Contabilidad,
});

type Tab = "libro" | "conciliacion" | "estados";

function Contabilidad() {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("libro");
  const { data, isLoading } = useQuery({ queryKey: ["accounting"], queryFn: loadAccounting });

  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando contabilidad…</div>;
  if (!data) return <div className="text-sm text-muted-foreground">Sin datos contables.</div>;

  const tabs: { id: Tab; label: string }[] = [
    { id: "libro", label: "Libro contable" },
    { id: "conciliacion", label: "Conciliación de saldo" },
    { id: "estados", label: "Estados de cuenta" },
  ];

  return (
    <div className="space-y-6 max-w-[1400px]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-primary font-mono">Contabilidad</div>
          <h1 className="text-2xl font-semibold mt-1 tracking-tight">Estado financiero del fondo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cifras derivadas del registro inmutable de aportes, retiros y cortes. Moneda: {data.currency}.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo actual (broker)</div>
          <div className="text-xl font-semibold num">{fmtMoney(data.manual_balance)}</div>
        </div>
      </header>

      <nav className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 text-sm -mb-px border-b-2 transition",
              tab === t.id
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "libro" && <Libro data={data} />}
      {tab === "conciliacion" && <Conciliacion rows={data.reconciliation} />}
      {tab === "estados" && <Estados statements={data.statements} isAdmin={auth.isAdmin} />}
    </div>
  );
}

function Libro({ data }: { data: NonNullable<Awaited<ReturnType<typeof loadAccounting>>> }) {
  const t = data.totals;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Aportes" value={fmtMoney(t.contributions)} />
        <Kpi label="Retiros" value={fmtMoney(t.withdrawals)} />
        <Kpi label="Utilidad bruta" value={fmtMoney(t.gross_profit, { sign: true })} tone={t.gross_profit} />
        <Kpi label="Comisiones admin." value={fmtMoney(-t.admin_fees, { sign: true })} tone={-t.admin_fees} />
        <Kpi label="Utilidad neta" value={fmtMoney(t.net_profit, { sign: true })} tone={t.net_profit} />
      </div>

      <section className="bg-card border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">Estado de resultados por ciclo</h2>
          <button
            onClick={() => downloadCsv("libro-contable.csv", ledgerToCsv(data.periods))}
            className="text-xs px-3 py-1.5 rounded-md border hover:bg-accent transition"
          >
            Exportar CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                <th className="px-3 py-2.5 font-medium">Ciclo</th>
                <th className="px-3 py-2.5 font-medium">Periodo</th>
                <th className="px-3 py-2.5 font-medium text-right">Saldo inicial</th>
                <th className="px-3 py-2.5 font-medium text-right">Aportes</th>
                <th className="px-3 py-2.5 font-medium text-right">Retiros</th>
                <th className="px-3 py-2.5 font-medium text-right">Utilidad bruta</th>
                <th className="px-3 py-2.5 font-medium text-right">Comisiones</th>
                <th className="px-3 py-2.5 font-medium text-right">Utilidad neta</th>
                <th className="px-3 py-2.5 font-medium text-right">Rend.</th>
              </tr>
            </thead>
            <tbody>
              {data.periods.map((p: LedgerPeriod) => (
                <tr key={p.cycle_id} className="border-b last:border-0 hover:bg-accent/30 transition">
                  <td className="px-3 py-3 font-medium">
                    #{p.cycle_number}
                    {p.is_estimate && (
                      <span className="ml-2 text-[9px] uppercase tracking-wider text-primary">estimado</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground text-xs">
                    {fmtDate(p.start_date)} — {p.end_date ? fmtDate(p.end_date) : "en curso"}
                  </td>
                  <td className="px-3 py-3 text-right num">{fmtMoney(p.opening_balance)}</td>
                  <td className="px-3 py-3 text-right num">{fmtMoney(p.contributions)}</td>
                  <td className="px-3 py-3 text-right num">{fmtMoney(p.withdrawals)}</td>
                  <td className={cn("px-3 py-3 text-right num", p.gross_profit > 0 && "pos", p.gross_profit < 0 && "neg")}>
                    {fmtMoney(p.gross_profit, { sign: true })}
                  </td>
                  <td className="px-3 py-3 text-right num text-muted-foreground">{fmtMoney(-p.admin_fees, { sign: true })}</td>
                  <td className={cn("px-3 py-3 text-right num font-medium", p.net_profit > 0 && "pos", p.net_profit < 0 && "neg")}>
                    {fmtMoney(p.net_profit, { sign: true })}
                  </td>
                  <td className={cn("px-3 py-3 text-right num", p.return_pct > 0 && "pos", p.return_pct < 0 && "neg")}>
                    {fmtPct(p.return_pct)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-secondary/40 text-sm font-medium">
                <td className="px-3 py-3" colSpan={3}>Totales</td>
                <td className="px-3 py-3 text-right num">{fmtMoney(t.contributions)}</td>
                <td className="px-3 py-3 text-right num">{fmtMoney(t.withdrawals)}</td>
                <td className="px-3 py-3 text-right num">{fmtMoney(t.gross_profit, { sign: true })}</td>
                <td className="px-3 py-3 text-right num">{fmtMoney(-t.admin_fees, { sign: true })}</td>
                <td className="px-3 py-3 text-right num">{fmtMoney(t.net_profit, { sign: true })}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <p className="text-xs text-muted-foreground">
        El ciclo abierto se muestra como estimado: su resultado se calcula contra el saldo manual vigente y solo se
        vuelve definitivo al generar el corte.
      </p>
    </div>
  );
}

function Conciliacion({ rows }: { rows: ReconciliationRow[] }) {
  return (
    <section className="bg-card border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b">
        <h2 className="text-sm font-semibold">Saldo del broker vs. capital contable</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Diferencias distintas de cero indican movimientos no registrados o comisiones externas por documentar.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b">
              <th className="px-3 py-2.5 font-medium">Ciclo</th>
              <th className="px-3 py-2.5 font-medium">Fecha ref.</th>
              <th className="px-3 py-2.5 font-medium text-right">Saldo registrado</th>
              <th className="px-3 py-2.5 font-medium text-right">Capital contable</th>
              <th className="px-3 py-2.5 font-medium text-right">Diferencia</th>
              <th className="px-3 py-2.5 font-medium">Estatus</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ok = Math.abs(r.difference) < 0.01;
              return (
                <tr key={r.cycle_id} className="border-b last:border-0 hover:bg-accent/30 transition">
                  <td className="px-3 py-3 font-medium">#{r.cycle_number}</td>
                  <td className="px-3 py-3 text-muted-foreground text-xs">{fmtDate(r.reference_date)}</td>
                  <td className="px-3 py-3 text-right num">{r.manual_balance != null ? fmtMoney(r.manual_balance) : "—"}</td>
                  <td className="px-3 py-3 text-right num">{fmtMoney(r.accounting_balance)}</td>
                  <td className={cn("px-3 py-3 text-right num font-medium", !ok && (r.difference > 0 ? "pos" : "neg"))}>
                    {ok ? fmtMoney(0) : fmtMoney(r.difference, { sign: true })}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-wider",
                        ok ? "text-positive" : "text-negative",
                      )}
                    >
                      {ok ? "Conciliado" : "Diferencia"}
                    </span>
                    {r.is_estimate && (
                      <span className="ml-2 text-[9px] uppercase tracking-wider text-primary">ciclo abierto</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Estados({ statements, isAdmin }: { statements: InvestorStatement[]; isAdmin: boolean }) {
  const [selected, setSelected] = useState(statements[0]?.investor_id ?? "");
  const st = statements.find((s) => s.investor_id === selected) ?? statements[0];

  if (!st) return <div className="text-sm text-muted-foreground">Sin posiciones disponibles.</div>;

  return (
    <div className="space-y-5">
      {(isAdmin || statements.length > 1) && (
        <div className="flex flex-wrap gap-2">
          {statements.map((s) => (
            <button
              key={s.investor_id}
              onClick={() => setSelected(s.investor_id)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-md border transition",
                s.investor_id === st.investor_id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent",
              )}
            >
              {s.display_name}
            </button>
          ))}
        </div>
      )}

      <section className="bg-card border rounded-lg overflow-hidden print:border-0">
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 py-4 border-b">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-primary font-mono">Estado de cuenta</div>
            <div className="text-lg font-semibold mt-0.5">{st.display_name}</div>
            <div className="text-xs text-muted-foreground">Posición activa desde {fmtDate(st.date_joined)}</div>
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              onClick={() => downloadCsv(`estado-cuenta-${st.display_name}.csv`, statementToCsv(st))}
              className="text-xs px-3 py-1.5 rounded-md border hover:bg-accent transition"
            >
              Exportar CSV
            </button>
            <button
              onClick={() => window.print()}
              className="text-xs px-3 py-1.5 rounded-md border hover:bg-accent transition"
            >
              Imprimir
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
          <Cell label="Capital aportado" value={fmtMoney(st.totals.contributed)} />
          <Cell label="Capital retirado" value={fmtMoney(st.totals.withdrawn)} />
          <Cell label="Utilidad neta" value={fmtMoney(st.totals.net_profit, { sign: true })} tone={st.totals.net_profit} />
          <Cell label="Capital actual" value={fmtMoney(st.totals.current_capital)} />
          <Cell label="Utilidad bruta" value={fmtMoney(st.totals.gross_profit, { sign: true })} tone={st.totals.gross_profit} />
          <Cell label="Comisiones pagadas" value={fmtMoney(st.totals.admin_fees)} />
          <Cell label="Pend. de recuperación" value={fmtMoney(st.totals.pending_recovery)} />
          <Cell
            label="ROI"
            value={fmtPct(st.totals.contributed > 0 ? ((st.totals.withdrawn + st.totals.current_capital - st.totals.contributed) / st.totals.contributed) * 100 : 0)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                <th className="px-3 py-2.5 font-medium">Fecha</th>
                <th className="px-3 py-2.5 font-medium">Concepto</th>
                <th className="px-3 py-2.5 font-medium">Ciclo</th>
                <th className="px-3 py-2.5 font-medium text-right">Monto</th>
                <th className="px-3 py-2.5 font-medium text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {st.lines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Sin movimientos registrados.
                  </td>
                </tr>
              ) : (
                st.lines.map((l, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{fmtDate(l.date)}</td>
                    <td className="px-3 py-2.5">{l.concept}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{l.cycle_number ? `#${l.cycle_number}` : "—"}</td>
                    <td className={cn("px-3 py-2.5 text-right num", l.amount > 0 && "pos", l.amount < 0 && "neg")}>
                      {fmtMoney(l.amount, { sign: true })}
                    </td>
                    <td className="px-3 py-2.5 text-right num">{fmtMoney(l.balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t text-[11px] text-muted-foreground">
          El capital actual incluye la participación no realizada del ciclo abierto y puede variar hasta el corte.
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold mt-1 num", tone != null && tone > 0 && "pos", tone != null && tone < 0 && "neg")}>
        {value}
      </div>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div className="bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold mt-1 num", tone != null && tone > 0 && "pos", tone != null && tone < 0 && "neg")}>
        {value}
      </div>
    </div>
  );
}
