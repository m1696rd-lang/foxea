import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OAuthResult = {
  data?: { client?: { name?: string } | null; redirect_url?: string; redirect_to?: string } | null;
  error?: { message: string } | null;
};

// `supabase.auth.oauth` is beta and not in the published types yet.
const oauth = () =>
  (supabase.auth as unknown as {
    oauth: {
      getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
      approveAuthorization: (id: string) => Promise<OAuthResult>;
      denyAuthorization: (id: string) => Promise<OAuthResult>;
    };
  }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the Supabase session lives in localStorage.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Falta authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center px-4 text-center">
      <div className="max-w-md">
        <h1 className="text-lg font-semibold">No se pudo cargar la solicitud de autorización</h1>
        <p className="mt-2 text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "una aplicación";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("El servidor de autorización no devolvió una URL de redirección.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md bg-card border rounded-xl p-6 shadow-2xl">
        <div className="text-primary text-[10px] font-mono tracking-[0.3em]">SCALPING FOX</div>
        <h1 className="text-xl font-semibold mt-2">Conectar {clientName} a tu cuenta</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {clientName} podrá consultar la información del fondo a la que tú tienes acceso: tus posiciones
          financieras, tus movimientos de capital y tu historial de cortes. Solo lectura.
        </p>
        {error && <p role="alert" className="text-sm text-negative mt-4">{error}</p>}
        <div className="flex gap-2 mt-6">
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Procesando…" : "Autorizar"}
          </button>
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 border rounded-md py-2 text-sm font-medium disabled:opacity-50"
          >
            Rechazar
          </button>
        </div>
      </div>
    </main>
  );
}
