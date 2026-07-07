import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/AppShell";
import { useMyRole, useSession, type AppRole } from "@/hooks/use-auth";
import { ROLE_LABEL_TH } from "@/lib/status";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/users")({
  component: () => (
    <AuthGuard>
      <AppShell>
        <UsersPage />
      </AppShell>
    </AuthGuard>
  ),
});

const ALL_ROLES: AppRole[] = ["student", "treasurer", "vice_president", "president"];

function UsersPage() {
  const { userId } = useSession();
  const { data: myRole, isLoading: roleLoading } = useMyRole(userId);
  const qc = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ["users-with-roles"],
    enabled: myRole === "president",
    queryFn: async () => {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, created_at").order("created_at"),
        supabase.from("user_roles").select("user_id, role, created_at"),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;

      const priority: AppRole[] = ["president", "vice_president", "treasurer", "student"];
      const byUser = new Map<string, AppRole>();
      for (const r of roles ?? []) {
        const existing = byUser.get(r.user_id);
        const cur = r.role as AppRole;
        if (!existing || priority.indexOf(cur) < priority.indexOf(existing)) {
          byUser.set(r.user_id, cur);
        }
      }
      return (profiles ?? []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        role: (byUser.get(p.id) ?? "student") as AppRole,
      }));
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ targetId, role }: { targetId: string; role: AppRole }) => {
      // Replace all roles for the user with the newly chosen role.
      const { error: delErr } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", targetId);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase
        .from("user_roles")
        .insert({ user_id: targetId, role });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      toast.success("อัปเดตบทบาทเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["users-with-roles"] });
      qc.invalidateQueries({ queryKey: ["my-role"] });
      qc.invalidateQueries({ queryKey: ["president-available"] });
    },
    onError: (e: Error) => toast.error("อัปเดตไม่สำเร็จ", { description: e.message }),
  });

  if (roleLoading) {
    return <div className="text-muted-foreground">กำลังโหลด...</div>;
  }

  if (myRole !== "president") {
    return (
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>
          หน้านี้สำหรับประธานชั้นปีเท่านั้น
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">จัดการผู้ใช้และบทบาท</h1>
        <p className="text-sm text-muted-foreground">
          ประธานชั้นปีสามารถกำหนดบทบาทให้ผู้ใช้แต่ละคนได้โดยตรง
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อ - นามสกุล</TableHead>
              <TableHead>บทบาทปัจจุบัน</TableHead>
              <TableHead className="w-64">เปลี่ยนบทบาท</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  กำลังโหลด...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (!users || users.length === 0) && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  ยังไม่มีผู้ใช้ในระบบ
                </TableCell>
              </TableRow>
            )}
            {users?.map((u) => {
              const isSelf = u.id === userId;
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.full_name}
                    {isSelf && (
                      <span className="ml-2 text-xs text-muted-foreground">(คุณ)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {ROLE_LABEL_TH[u.role]}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={u.role}
                      disabled={isSelf || setRole.isPending}
                      onValueChange={(v) =>
                        setRole.mutate({ targetId: u.id, role: v as AppRole })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABEL_TH[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        หมายเหตุ: เพื่อป้องกันการล็อกสิทธิ์ตนเองออก ประธานไม่สามารถเปลี่ยนบทบาทของตัวเองได้
      </p>
    </div>
  );
}
