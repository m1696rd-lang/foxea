import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { money, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_movements",
  title: "Mis movimientos de capital",
  description:
    "Lista las aportaciones y los retiros de capital visibles para el usuario autenticado, ordenados por fecha descendente.",
  inputSchema: {
    limit: z.number().int().optional().describe("Máximo de movimientos por tipo (por defecto 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated;
    const take = Math.min(Math.max(limit ?? 50, 1), 200);
    const supabase = supabaseForUser(ctx);

    const [{ data: investors }, { data: contribs, error: e1 }, { data: withdrawals, error: e2 }] = await Promise.all([
      supabase.from("investors").select("id, display_name"),
      supabase
        .from("capital_contributions")
        .select("id, investor_id, amount, contribution_date, contribution_type, notes, is_correction")
        .order("contribution_date", { ascending: false })
        .limit(take),
      supabase
        .from("capital_withdrawals")
        .select("id, investor_id, amount, withdrawal_date, notes, is_correction")
        .order("withdrawal_date", { ascending: false })
        .limit(take),
    ]);

    const err = e1 ?? e2;
    if (err) return { content: [{ type: "text", text: err.message }], isError: true };

    const name = (id: string) => investors?.find((i) => i.id === id)?.display_name ?? "—";
    const result = {
      aportaciones: (contribs ?? []).map((c) => ({
        posicion: name(c.investor_id),
        fecha: c.contribution_date,
        monto: money(c.amount),
        tipo: c.contribution_type,
        correccion: c.is_correction,
        notas: c.notes,
      })),
      retiros: (withdrawals ?? []).map((w) => ({
        posicion: name(w.investor_id),
        fecha: w.withdrawal_date,
        monto: money(w.amount),
        correccion: w.is_correction,
        notas: w.notes,
      })),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
