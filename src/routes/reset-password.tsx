import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Restablecer contraseña — MRD Fund" }, { name: "robots", content: "noindex" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Wait for supabase to process the recovery hash
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setError(error.message);
    setOk(true);
    setTimeout(() => navigate({ to: "/dashboard" }), 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-card border rounded-xl p-6">
        <h1 className="text-lg font-semibold mb-4">Nueva contraseña</h1>
        {!ready && <p className="text-sm text-muted-foreground">Validando enlace…</p>}
        {ready && !ok && (
          <form onSubmit={onSubmit} className="space-y-4">
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full bg-input border rounded-md px-3 py-2 text-sm" />
            {error && <div className="text-sm text-negative">{error}</div>}
            <button className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium">Guardar contraseña</button>
          </form>
        )}
        {ok && <p className="text-sm text-positive">Contraseña actualizada. Redirigiendo…</p>}
      </div>
    </div>
  );
}
