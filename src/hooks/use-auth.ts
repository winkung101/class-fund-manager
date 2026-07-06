import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "student" | "treasurer" | "president" | "vice_president";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading, userId: session?.user.id ?? null };
}

export function useProfile(userId: string | null) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useMyRole(userId: string | null) {
  return useQuery({
    queryKey: ["my-role", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const roles = (data ?? []).map((r) => r.role as AppRole);
      // Priority: president > vice_president > treasurer > student
      const priority: AppRole[] = ["president", "vice_president", "treasurer", "student"];
      for (const p of priority) if (roles.includes(p)) return p;
      return "student" as AppRole;
    },
  });
}

export function usePresidentAvailable() {
  return useQuery({
    queryKey: ["president-available"],
    queryFn: async () => {
      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "president");
      if (rErr) throw rErr;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return { available: false, presidentId: null as string | null };
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, is_available, created_at")
        .in("id", ids)
        .order("created_at", { ascending: true });
      if (pErr) throw pErr;
      const p = profiles?.[0];
      return { available: !!p?.is_available, presidentId: p?.id ?? null };
    },
  });
}
