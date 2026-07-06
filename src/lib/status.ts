export type RequisitionStatus =
  | "pending_treasurer"
  | "pending_president"
  | "approved"
  | "rejected";

export const STATUS_LABEL: Record<RequisitionStatus, string> = {
  pending_treasurer: "รอเหรัญญิกตรวจสอบ",
  pending_president: "รอประธานอนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ถูกปฏิเสธ",
};

export const STATUS_CLASS: Record<RequisitionStatus, string> = {
  pending_treasurer: "bg-amber-100 text-amber-800 border-amber-300",
  pending_president: "bg-blue-100 text-blue-800 border-blue-300",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
};

export const ROLE_LABEL_TH: Record<string, string> = {
  student: "นักศึกษา",
  treasurer: "เหรัญญิก",
  president: "ประธานชั้นปี",
  vice_president: "รองประธานชั้นปี",
};

export function formatTHB(n: number | string) {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(num);
}

export function formatDateTH(d: string | Date | null | undefined) {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}
