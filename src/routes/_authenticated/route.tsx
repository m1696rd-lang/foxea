import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useViewMode } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthLayout,
});

function AuthLayout() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useViewMode();

  useEffect(() => {
    if (!auth.loading && !auth.session) navigate({ to: "/auth" });
  }, [auth.loading, auth.session, navigate]);

  if (auth.loading || !auth.session) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">Cargando…</div>;
  }

  // Genesis admin has both roles. Otherwise force investor.
  const effectiveMode = auth.isAdmin ? viewMode : "investor";

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar mode={effectiveMode} isGenesis={auth.isAdmin && auth.isInvestor} viewMode={viewMode} onSwitch={setViewMode} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar user={auth.user?.email ?? ""} onLogout={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }} />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Sidebar({ mode, isGenesis, viewMode, onSwitch }: {
  mode: "admin" | "investor"; isGenesis: boolean; viewMode: "admin" | "investor"; onSwitch: (m: "admin" | "investor") => void;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const adminNav = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/inversores", label: "Inversores" },
    { to: "/movimientos", label: "Movimientos" },
    { to: "/cortes", label: "Cortes" },
    { to: "/liquidaciones", label: "Liquidaciones" },
    { to: "/usuarios", label: "Usuarios" },
    { to: "/historial", label: "Historial" },
    { to: "/configuracion", label: "Configuración" },
  ];
  const investorNav = [
    { to: "/mi-inversion", label: "Mi Inversión" },
  ];
  const items = mode === "admin" ? adminNav : investorNav;

  return (
    <aside className="w-60 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="px-5 py-6 border-b border-sidebar-border">
        <div className="text-primary text-[10px] font-mono tracking-[0.3em]">SCALPING FOX</div>
        <div className="text-sidebar-foreground font-semibold mt-0.5">Algorithmic Capital Fund</div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {items.map((it) => {
          const active = path === it.to || path.startsWith(it.to + "/");
          return (
            <Link key={it.to} to={it.to} className={`block px-3 py-2 rounded-md text-sm transition ${
              active ? "bg-sidebar-accent text-sidebar-foreground font-medium" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            }`}>{it.label}</Link>
          );
        })}
      </nav>
      {isGenesis && (
        <div className="p-3 border-t border-sidebar-border">
          <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50 mb-2 px-1">Modo de vista</div>
          <div className="grid grid-cols-2 gap-1 bg-sidebar-accent rounded-md p-1">
            <button onClick={() => onSwitch("admin")} className={`text-xs py-1.5 rounded ${viewMode === "admin" ? "bg-primary text-primary-foreground font-medium" : "text-sidebar-foreground/70"}`}>Admin</button>
            <button onClick={() => onSwitch("investor")} className={`text-xs py-1.5 rounded ${viewMode === "investor" ? "bg-primary text-primary-foreground font-medium" : "text-sidebar-foreground/70"}`}>Inversor</button>
          </div>
        </div>
      )}
    </aside>
  );
}

function Topbar({ user, onLogout }: { user: string; onLogout: () => void }) {
  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0">
      <div className="text-xs text-muted-foreground font-mono">{new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      <div className="flex items-center gap-3">
        <div className="text-xs text-muted-foreground">{user}</div>
        <button onClick={onLogout} className="text-xs px-3 py-1.5 rounded-md border hover:bg-accent transition">Cerrar sesión</button>
      </div>
    </header>
  );
}
