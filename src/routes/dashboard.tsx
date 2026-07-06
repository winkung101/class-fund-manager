import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useMyRole, useSession, usePresidentAvailable } from "@/hooks/use-auth";
import type { RequisitionStatus } from "@/lib/status";
import { formatDateTH, formatTHB, ROLE_LABEL_TH } from "@/lib/status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PlusCircle, Eye, AlertCircle, CheckCircle2, Wallet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <AuthGuard>
      <AppShell>
        <DashboardPage />
      </AppShell>
    </AuthGuard>
  ),
});

type Req = {
  id: string;
  requester_id: string;
  title: string;
  description: string;
  amount: number;
  bank_account_info: string;
  status: RequisitionStatus;
  created_at: string;
  approved_at: string | null;
};

function DashboardPage() {
  const { userId } = useSession();
  const { data: role, isLoading: roleLoading } = useMyRole(userId);

  if (roleLoading || !role) {
    return <div className="text-muted-foreground">กำลังโหลด...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">แดชบอร์ด</h1>
        <p className="text-sm text-muted-foreground">
          บทบาทของคุณ: <span className="font-medium">{ROLE_LABEL_TH[role]}</span>
        </p>
      </div>
      {role === "student" && <StudentDashboard />}
      {role === "treasurer" && <TreasurerDashboard />}
      {role === "president" && <PresidentDashboard />}
      {role === "vice_president" && <VicePresidentDashboard />}
    </div>
  );
}

function useRequisitions(filter?: { mine?: boolean; status?: RequisitionStatus[] }) {
  const { userId } = useSession();
  return useQuery({
    queryKey: ["requisitions", filter, userId],
    queryFn: async () => {
      let q = supabase
        .from("requisitions")
        .select("*")
        .order("created_at", { ascending: false });
      if (filter?.mine && userId) q = q.eq("requester_id", userId);
      if (filter?.status) q = q.in("status", filter.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Req[];
    },
  });
}

function RequisitionsTable({
  rows,
  loading,
  emptyText,
}: {
  rows: Req[] | undefined;
  loading: boolean;
  emptyText: string;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>หัวข้อ</TableHead>
            <TableHead className="text-right">จำนวนเงิน</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>วันที่สร้าง</TableHead>
            <TableHead className="w-24 text-right">ดู</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                กำลังโหลด...
              </TableCell>
            </TableRow>
          )}
          {!loading && (!rows || rows.length === 0) && (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                {emptyText}
              </TableCell>
            </TableRow>
          )}
          {rows?.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.title}</TableCell>
              <TableCell className="text-right tabular-nums">{formatTHB(r.amount)}</TableCell>
              <TableCell>
                <StatusBadge status={r.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTH(r.created_at)}
              </TableCell>
              <TableCell className="text-right">
                <Link to="/requisitions/$id" params={{ id: r.id }}>
                  <Button size="sm" variant="ghost" className="gap-1">
                    <Eye className="h-4 w-4" />
                  </Button>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "amber" | "emerald" | "red";
}) {
  const toneCls = {
    default: "bg-primary/10 text-primary",
    amber: "bg-amber-100 text-amber-700",
    emerald: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
  }[tone];
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`grid h-11 w-11 place-items-center rounded-lg ${toneCls}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm text-muted-foreground">{title}</div>
          <div className="text-xl font-bold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- STUDENT ---------------- */
function StudentDashboard() {
  const { data, isLoading } = useRequisitions({ mine: true });
  const pending = data?.filter((r) => r.status.startsWith("pending")).length ?? 0;
  const approved = data?.filter((r) => r.status === "approved").length ?? 0;
  const rejected = data?.filter((r) => r.status === "rejected").length ?? 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="กำลังดำเนินการ" value={pending} icon={AlertCircle} tone="amber" />
        <StatCard title="อนุมัติแล้ว" value={approved} icon={CheckCircle2} tone="emerald" />
        <StatCard title="ถูกปฏิเสธ" value={rejected} icon={AlertCircle} tone="red" />
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">คำขอของฉัน</h2>
        <Link to="/requisitions/new">
          <Button className="gap-2">
            <PlusCircle className="h-4 w-4" /> สร้างคำขอเบิกเงิน
          </Button>
        </Link>
      </div>
      <RequisitionsTable rows={data} loading={isLoading} emptyText="ยังไม่มีคำขอ" />
    </div>
  );
}

/* ---------------- TREASURER ---------------- */
function TreasurerDashboard() {
  const pendingQ = useRequisitions({ status: ["pending_treasurer"] });
  const allQ = useRequisitions();
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">รอการตรวจสอบ ({pendingQ.data?.length ?? 0})</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          กดดูรายละเอียดเพื่อตรวจสอบและส่งต่อประธาน
        </p>
        <RequisitionsTable
          rows={pendingQ.data}
          loading={pendingQ.isLoading}
          emptyText="ไม่มีคำขอรอตรวจสอบ"
        />
      </div>
      <div>
        <h2 className="mb-3 text-lg font-semibold">คำขอทั้งหมด</h2>
        <RequisitionsTable
          rows={allQ.data}
          loading={allQ.isLoading}
          emptyText="ยังไม่มีคำขอในระบบ"
        />
      </div>
    </div>
  );
}

/* ---------------- PRESIDENT ---------------- */
function PresidentDashboard() {
  const { userId } = useSession();
  const qc = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const toggle = useMutation({
    mutationFn: async (available: boolean) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_available: available })
        .eq("id", userId!);
      if (error) throw error;
    },
    onSuccess: (_, available) => {
      toast.success(available ? "ตั้งสถานะเป็น 'พร้อมปฏิบัติงาน'" : "ตั้งสถานะเป็น 'ไม่อยู่'");
      qc.invalidateQueries({ queryKey: ["profile", userId] });
      qc.invalidateQueries({ queryKey: ["president-available"] });
    },
    onError: (e: Error) => toast.error("บันทึกไม่สำเร็จ", { description: e.message }),
  });

  const pendingQ = useRequisitions({ status: ["pending_president"] });
  const allQ = useRequisitions();

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">สถานะของประธาน</CardTitle>
          <CardDescription>
            เมื่อเปลี่ยนเป็น "ไม่อยู่" รองประธานจะสามารถอนุมัติแทนได้
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-base">
                {profile?.is_available ? "พร้อมปฏิบัติงาน" : "ไม่อยู่ / มอบหมายรองประธาน"}
              </Label>
              <p className="text-sm text-muted-foreground">
                {profile?.is_available
                  ? "เฉพาะประธานเท่านั้นที่อนุมัติได้"
                  : "รองประธานสามารถอนุมัติแทนได้"}
              </p>
            </div>
            <Switch
              checked={!!profile?.is_available}
              onCheckedChange={(v) => toggle.mutate(v)}
              disabled={toggle.isPending}
            />
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">
          รออนุมัติจากประธาน ({pendingQ.data?.length ?? 0})
        </h2>
        <RequisitionsTable
          rows={pendingQ.data}
          loading={pendingQ.isLoading}
          emptyText="ไม่มีคำขอรออนุมัติ"
        />
      </div>
      <div>
        <h2 className="mb-3 text-lg font-semibold">คำขอทั้งหมด</h2>
        <RequisitionsTable
          rows={allQ.data}
          loading={allQ.isLoading}
          emptyText="ยังไม่มีคำขอในระบบ"
        />
      </div>
    </div>
  );
}

/* ---------------- VICE PRESIDENT ---------------- */
function VicePresidentDashboard() {
  const { data: pres, isLoading: pLoading } = usePresidentAvailable();
  const pendingQ = useRequisitions({ status: ["pending_president"] });
  const allQ = useRequisitions();

  if (pLoading) return <div className="text-muted-foreground">กำลังโหลด...</div>;

  if (pres?.available) {
    return (
      <Alert>
        <Wallet className="h-4 w-4" />
        <AlertDescription>
          ขณะนี้ประธานพร้อมปฏิบัติงาน คุณจะสามารถอนุมัติได้เมื่อประธานตั้งสถานะเป็น "ไม่อยู่"
          <div className="mt-4">
            <h3 className="mb-2 text-base font-semibold text-foreground">คำขอทั้งหมด (อ่านอย่างเดียว)</h3>
            <RequisitionsTable
              rows={allQ.data}
              loading={allQ.isLoading}
              emptyText="ยังไม่มีคำขอ"
            />
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertDescription>
          ประธานตั้งสถานะเป็น "ไม่อยู่" — คุณสามารถอนุมัติคำขอแทนได้
        </AlertDescription>
      </Alert>
      <div>
        <h2 className="mb-3 text-lg font-semibold">
          รออนุมัติ ({pendingQ.data?.length ?? 0})
        </h2>
        <RequisitionsTable
          rows={pendingQ.data}
          loading={pendingQ.isLoading}
          emptyText="ไม่มีคำขอรออนุมัติ"
        />
      </div>
      <div>
        <h2 className="mb-3 text-lg font-semibold">คำขอทั้งหมด</h2>
        <RequisitionsTable
          rows={allQ.data}
          loading={allQ.isLoading}
          emptyText="ยังไม่มีคำขอ"
        />
      </div>
    </div>
  );
}
