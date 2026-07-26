import { defineTool } from "@lovable.dev/mcp-js";
import { money, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_positions",
  title: "Mis posiciones financieras",
  description:
    "Lista las posiciones financieras (cuentas de inversión) vinculadas al usuario autenticado, con aporte inicial, capital aportado, capital retirado, capital actual, participación %, ROI % y capital pendiente de recuperación.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated;
    const supabase = supabaseForUser(ctx);

    const [{ data: funds }, { data: investors }, { data: cycles }, { data: contribs }, { data: withdrawals }, { data: snapshots }] =
      await Promise.all([
        supabase.from("funds").select("id, current_balance_manual").limit(1),
        supabase.from("investors").select("id, display_name, group_label, is_internal, date_joined, initial_contribution, status, fee_pct"),
        supabase.from("fund_cycles").select("id, cycle_number, status, opening_balance, start_date"),
        supabase.from("capital_contributions").select("investor_id, amount, contribution_date"),
        supabase.from("capital_withdrawals").select("investor_id, amount, withdrawal_date"),
        supabase.from("investor_cycle_snapshots").select("investor_id, net_profit"),
      ]);

    const fund = funds?.[0];
    const open = cycles?.find((c) => c.status === "open") ?? null;
    const fundOpening = open ? money(open.opening_balance) : 0;
    const balance = money(fund?.current_balance_manual);
    const unrealized = open ? balance - fundOpening : 0;

    const positions = (investors ?? []).map((inv) => {
      const contributed = (contribs ?? [])
        .filter((c) => c.investor_id === inv.id)
        .reduce((a, c) => a + money(c.amount), 0);
      const withdrawn = (withdrawals ?? [])
        .filter((w) => w.investor_id === inv.id)
        .reduce((a, w) => a + money(w.amount), 0);
      const realized = (snapshots ?? [])
        .filter((s) => s.investor_id === inv.id)
        .reduce((a, s) => a + money(s.net_profit), 0);

      const openingContrib = (contribs ?? [])
        .filter((c) => c.investor_id === inv.id && (!open || c.contribution_date <= open.start_date))
        .reduce((a, c) => a + money(c.amount), 0);
      const openingWd = (withdrawals ?? [])
        .filter((w) => w.investor_id === inv.id && (!open || w.withdrawal_date <= open.start_date))
        .reduce((a, w) => a + money(w.amount), 0);
      const opening = openingContrib - openingWd + realized;

      const participation = fundOpening > 0 ? (opening / fundOpening) * 100 : 0;
      const current = opening + (fundOpening > 0 ? (opening / fundOpening) * unrealized : 0);
      const economic = withdrawn + current - contributed;

      return {
        posicion: inv.display_name,
        grupo: inv.group_label ?? null,
        interna: inv.is_internal,
        estatus: inv.status,
        fecha_ingreso: inv.date_joined,
        aporte_inicial: money(inv.initial_contribution),
        capital_aportado: contributed,
        capital_retirado: withdrawn,
        capital_actual: current,
        resultado_economico: economic,
        capital_pendiente_recuperacion: contributed - withdrawn - current,
        participacion_pct: participation,
        roi_pct: contributed > 0 ? (economic / contributed) * 100 : 0,
        fee_administracion_pct: money(inv.fee_pct),
      };
    });

    const misCapital = positions.reduce((a, p) => a + p.capital_actual, 0);
    const result = {
      posiciones: positions,
      consolidado: {
        capital_actual: misCapital,
        participacion_pct: fundOpening > 0 ? (misCapital / balance) * 100 : 0,
      },
      resto_del_fondo: {
        capital_actual: balance - misCapital,
        participacion_pct: balance > 0 ? ((balance - misCapital) / balance) * 100 : 0,
      },
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
