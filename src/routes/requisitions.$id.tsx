import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Printer, 
  User, 
  Calendar, 
  Banknote, 
  CheckCircle2, 
  Circle,
  XCircle,
  PenLine,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { SignaturePadDialog } from '@/components/SignaturePadDialog';

export const Route = createFileRoute('/requisitions/$id')({
  component: RequisitionDetail,
});

const formatThaiDateTime = (dateString?: string | null) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date) + ' น.';
};

function RequisitionDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [sigOpen, setSigOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const { data: userRoleData } = useQuery({
    queryKey: ['my-role-detail', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      if (error) throw error;
      const roles = (data ?? []).map((r) => r.role as string);
      const priority = ['president', 'vice_president', 'treasurer', 'student'];
      for (const p of priority) if (roles.includes(p)) return p;
      return 'student';
    },
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // ประธานชั้นปีปัจจุบัน (ดึงจาก user_roles + profiles)
  const { data: presidentInfo } = useQuery({
    queryKey: ['current-president'],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'president')
        .limit(1);
      if (error) throw error;
      const pid = roles?.[0]?.user_id;
      if (!pid) return null;
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', pid)
        .single();
      return { id: pid, full_name: prof?.full_name ?? null };
    },
    staleTime: 60_000,
  });

  const { data: requisitionData, isLoading, isError, error: queryError } = useQuery({
    queryKey: ['requisition', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('requisitions')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;

      const req = data as any;
      const userIds = Array.from(new Set([
        req.requester_id, req.vp_1_id, req.vp_2_id, req.approved_by, req.treasurer_id,
      ].filter(Boolean)));
      let profiles: any[] = [];
      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        if (profileData) profiles = profileData;
      }
      const getName = (uid: any) => profiles.find(p => p.id === uid)?.full_name || null;

      return {
        ...req,
        requester: { full_name: getName(req.requester_id) },
        vp1: { full_name: getName(req.vp_1_id) },
        vp2: { full_name: getName(req.vp_2_id) },
        treasurer: { full_name: getName(req.treasurer_id) },
        president: { full_name: getName(req.approved_by) },
      };
    },
  });

  const requisition = requisitionData as any;
  const userRole = userRoleData;

  const isVp1AlreadyApproved = userRole === 'vice_president' && requisition?.vp_1_id === user?.id;
  const isWaitingForVp2 = requisition?.vp_1_id && !requisition?.vp_2_id;

  const handleApproveWithSignature = async (signatureDataUrl: string) => {
    try {
      const isVP = userRole === 'vice_president';
      const isTreasurer = userRole === 'treasurer';
      const now = new Date().toISOString();

      if (isTreasurer && requisition?.status === 'pending_treasurer') {
        const { error } = await supabase
          .from('requisitions')
          .update({
            status: 'pending_president',
            treasurer_id: user?.id,
            treasurer_signature: signatureDataUrl,
            treasurer_approved_at: now,
          } as any)
          .eq('id', id);
        if (error) throw error;
        toast.success('เหรัญญิกตรวจสอบและเซ็นเรียบร้อย ส่งต่อรองประธาน');
      } else if (isVP && requisition?.status === 'pending_president') {
        if (!requisition?.vp_1_id) {
          const { error } = await supabase
            .from('requisitions')
            .update({
              vp_1_id: user?.id,
              vp_1_signature: signatureDataUrl,
              vp_1_approved_at: now,
            } as any)
            .eq('id', id);
          if (error) throw error;
          toast.success('บันทึกลายเซ็นรองประธานคนที่ 1 แล้ว รอรองประธานคนที่ 2');
        } else if (requisition.vp_1_id === user?.id) {
          toast.error('คุณเซ็นในฐานะรองประธานคนที่ 1 แล้ว');
          return;
        } else if (!requisition?.vp_2_id) {
          const { error } = await supabase
            .from('requisitions')
            .update({
              vp_2_id: user?.id,
              vp_2_signature: signatureDataUrl,
              vp_2_approved_at: now,
              status: 'approved',
              approved_at: now,
            } as any)
            .eq('id', id);
          if (error) throw error;
          toast.success('อนุมัติใบเบิกเงินเสร็จสมบูรณ์');
        }
      } else {
        toast.error('คุณไม่มีสิทธิ์อนุมัติในขั้นตอนนี้');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['requisition', id] });
    } catch (error: any) {
      toast.error(error.message || 'เกิดข้อผิดพลาดในการอนุมัติ');
    }
  };

  const handleReject = async () => {
    const reason = window.prompt('กรุณาระบุเหตุผลที่ไม่อนุมัติ:');
    if (reason === null) return;
    try {
      const { error } = await supabase.from('requisitions').update({ status: 'rejected', reject_reason: reason || 'ไม่ระบุเหตุผล' } as any).eq('id', id);
      if (error) throw error;
      toast.success('บันทึกการไม่อนุมัติสำเร็จ');
      queryClient.invalidateQueries({ queryKey: ['requisition', id] });
    } catch (error: any) {
      toast.error(error.message || 'เกิดข้อผิดพลาดในการปฏิเสธ');
    }
  };

  if (isLoading) return <div className="p-8 text-center">กำลังโหลดข้อมูล...</div>;
  if (isError) return <div className="p-8 text-center text-red-500">เกิดข้อผิดพลาดในการโหลด: {(queryError as any)?.message}</div>;
  if (!requisition) return <div className="p-8 text-center text-red-500">ไม่พบข้อมูลใบเบิกเงิน</div>;

  const shortId = requisition.id.split('-')[0].toUpperCase();

  // ปุ่มเซ็น: เหรัญญิก (pending_treasurer) หรือ VP (pending_president และยังไม่ได้เซ็น)
  const canTreasurerSign = userRole === 'treasurer' && requisition.status === 'pending_treasurer';
  const canVpSign =
    userRole === 'vice_president' &&
    requisition.status === 'pending_president' &&
    !(isVp1AlreadyApproved && isWaitingForVp2);

  const signDialogTitle = canTreasurerSign
    ? 'เซ็นรับรอง (เหรัญญิก)'
    : requisition.vp_1_id
      ? 'เซ็นอนุมัติ (รองประธานคนที่ 2)'
      : 'เซ็นอนุมัติ (รองประธานคนที่ 1)';

  return (
    <div className="container mx-auto p-4 max-w-5xl bg-gray-50/50 min-h-screen">
      
      <div className="flex justify-between items-center mb-6 print:hidden">
        <Button variant="ghost" onClick={() => window.history.back()} className="hover:bg-gray-200">
          <ArrowLeft className="w-4 h-4 mr-2" /> ย้อนกลับ
        </Button>
        {requisition.status === 'approved' && (
          <Button onClick={() => window.print()} variant="outline" className="gap-2 bg-white shadow-sm">
            <Printer className="w-4 h-4" /> พิมพ์ / ดาวน์โหลด PDF
          </Button>
        )}
      </div>

      <div className="space-y-6 print:hidden">
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">{requisition.title}</h1>
              <p className="text-gray-500 text-sm">รหัสคำขอ: {shortId}</p>
            </div>
            <div>
              {requisition.status === 'pending_treasurer' && <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">รอเหรัญญิกตรวจสอบ</span>}
              {requisition.status === 'pending_president' && <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200">รอรองประธานอนุมัติ</span>}
              {requisition.status === 'approved' && <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-200">อนุมัติแล้ว</span>}
              {requisition.status === 'rejected' && <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium bg-red-100 text-red-800 border border-red-200">ไม่อนุมัติ</span>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="border border-gray-200 rounded-lg p-4 flex gap-3 items-start">
              <User className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500 mb-0.5">ผู้ขอเบิก</p>
                <p className="font-medium text-gray-900">{requisition.requester?.full_name || 'ไม่ระบุชื่อ'}</p>
              </div>
            </div>
            <div className="border border-gray-200 rounded-lg p-4 flex gap-3 items-start">
              <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500 mb-0.5">วันที่สร้าง</p>
                <p className="font-medium text-gray-900">{formatThaiDateTime(requisition.created_at)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="border border-gray-200 rounded-lg p-4 flex gap-3 items-start">
              <Banknote className="w-5 h-5 text-gray-400 mt-1" />
              <div>
                <p className="text-sm text-gray-500 mb-0.5">จำนวนเงิน</p>
                <p className="font-bold text-xl text-gray-900">฿{Number(requisition.amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1.5">รายละเอียด</p>
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50 text-gray-800 min-h-[80px] whitespace-pre-line">
                {requisition.description}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1.5">บัญชีธนาคาร</p>
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50 text-gray-800 min-h-[80px] whitespace-pre-line">
                {requisition.bank_account_info}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 md:p-8">
          <h2 className="text-lg font-bold text-gray-900 mb-6">ขั้นตอนการดำเนินงาน</h2>
          
          <div className="relative pl-8 space-y-8">
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-200"></div>

            <div className="relative">
              <div className="absolute -left-[35px] top-0.5 bg-white">
                <CheckCircle2 className="w-6 h-6 text-green-500 bg-white" />
              </div>
              <div>
                <p className="font-medium text-gray-900">ส่งคำขอ</p>
                <p className="text-sm text-gray-500 mt-1">
                  {requisition.requester?.full_name} • {formatThaiDateTime(requisition.created_at)}
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-[35px] top-0.5 bg-white">
                {requisition.status === 'pending_treasurer' ? (
                   <Circle className="w-6 h-6 text-gray-300 fill-white" />
                ) : requisition.status === 'rejected' && !requisition.vp_1_id && !requisition.approved_by ? (
                   <XCircle className="w-6 h-6 text-red-500 bg-white" />
                ) : (
                   <CheckCircle2 className="w-6 h-6 text-green-500 bg-white" />
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900">เหรัญญิกตรวจสอบ</p>
                {requisition.status === 'pending_treasurer' ? (
                  <p className="text-sm text-gray-400 mt-1">รอการเซ็นรับรอง</p>
                ) : requisition.treasurer_approved_at ? (
                  <p className="text-sm text-gray-500 mt-1">
                    {requisition.treasurer?.full_name} • {formatThaiDateTime(requisition.treasurer_approved_at)}
                  </p>
                ) : requisition.status === 'rejected' ? (
                  <p className="text-sm text-red-500 mt-1">ไม่อนุมัติ: {requisition.reject_reason}</p>
                ) : (
                  <p className="text-sm text-gray-500 mt-1">ผ่านการตรวจสอบแล้ว</p>
                )}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-[35px] top-0.5 bg-white">
                {requisition.status === 'approved' ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500 bg-white" />
                ) : requisition.status === 'rejected' && (requisition.vp_1_id || requisition.approved_by) ? (
                  <XCircle className="w-6 h-6 text-red-500 bg-white" />
                ) : (
                  <Circle className="w-6 h-6 text-gray-300 fill-white" />
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900">รองประธานอนุมัติ (2 คน)</p>
                {requisition.status === 'approved' ? (
                  <p className="text-sm text-gray-500 mt-1">อนุมัติครบเมื่อ {formatThaiDateTime(requisition.approved_at)}</p>
                ) : requisition.status === 'rejected' ? (
                  <p className="text-sm text-red-500 mt-1">ไม่อนุมัติ: {requisition.reject_reason}</p>
                ) : isWaitingForVp2 ? (
                  <p className="text-sm text-yellow-600 mt-1">รอรองประธานคนที่ 2 (คนที่ 1 เซ็นแล้ว)</p>
                ) : (
                  <p className="text-sm text-gray-400 mt-1">- - -</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100">
            {canTreasurerSign ? (
              <div className="flex flex-col sm:flex-row gap-4">
                <Button onClick={() => setSigOpen(true)} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white shadow-sm gap-2">
                  <PenLine className="w-4 h-4" /> เซ็นรับรอง (เหรัญญิก)
                </Button>
                <Button onClick={handleReject} variant="outline" className="w-full sm:w-auto border-red-200 text-red-600 hover:bg-red-50">
                  ไม่อนุมัติ
                </Button>
              </div>
            ) : userRole === 'vice_president' && requisition.status === 'pending_president' ? (
              <div className="flex flex-col sm:flex-row gap-4">
                {isVp1AlreadyApproved && isWaitingForVp2 ? (
                  <Button disabled className="w-full sm:w-auto bg-gray-300 text-gray-600 cursor-not-allowed">
                    รอรองประธานคนที่ 2 อนุมัติ
                  </Button>
                ) : (
                  <Button onClick={() => setSigOpen(true)} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white shadow-sm gap-2">
                    <PenLine className="w-4 h-4" />
                    {requisition.vp_1_id ? 'เซ็นอนุมัติ (รองประธานคนที่ 2)' : 'เซ็นอนุมัติ (รองประธานคนที่ 1)'}
                  </Button>
                )}
                <Button
                  onClick={handleReject}
                  variant="outline"
                  className="w-full sm:w-auto border-red-200 text-red-600 hover:bg-red-50"
                  disabled={isVp1AlreadyApproved && isWaitingForVp2}
                >
                  ไม่อนุมัติ
                </Button>
              </div>
            ) : requisition.status === 'pending_president' ? (
              <div className="text-sm text-gray-500 bg-gray-50 p-4 rounded-lg border border-gray-200 text-center">
                 ⚠️ ต้องได้รับการอนุมัติจาก <b>รองประธานชั้นปี 2 คน</b> (บัญชีของคุณคือ "{userRole || 'ไม่มีสิทธิ์'}")
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ===== Print View ===== */}
      <div className="hidden print:block printable-doc bg-white text-black p-0 m-0">
        <div className="text-center mb-6 border-b border-black pb-4">
          <h1 className="text-2xl font-bold mb-1">ใบเบิกเงินกองทุนชั้นปี</h1>
          <p className="text-sm text-gray-700">รหัสเอกสาร: {shortId}</p>
          {presidentInfo?.full_name && (
            <p className="text-sm text-gray-700 mt-1">
              ประธานชั้นปี: <span className="font-semibold">{presidentInfo.full_name}</span>
            </p>
          )}
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-semibold mb-1">ผู้เบิกเงิน</p>
              <p className="text-lg">{requisition.requester?.full_name || 'ไม่ระบุชื่อ'}</p>
            </div>
            <div>
              <p className="text-sm font-semibold mb-1">สถานะ</p>
              <p className="font-bold text-lg">{requisition.status === 'approved' ? 'อนุมัติแล้ว' : 'ยังไม่อนุมัติ'}</p>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold mb-1">รายการที่ขอเบิก</p>
            <p className="text-lg">{requisition.title}</p>
          </div>
          <div>
            <p className="text-sm font-semibold mb-1">รายละเอียด / เหตุผล</p>
            <p className="pt-1 whitespace-pre-line">{requisition.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-semibold mb-1">จำนวนเงิน (บาท)</p>
              <p className="text-2xl font-bold">฿{Number(requisition.amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
            </div>
            <div>
              <p className="text-sm font-semibold mb-1">ข้อมูลบัญชีรับเงิน</p>
              <p className="whitespace-pre-line">{requisition.bank_account_info}</p>
            </div>
          </div>
        </div>

        {requisition.status === 'approved' && (
          <div className="mt-12 pt-6 border-t border-black">
            <div className="grid grid-cols-3 gap-6 text-center text-sm">
              <SignBlock
                label="ผู้ตรวจสอบ"
                title="( เหรัญญิกชั้นปี )"
                name={requisition.treasurer?.full_name}
                signature={requisition.treasurer_signature}
                signedAt={requisition.treasurer_approved_at}
              />
              <SignBlock
                label="ผู้อนุมัติคนที่ 1"
                title="( รองประธานชั้นปี คนที่ 1 )"
                name={requisition.vp1?.full_name}
                signature={requisition.vp_1_signature}
                signedAt={requisition.vp_1_approved_at}
              />
              <SignBlock
                label="ผู้อนุมัติคนที่ 2"
                title="( รองประธานชั้นปี คนที่ 2 )"
                name={requisition.vp2?.full_name}
                signature={requisition.vp_2_signature}
                signedAt={requisition.vp_2_approved_at}
              />
            </div>

            {presidentInfo?.full_name && (
              <div className="mt-10 flex justify-center">
                <div className="text-center text-sm w-64">
                  <p className="mb-16">รับทราบ</p>
                  <p className="border-t border-black pt-1">{presidentInfo.full_name}</p>
                  <p className="mt-1">( ประธานชั้นปี )</p>
                </div>
              </div>
            )}

            <p className="text-center text-xs text-gray-600 mt-8">
              เอกสารอนุมัติสมบูรณ์เมื่อ {formatThaiDateTime(requisition.approved_at)}
            </p>
          </div>
        )}
      </div>

      <SignaturePadDialog
        open={sigOpen}
        onOpenChange={setSigOpen}
        title={signDialogTitle}
        description="ลายเซ็นนี้จะถูกบันทึกลงในเอกสาร PDF และไม่สามารถแก้ไขได้ภายหลัง"
        onConfirm={handleApproveWithSignature}
      />
    </div>
  );
}

function SignBlock({
  label, title, name, signature, signedAt,
}: {
  label: string;
  title: string;
  name?: string | null;
  signature?: string | null;
  signedAt?: string | null;
}) {
  return (
    <div>
      <p className="mb-2">{label}</p>
      <div className="h-20 flex items-end justify-center">
        {signature ? (
          <img src={signature} alt="signature" className="max-h-20 object-contain" />
        ) : (
          <span className="text-gray-400">.......................................</span>
        )}
      </div>
      <p className="border-t border-black pt-1 font-medium">{name || '.......................................'}</p>
      <p className="mt-1">{title}</p>
      {signedAt && <p className="text-xs text-gray-500 mt-1">{formatThaiDateTime(signedAt)}</p>}
    </div>
  );
}
