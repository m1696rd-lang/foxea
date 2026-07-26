import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Supabase client acting as the authenticated MCP caller.
 * RLS runs as that user, so every tool only sees what the user may see.
 */
export function supabaseForUser(ctx: ToolContext) {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export const notAuthenticated = {
  content: [{ type: "text" as const, text: "No autenticado. Conecta tu cuenta de SCALPING FOX." }],
  isError: true,
};

export function money(n: unknown) {
  return Number(n ?? 0);
}
