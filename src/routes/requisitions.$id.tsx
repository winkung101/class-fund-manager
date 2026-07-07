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
  XCircle
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export const Route = createFileRoute('/requisitions/$id')({
  component: RequisitionDetail,
});

// ฟังก์ชันแปลงวันที่เป็นภาษาไทย
const formatThaiDateTime = (dateString?: string) => {
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ดึง Role ของผู้ใช้ปัจจุบันจากตาราง user_roles (แหล่งข้อมูลบทบาทที่แท้จริง)
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

  // ดึงข้อมูลใบเบิกเงิน พร้อมข้อมูลผู้ที่เกี่ยวข้อง
  const { data: requisitionData, isLoading, isError, error: queryError } = useQuery({
    queryKey: ['requisition', id],
    queryFn: async () => {
      // 1. ดึงข้อมูลใบเบิกเงินหลักก่อน
      const { data, error } = await supabase
        .from('requisitions')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error) throw error;
      
      const req = data as any;
      
      // 2. ดึงชื่อแบบ Manual
      const userIds = Array.from(new Set([req.requester_id, req.vp_1_id, req.vp_2_id, req.approved_by].filter(Boolean)));
      let profiles: any[] = [];
      
      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        if (profileData) profiles = profileData;
      }
      
      const getProfileName = (userId: any) => profiles.find(p => p.id === userId)?.full_name || null;

      return {
        ...req,
        requester: { full_name: getProfileName(req.requester_id) },
        vp1: { full_name: getProfileName(req.vp_1_id) },
        vp2: { full_name: getProfileName(req.vp_2_id) },
        president: { full_name: getProfileName(req.approved_by) }
      };
    },
  });

  const requisition = requisitionData as any;
  const userRole = userRoleData;

  const isVp1AlreadyApproved = userRole === 'vice_president' && requisition?.vp_1_id === user?.id;
  const isWaitingForVp2 = requisition?.vp_1_id && !requisition?.vp_2_id;

  const handleApprove = async () => {
    try {
      const isVP = userRole === 'vice_president';
      const isPresident = userRole === 'president';
      const now = new Date().toISOString();

      if (isVP) {
        if (!requisition?.vp_1_id) {
          const { error } = await supabase.from('requisitions').update({ vp_1_id: user?.id } as any).eq('id', id);
          if (error) throw error;
          toast.success('บันทึกการอนุมัติสำเร็จ รอรองประธานคนที่ 2 อนุมัติ');
        } else if (requisition.vp_1_id !== user?.id && !requisition?.vp_2_id) {
          const { error } = await supabase.from('requisitions').update({ vp_2_id: user?.id, status: 'approved', approved_at: now } as any).eq('id', id);
          if (error) throw error;
          toast.success('อนุมัติใบเบิกเงินเสร็จสมบูรณ์');
        }
      } else if (isPresident) {
        const { error } = await supabase.from('requisitions').update({ status: 'approved', approved_by: user?.id, approved_at: now } as any).eq('id', id);
        if (error) throw error;
        toast.success('อนุมัติใบเบิกเงินเสร็จสมบูรณ์');
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

  return (
    <div className="container mx-auto p-4 max-w-5xl bg-gray-50/50 min-h-screen">
      
      {/* ===== Toolbar (Print Hidden) ===== */}
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

      {/* ===== Web View (Print Hidden) ===== */}
      <div className="space-y-6 print:hidden">
        
        {/* Card 1: รายละเอียดคำขอ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">{requisition.title}</h1>
              <p className="text-gray-500 text-sm">รหัสคำขอ: {shortId}</p>
            </div>
            
            {/* Status Badge */}
            <div>
              {requisition.status === 'pending_treasurer' && <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">รอเหรัญญิกตรวจสอบ</span>}
              {requisition.status === 'pending_president' && <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200">รอประธานอนุมัติ</span>}
              {requisition.status === 'approved' && <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-200">อนุมัติแล้ว</span>}
              {requisition.status === 'rejected' && <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium bg-red-100 text-red-800 border border-red-200">ไม่อนุมัติ</span>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* กล่องผู้ขอเบิก */}
            <div className="border border-gray-200 rounded-lg p-4 flex gap-3 items-start">
              <User className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500 mb-0.5">ผู้ขอเบิก</p>
                <p className="font-medium text-gray-900">{requisition.requester?.full_name || 'ไม่ระบุชื่อ'}</p>
              </div>
            </div>

            {/* กล่องวันที่สร้าง */}
            <div className="border border-gray-200 rounded-lg p-4 flex gap-3 items-start">
              <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500 mb-0.5">วันที่สร้าง</p>
                <p className="font-medium text-gray-900">{formatThaiDateTime(requisition.created_at)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* กล่องจำนวนเงิน */}
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

        {/* Card 2: ขั้นตอนการดำเนินงาน (Timeline) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 md:p-8">
          <h2 className="text-lg font-bold text-gray-900 mb-6">ขั้นตอนการดำเนินงาน</h2>
          
          <div className="relative pl-8 space-y-8">
            {/* เส้นแนวตั้ง */}
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-200"></div>

            {/* Step 1: ส่งคำขอ */}
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

            {/* Step 2: เหรัญญิกตรวจสอบ */}
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
                  <p className="text-sm text-gray-400 mt-1">- - -</p>
                ) : requisition.status === 'rejected' && !requisition.vp_1_id && !requisition.approved_by ? (
                  <p className="text-sm text-red-500 mt-1">ไม่อนุมัติ: {requisition.reject_reason}</p>
                ) : (
                  <p className="text-sm text-gray-500 mt-1">ผ่านการตรวจสอบแล้ว</p>
                )}
              </div>
            </div>

            {/* Step 3: ประธาน/รองประธานอนุมัติ */}
            <div className="relative">
              <div className="absolute -left-[35px] top-0.5 bg-white">
                {requisition.status === 'approved' ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500 bg-white" />
                ) : requisition.status === 'rejected' && (requisition.vp_1_id || requisition.approved_by || requisition.status === 'rejected') ? (
                  <XCircle className="w-6 h-6 text-red-500 bg-white" />
                ) : (
                  <Circle className="w-6 h-6 text-gray-300 fill-white" />
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900">ประธาน/รองประธานอนุมัติ</p>
                {requisition.status === 'approved' ? (
                  <p className="text-sm text-gray-500 mt-1">อนุมัติแล้วเมื่อ {formatThaiDateTime(requisition.approved_at)}</p>
                ) : requisition.status === 'rejected' ? (
                  <p className="text-sm text-red-500 mt-1">ไม่อนุมัติ: {requisition.reject_reason}</p>
                ) : isWaitingForVp2 ? (
                  <p className="text-sm text-yellow-600 mt-1">รอรองประธานคนที่ 2 อนุมัติ (คนที่ 1 อนุมัติแล้ว)</p>
                ) : (
                  <p className="text-sm text-gray-400 mt-1">- - -</p>
                )}
              </div>
            </div>

          </div>

          {/* Action Buttons for Approvers */}
          <div className="mt-8 pt-6 border-t border-gray-100">
            {(userRole === 'president' || userRole === 'vice_president') && requisition.status === 'pending_president' ? (
              <div className="flex flex-col sm:flex-row gap-4">
                {isVp1AlreadyApproved && isWaitingForVp2 ? (
                  <Button disabled className="w-full sm:w-auto bg-gray-300 text-gray-600 cursor-not-allowed">
                    รอรองประธานคนที่ 2 อนุมัติ
                  </Button>
                ) : (
                  <Button 
                    onClick={handleApprove} 
                    className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white shadow-sm"
                  >
                    {requisition.vp_1_id ? 'อนุมัติใบเบิกเงิน (คนที่ 2)' : 'อนุมัติใบเบิกเงิน'}
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
                 ⚠️ บัญชีของคุณขณะนี้มีสิทธิ์เป็น <b>"{userRole || 'ไม่มีสิทธิ์'}"</b> จึงไม่สามารถกดอนุมัติได้ (สงวนสิทธิ์เฉพาะประธานและรองประธานชั้นปี)
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ===== Print View (Web Hidden) ===== */}
      <div className="hidden print:block bg-white text-black p-0 m-0">
        <div className="text-center mb-8 border-b border-black pb-6">
          <h1 className="text-2xl font-bold mb-2">ใบเบิกเงินกองทุนชั้นปี</h1>
          <p className="text-gray-600">รหัสเอกสาร: {shortId}</p>
        </div>

        <div className="space-y-6">
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
            <p className="pt-1">{requisition.description}</p>
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
          <div className="mt-20 pt-8 border-t border-black grid grid-cols-2 gap-8 text-center">
            <div>
              <p className="mb-12">ผู้ตรวจสอบ (เหรัญญิก)</p>
              <p>...................................................</p>
              <p className="mt-2 text-sm">( เหรัญญิกชั้นปี )</p>
            </div>
            <div>
              <p className="mb-12">ผู้อนุมัติ</p>
              {requisition.approved_by && (
                <>
                  <p className="font-bold">{requisition.president?.full_name}</p>
                  <p className="mt-2 text-sm">( ประธานชั้นปี )</p>
                </>
              )}
              {requisition.vp_1_id && requisition.vp_2_id && (
                <div className="flex justify-center gap-8 text-sm">
                  <div>
                    <p className="font-bold">{requisition.vp1?.full_name}</p>
                    <p className="mt-1">(รองประธานคนที่ 1)</p>
                  </div>
                  <div>
                    <p className="font-bold">{requisition.vp2?.full_name}</p>
                    <p className="mt-1">(รองประธานคนที่ 2)</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}