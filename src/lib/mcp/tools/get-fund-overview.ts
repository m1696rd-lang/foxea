import { defineTool } from "@lovable.dev/mcp-js";
import { money, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_fund_overview",
  title: "Resumen del fondo",
  description:
    "Devuelve el estado actual del fondo SCALPING FOX: capital inicial, balance actual, corte abierto (número, fecha de inicio, balance de apertura, operaciones abiertas) y profit del corte.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated;
    const supabase = supabaseForUser(ctx);

    const { data: funds, error } = await supabase
      .from("funds")
      .select("id, name, initial_capital, current_balance_manual, default_admin_fee_pct")
      .limit(1);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const fund = funds?.[0];
    if (!fund) return { content: [{ type: "text", text: "No hay fondo configurado." }], isError: true };

    const { data: cycles } = await supabase
      .from("fund_cycles")
      .select("cycle_number, start_date, opening_balance, status, open_positions, closing_balance, gross_profit, fund_return_pct")
      .eq("fund_id", fund.id)
      .order("cycle_number", { ascending: false });

    const open = cycles?.find((c) => c.status === "open") ?? null;
    const balance = money(fund.current_balance_manual);
    const cycleProfit = open ? balance - money(open.opening_balance) : 0;

    const result = {
      fondo: fund.name,
      capital_inicial: money(fund.initial_capital),
      balance_actual: balance,
      fee_administracion_default_pct: money(fund.default_admin_fee_pct),
      corte_actual: open
        ? {
            numero: open.cycle_number,
            inicio: open.start_date,
            balance_apertura: money(open.opening_balance),
            operaciones_abiertas: open.open_positions,
            profit_corte: cycleProfit,
            rentabilidad_pct:
              money(open.opening_balance) > 0 ? (cycleProfit / money(open.opening_balance)) * 100 : 0,
          }
        : null,
      cortes_cerrados: (cycles ?? [])
        .filter((c) => c.status === "closed")
        .map((c) => ({
          numero: c.cycle_number,
          balance_apertura: money(c.opening_balance),
          balance_cierre: money(c.closing_balance),
          profit: money(c.gross_profit),
          rentabilidad_pct: money(c.fund_return_pct),
        })),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
