import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/requisitions/new")({
  component: () => (
    <AuthGuard>
      <AppShell>
        <NewRequisition />
      </AppShell>
    </AuthGuard>
  ),
});

const schema = z.object({
  title: z.string().trim().min(1, "กรุณากรอกหัวข้อ").max(200),
  description: z.string().trim().min(1, "กรุณากรอกรายละเอียด").max(2000),
  amount: z.number().positive("จำนวนเงินต้องมากกว่า 0"),
  bank_account_info: z.string().trim().min(1, "กรุณากรอกบัญชีธนาคาร").max(500),
});

function NewRequisition() {
  const { userId } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [bank, setBank] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse({
        title,
        description,
        amount: parseFloat(amount),
        bank_account_info: bank,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0].message);
      }
      const { data, error } = await supabase
        .from("requisitions")
        .insert({
          requester_id: userId!,
          ...parsed.data,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      toast.success("ส่งคำขอสำเร็จ", { description: "รอเหรัญญิกตรวจสอบ" });
      qc.invalidateQueries({ queryKey: ["requisitions"] });
      navigate({ to: "/requisitions/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error("บันทึกไม่สำเร็จ", { description: e.message }),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">สร้างคำขอเบิกเงิน</h1>
        <p className="text-sm text-muted-foreground">
          กรอกรายละเอียด คำขอจะถูกส่งไปยังเหรัญญิกเพื่อตรวจสอบ
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>รายละเอียดคำขอ</CardTitle>
          <CardDescription>กรุณากรอกข้อมูลให้ครบถ้วน</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="title">หัวข้อ / วัตถุประสงค์</Label>
              <Input
                id="title"
                required
                maxLength={200}
                placeholder="เช่น ค่าอุปกรณ์กิจกรรมรับน้อง"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">รายละเอียด</Label>
              <Textarea
                id="description"
                required
                maxLength={2000}
                rows={5}
                placeholder="อธิบายรายการค่าใช้จ่ายและเหตุผลในการเบิก"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">จำนวนเงิน (บาท)</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank">บัญชีธนาคารสำหรับรับเงิน</Label>
              <Textarea
                id="bank"
                required
                maxLength={500}
                rows={3}
                placeholder={"เช่น\nธนาคาร: กสิกรไทย\nชื่อบัญชี: สมชาย ใจดี\nเลขบัญชี: 123-4-56789-0"}
                value={bank}
                onChange={(e) => setBank(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ to: "/dashboard" })}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "กำลังส่ง..." : "ส่งคำขอ"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
