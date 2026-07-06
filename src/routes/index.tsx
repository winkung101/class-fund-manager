import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useSession } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { session, loading } = useSession();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        กำลังโหลด...
      </div>
    );
  }
  return <Navigate to={session ? "/dashboard" : "/auth"} replace />;
}
