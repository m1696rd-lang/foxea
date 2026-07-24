import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuarios — MRD Fund" }, { name: "robots", content: "noindex" }] }),
  component: Usuarios,
});

async function loadUsers() {
  const [{ data: profiles }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("user_roles").select("*"),
  ]);
  return { profiles: profiles ?? [], roles: roles ?? [] };
}

function Usuarios() {
  const auth = useAuth();
  const { data } = useQuery({ queryKey: ["users"], queryFn: loadUsers });

  if (!auth.isAdmin) return <div className="text-sm text-muted-foreground">Acceso restringido.</div>;
  if (!data) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <header className="flex justify-between items-end gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Usuarios</div>
          <h1 className="text-2xl font-semibold mt-1">Gestión de cuentas</h1>
        </div>
        <div className="text-xs text-muted-foreground max-w-md text-right">
          Nuevos usuarios se crean desde el panel de Supabase Auth. El sistema asigna automáticamente el rol de inversor.
        </div>
      </header>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b">
              <th className="px-3 py-2.5 font-medium">Usuario</th>
              <th className="px-3 py-2.5 font-medium">Nombre</th>
              <th className="px-3 py-2.5 font-medium">Roles</th>
              <th className="px-3 py-2.5 font-medium">Creado</th>
              <th className="px-3 py-2.5 font-medium">Estatus</th>
            </tr>
          </thead>
          <tbody>
            {data.profiles.map((p) => {
              const userRoles = data.roles.filter((r) => r.user_id === p.id).map((r) => r.role);
              return (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-3 py-3 font-medium font-mono text-xs">{p.username}</td>
                  <td className="px-3 py-3 text-muted-foreground">{p.full_name ?? "—"}</td>
                  <td className="px-3 py-3 flex gap-1 flex-wrap">
                    {userRoles.map((r) => (
                      <span key={r} className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${r === "admin" ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>{r}</span>
                    ))}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground text-xs">{fmtDate(p.created_at)}</td>
                  <td className="px-3 py-3"><span className={`text-[10px] uppercase tracking-wider ${p.is_active ? "text-positive" : "text-muted-foreground"}`}>{p.is_active ? "Activo" : "Inactivo"}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-card border rounded-lg p-5 text-sm text-muted-foreground">
        <div className="font-medium text-foreground mb-2">Cómo agregar un nuevo inversor</div>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>Crea el usuario en Supabase Auth con su correo electrónico.</li>
          <li>El sistema crea automáticamente el perfil y le asigna el rol <span className="font-mono">investor</span>.</li>
          <li>Regresa a <span className="font-mono">Inversores</span> y crea el registro de inversor vinculado al usuario.</li>
          <li>Registra su <span className="font-mono">aporte inicial</span> en <span className="font-mono">Movimientos</span>.</li>
        </ol>
      </div>
    </div>
  );
}
