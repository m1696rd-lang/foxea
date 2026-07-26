import { defineTool } from "@lovable.dev/mcp-js";
import { money, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_cycle_history",
  title: "Mi historial de cortes",
  description:
    "Devuelve las liquidaciones (snapshots) inmutables de cada corte cerrado para las posiciones del usuario autenticado: participación, profit bruto, fee de administración y ganancia neta.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated;
    const supabase = supabaseForUser(ctx);

    const [{ data: snapshots, error }, { data: cycles }, { data: investors }] = await Promise.all([
      supabase.from("investor_cycle_snapshots").select("*"),
      supabase.from("fund_cycles").select("id, cycle_number, start_date, end_date"),
      supabase.from("investors").select("id, display_name"),
    ]);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const liquidaciones = (snapshots ?? [])
      .map((s) => {
        const cycle = cycles?.find((c) => c.id === s.cycle_id);
        return {
          corte: cycle?.cycle_number ?? null,
          inicio: cycle?.start_date ?? null,
          cierre: cycle?.end_date ?? null,
          posicion: investors?.find((i) => i.id === s.investor_id)?.display_name ?? "—",
          capital_apertura: money(s.opening_capital),
          participacion_pct: money(s.participation_pct),
          profit_bruto: money(s.gross_profit),
          fee_pct: money(s.admin_fee_pct),
          fee_monto: money(s.admin_fee_amount),
          ganancia_neta: money(s.net_profit),
          capital_cierre: money(s.closing_capital),
          roi_corte_pct: money(s.cycle_roi_pct),
        };
      })
      .sort((a, b) => (b.corte ?? 0) - (a.corte ?? 0));

    const result = {
      liquidaciones,
      ganancia_neta_acumulada: liquidaciones.reduce((a, l) => a + l.ganancia_neta, 0),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
