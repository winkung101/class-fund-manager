import { Navigate } from "@tanstack/react-router";
import { useSession } from "@/hooks/use-auth";
import type { ReactNode } from "react";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        กำลังโหลด...
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}
