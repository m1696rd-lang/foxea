import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function safeNext(next: unknown): string | undefined {
  if (typeof next !== "string") return undefined;
  // Only same-origin relative paths.
  if (!next.startsWith("/") || next.startsWith("//")) return undefined;
  return next;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const next = safeNext(s.next);
    return next ? { next } : {};
  },
  head: () => ({
    meta: [
      { title: "Iniciar sesión — MRD Fund" },
      { name: "description", content: "Acceso privado a la plataforma de gestión del MRD Fund." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const goNext = () => {
    if (next) { window.location.href = next; return; }
    navigate({ to: "/dashboard" });
  };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"signin" | "forgot">("signin");
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goNext();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, next]);

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    goNext();
  }
  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return setError(error.message);
    setInfo("Si el correo existe, hemos enviado instrucciones para restablecer la contraseña.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-primary text-xs font-mono tracking-[0.3em] mb-2">MRD FUND</div>
          <h1 className="text-2xl font-semibold">Fund Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Plataforma privada de gestión de inversión</p>
        </div>

        <div className="bg-card border rounded-xl p-6 shadow-2xl">
          {view === "signin" ? (
            <form onSubmit={onSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Correo electrónico</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-input border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Contraseña</label>
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-input border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              {error && <div className="text-sm text-negative">{error}</div>}
              <button type="submit" disabled={loading}
                className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition">
                {loading ? "Ingresando…" : "Ingresar"}
              </button>
              <button type="button" onClick={() => { setView("forgot"); setError(null); }}
                className="w-full text-xs text-muted-foreground hover:text-foreground text-center">
                ¿Olvidaste tu contraseña?
              </button>
            </form>
          ) : (
            <form onSubmit={onForgot} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Correo electrónico</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-input border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              {error && <div className="text-sm text-negative">{error}</div>}
              {info && <div className="text-sm text-positive">{info}</div>}
              <button type="submit" disabled={loading}
                className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {loading ? "Enviando…" : "Enviar instrucciones"}
              </button>
              <button type="button" onClick={() => { setView("signin"); setError(null); setInfo(null); }}
                className="w-full text-xs text-muted-foreground hover:text-foreground text-center">
                Volver al inicio de sesión
              </button>
            </form>
          )}
        </div>
        <div className="mt-4 text-center text-[11px] text-muted-foreground">
          Solo el administrador puede crear cuentas.
        </div>
      </div>
    </div>
  );
}
