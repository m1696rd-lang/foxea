import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "investor";

export interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  isAdmin: boolean;
  isInvestor: boolean;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session?.user) { setRoles([]); setLoading(false); return; }
    setLoading(true);
    supabase.from("user_roles").select("role").eq("user_id", session.user.id).then(({ data }) => {
      setRoles((data ?? []).map((r) => r.role as AppRole));
      setLoading(false);
    });
  }, [session?.user?.id]);

  return {
    loading,
    session,
    user: session?.user ?? null,
    roles,
    isAdmin: roles.includes("admin"),
    isInvestor: roles.includes("investor"),
  };
}

// View mode for Genesis Admin toggle
const VIEW_MODE_KEY = "mrd_view_mode";
export type ViewMode = "admin" | "investor";

export function getViewMode(): ViewMode {
  if (typeof window === "undefined") return "admin";
  return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || "admin";
}
export function setViewMode(mode: ViewMode) {
  localStorage.setItem(VIEW_MODE_KEY, mode);
  window.dispatchEvent(new Event("mrd-view-mode-change"));
}
export function useViewMode(): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>("admin");
  useEffect(() => {
    setMode(getViewMode());
    const h = () => setMode(getViewMode());
    window.addEventListener("mrd-view-mode-change", h);
    return () => window.removeEventListener("mrd-view-mode-change", h);
  }, []);
  return [mode, (m) => setViewMode(m)];
}
