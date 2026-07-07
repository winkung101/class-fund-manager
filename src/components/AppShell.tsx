import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Wallet, LayoutDashboard, PlusCircle, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useProfile, useMyRole, useSession } from "@/hooks/use-auth";
import { ROLE_LABEL_TH } from "@/lib/status";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const { userId } = useSession();
  const { data: profile } = useProfile(userId);
  const { data: role } = useMyRole(userId);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">ระบบเบิกเงินชั้นปี</div>
              <div className="text-xs text-muted-foreground leading-tight">
                Class Fund Requisition
              </div>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="gap-2">
                <LayoutDashboard className="h-4 w-4" />
                แดชบอร์ด
              </Button>
            </Link>
            <Link to="/requisitions/new">
              <Button variant="ghost" size="sm" className="gap-2">
                <PlusCircle className="h-4 w-4" />
                สร้างคำขอ
              </Button>
            </Link>
            <div className="mx-2 hidden text-right sm:block">
              <div className="text-sm font-medium">{profile?.full_name ?? "..."}</div>
              <div className="text-xs text-muted-foreground">
                {role ? ROLE_LABEL_TH[role] : "..."}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={signOut} className="gap-2">
              <LogOut className="h-4 w-4" />
              ออกจากระบบ
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
