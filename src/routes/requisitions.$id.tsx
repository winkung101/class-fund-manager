import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useMyRole, useSession, usePresidentAvailable } from "@/hooks/use-auth";
import type { RequisitionStatus } from "@/lib/status";
import { formatDateTH, formatTHB, ROLE_LABEL_TH } from "@/lib/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Printer,
  FileText,
  User,
  Building2,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/requisitions/$id")({
  component: () => (
    <AuthGuard>
      <AppShell>
        <RequisitionDetail />
      </AppShell>
    </AuthGuard>
  ),
});

type Requisition = {
  id: string;
  requester_id: string;
  title: string;
  description: string;
  amount: number;
  bank_account_info: string;
  status: RequisitionStatus;
  treasurer_notes: string | null;
  reject_reason: string | null;
  treasurer_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

type Profile = { id: string; full_name: string };

function RequisitionDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { userId } = useSession();
  const { data: role } = useMyRole(userId);
  const { data: presidentAvail } = usePresidentAvailable();
  const qc = useQueryClient();

  const reqQ = useQuery({
    queryKey: ["requisition", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requisitions")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Requisition | null;
    },
  });

  const req = reqQ.data;
  const relatedIds = useMemo(() => {
    const ids = new Set<string>();
    if (req?.requester_id) ids.add(req.requester_id);
    if (req?.treasurer_id) ids.add(req.treasurer_id);
    if (req?.approved_by) ids.add(req.approved_by);
    return Array.from(ids);
  }, [req]);

  const profilesQ = useQuery({
    queryKey: ["profiles-by-ids", relatedIds],
    enabled: relatedIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", relatedIds);
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const nameOf = (uid: string | null | undefined) =>
    (uid && profilesQ.data?.find((p) => p.id === uid)?.full_name) || "-";

  const [notes, setNotes] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["requisition", id] });
    qc.invalidateQueries({ queryKey: ["requisitions"] });
  };

  const verifyByTreasurer = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("requisitions")
        .update({
          status: "pending_president",
          treasurer_notes: notes.trim() || null,
          treasurer_id: userId,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ส่งต่อประธานเรียบร้อย");
      invalidate();
    },
    onError: (e: Error) => toast.error("ไม่สำเร็จ", { description: e.message }),
  });

  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("requisitions")
        .update({
          status: "approved",
          approved_by: userId,
          approved_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("อนุมัติคำขอเรียบร้อย");
      invalidate();
    },
    onError: (e: Error) => toast.error("ไม่สำเร็จ", { description: e.message }),
  });

  const reject = useMutation({
    mutationFn: async () => {
      if (!rejectReason.trim()) throw new Error("กรุณาระบุเหตุผล");
      const { error } = await supabase
        .from("requisitions")
        .update({
          status: "rejected",
          reject_reason: rejectReason.trim(),
          ...(role === "treasurer"
            ? { treasurer_id: userId }
            : { approved_by: userId, approved_at: new Date().toISOString() }),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("บันทึกการปฏิเสธเรียบร้อย");
      setRejectOpen(false);
      setRejectReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error("ไม่สำเร็จ", { description: e.message }),
  });

  if (reqQ.isLoading) return <div className="text-muted-foreground">กำลังโหลด...</div>;
  if (!req)
    return (
      <div className="text-center">
        <p className="text-muted-foreground">ไม่พบคำขอนี้</p>
        <Button variant="link" onClick={() => navigate({ to: "/dashboard" })}>
          กลับหน้าแดชบอร์ด
        </Button>
      </div>
    );

  const canTreasurerAct = role === "treasurer" && req.status === "pending_treasurer";
  const canPresidentAct = role === "president" && req.status === "pending_president";
  const canVPAct =
    role === "vice_president" &&
    req.status === "pending_president" &&
    presidentAvail?.available === false;

  return (
    <>
      {/* Screen view */}
      <div className="space-y-6 print:hidden">
        <div className="flex items-center justify-between">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> กลับ
            </Button>
          </Link>
          {req.status === "approved" && (
            <Button className="gap-2" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> ดาวน์โหลดใบเบิกเงิน PDF
            </Button>
          )}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">{req.title}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                รหัสคำขอ: {req.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
            <StatusBadge status={req.status} />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow icon={User} label="ผู้ขอเบิก" value={nameOf(req.requester_id)} />
              <InfoRow
                icon={Calendar}
                label="วันที่สร้าง"
                value={formatDateTH(req.created_at)}
              />
              <InfoRow
                icon={FileText}
                label="จำนวนเงิน"
                value={<span className="text-lg font-bold">{formatTHB(req.amount)}</span>}
              />
              {req.approved_at && (
                <InfoRow
                  icon={CheckCircle2}
                  label="วันที่อนุมัติ"
                  value={formatDateTH(req.approved_at)}
                />
              )}
            </div>
            <Section title="รายละเอียด">
              <p className="whitespace-pre-wrap text-sm">{req.description}</p>
            </Section>
            <Section title="บัญชีธนาคาร">
              <p className="whitespace-pre-wrap text-sm">{req.bank_account_info}</p>
            </Section>
            {req.treasurer_notes && (
              <Section title={`บันทึกจากเหรัญญิก (${nameOf(req.treasurer_id)})`}>
                <p className="whitespace-pre-wrap text-sm">{req.treasurer_notes}</p>
              </Section>
            )}
            {req.reject_reason && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="mb-1 text-sm font-semibold text-red-800">เหตุผลที่ปฏิเสธ</div>
                <p className="whitespace-pre-wrap text-sm text-red-800">{req.reject_reason}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Timeline req={req} nameOf={nameOf} />

        {canTreasurerAct && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">การดำเนินการของเหรัญญิก</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="notes">บันทึกเพิ่มเติม (ไม่บังคับ)</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="เช่น ตรวจสอบเอกสารครบถ้วน"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setRejectOpen(true)}
                  className="gap-2 text-red-600 hover:text-red-600"
                >
                  <XCircle className="h-4 w-4" /> ปฏิเสธ
                </Button>
                <Button
                  onClick={() => verifyByTreasurer.mutate()}
                  disabled={verifyByTreasurer.isPending}
                  className="gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {verifyByTreasurer.isPending ? "กำลังบันทึก..." : "ตรวจสอบและส่งต่อประธาน"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {(canPresidentAct || canVPAct) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                การดำเนินการของ{role === "president" ? "ประธาน" : "รองประธาน"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setRejectOpen(true)}
                  className="gap-2 text-red-600 hover:text-red-600"
                >
                  <XCircle className="h-4 w-4" /> ปฏิเสธ
                </Button>
                <Button
                  onClick={() => approve.mutate()}
                  disabled={approve.isPending}
                  className="gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {approve.isPending ? "กำลังอนุมัติ..." : "อนุมัติคำขอ"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {role === "vice_president" &&
          req.status === "pending_president" &&
          presidentAvail?.available && (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                ขณะนี้ประธานพร้อมปฏิบัติงาน คุณจะสามารถอนุมัติได้เมื่อประธานตั้งสถานะเป็น "ไม่อยู่"
              </CardContent>
            </Card>
          )}
      </div>

      {/* Print / PDF view */}
      <PrintableDoc
        req={req}
        requesterName={nameOf(req.requester_id)}
        treasurerName={nameOf(req.treasurer_id)}
        approverName={nameOf(req.approved_by)}
        approverRole={role}
      />

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยืนยันการปฏิเสธคำขอ</DialogTitle>
            <DialogDescription>กรุณาระบุเหตุผลในการปฏิเสธ</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="ระบุเหตุผล..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              onClick={() => reject.mutate()}
              disabled={reject.isPending}
            >
              {reject.isPending ? "กำลังบันทึก..." : "ยืนยันปฏิเสธ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="rounded-lg border bg-card p-4">{children}</div>
    </div>
  );
}

function Timeline({
  req,
  nameOf,
}: {
  req: Requisition;
  nameOf: (id: string | null | undefined) => string;
}) {
  const steps = [
    {
      key: "created",
      label: "ส่งคำขอ",
      by: nameOf(req.requester_id),
      at: req.created_at,
      done: true,
    },
    {
      key: "treasurer",
      label: "เหรัญญิกตรวจสอบ",
      by: req.treasurer_id ? nameOf(req.treasurer_id) : "-",
      at: req.treasurer_id ? req.updated_at : null,
      done:
        req.status === "pending_president" ||
        req.status === "approved" ||
        (req.status === "rejected" && !!req.treasurer_id && !req.approved_by),
    },
    {
      key: "president",
      label: "ประธาน/รองประธานอนุมัติ",
      by: req.approved_by ? nameOf(req.approved_by) : "-",
      at: req.approved_at,
      done: req.status === "approved" || (req.status === "rejected" && !!req.approved_by),
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ขั้นตอนการดำเนินงาน</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-6 border-l pl-6">
          {steps.map((s) => (
            <li key={s.key} className="relative">
              <span
                className={`absolute -left-[31px] top-0.5 grid h-5 w-5 place-items-center rounded-full border-2 ${
                  s.done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-muted-foreground/40 bg-background"
                }`}
              >
                {s.done ? <CheckCircle2 className="h-3 w-3" /> : null}
              </span>
              <div className="text-sm font-medium">{s.label}</div>
              <div className="text-xs text-muted-foreground">
                {s.by} • {formatDateTH(s.at)}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function PrintableDoc({
  req,
  requesterName,
  treasurerName,
  approverName,
  approverRole,
}: {
  req: Requisition;
  requesterName: string;
  treasurerName: string;
  approverName: string;
  approverRole: string | undefined;
}) {
  return (
    <div className="printable-doc hidden print:block">
      <div className="mx-auto max-w-[720px] p-10 text-black">
        <div className="mb-6 flex items-center justify-between border-b-2 border-black pb-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-8 w-8" />
            <div>
              <div className="text-lg font-bold">ระบบเบิกเงินชั้นปี</div>
              <div className="text-xs">Class Fund Requisition System</div>
            </div>
          </div>
          <div className="text-right text-xs">
            <div>เลขที่คำขอ: {req.id.slice(0, 8).toUpperCase()}</div>
            <div>วันที่: {formatDateTH(req.created_at)}</div>
          </div>
        </div>

        <h1 className="mb-4 text-center text-xl font-bold underline">ใบเบิกเงินชั้นปี</h1>

        <table className="mb-4 w-full text-sm">
          <tbody>
            <tr>
              <td className="w-40 py-1 align-top font-semibold">หัวข้อ:</td>
              <td className="py-1">{req.title}</td>
            </tr>
            <tr>
              <td className="py-1 align-top font-semibold">ผู้ขอเบิก:</td>
              <td className="py-1">{requesterName}</td>
            </tr>
            <tr>
              <td className="py-1 align-top font-semibold">วันที่ยื่นคำขอ:</td>
              <td className="py-1">{formatDateTH(req.created_at)}</td>
            </tr>
            <tr>
              <td className="py-1 align-top font-semibold">จำนวนเงิน:</td>
              <td className="py-1 text-base font-bold">{formatTHB(req.amount)}</td>
            </tr>
            <tr>
              <td className="py-1 align-top font-semibold">รายละเอียด:</td>
              <td className="whitespace-pre-wrap py-1">{req.description}</td>
            </tr>
            <tr>
              <td className="py-1 align-top font-semibold">บัญชีรับเงิน:</td>
              <td className="whitespace-pre-wrap py-1">{req.bank_account_info}</td>
            </tr>
            {req.treasurer_notes && (
              <tr>
                <td className="py-1 align-top font-semibold">บันทึกเหรัญญิก:</td>
                <td className="whitespace-pre-wrap py-1">{req.treasurer_notes}</td>
              </tr>
            )}
            <tr>
              <td className="py-1 align-top font-semibold">วันที่อนุมัติ:</td>
              <td className="py-1">{formatDateTH(req.approved_at)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-16 grid grid-cols-2 gap-8">
          <div className="text-center">
            <div className="mb-1 border-t border-black pt-2 text-sm">
              ({treasurerName || "................."})
            </div>
            <div className="text-sm font-semibold">เหรัญญิก</div>
            <div className="text-xs">ผู้ตรวจสอบ</div>
          </div>
          <div className="text-center">
            <div className="mb-1 border-t border-black pt-2 text-sm">
              ({approverName || "................."})
            </div>
            <div className="text-sm font-semibold">
              {approverRole === "vice_president" ? "รองประธานชั้นปี" : "ประธานชั้นปี"}
            </div>
            <div className="text-xs">
              ผู้อนุมัติ {approverRole ? `(${ROLE_LABEL_TH[approverRole] ?? ""})` : ""}
            </div>
          </div>
        </div>

        <div className="mt-16 text-center text-[10px] text-gray-600">
          เอกสารนี้พิมพ์จากระบบเบิกเงินชั้นปี • {formatDateTH(new Date())}
        </div>
      </div>
    </div>
  );
}
