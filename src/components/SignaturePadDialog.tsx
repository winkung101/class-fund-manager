import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eraser } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onConfirm: (signatureDataUrl: string) => Promise<void> | void;
  confirmLabel?: string;
}

export function SignaturePadDialog({ open, onOpenChange, title, description, onConfirm, confirmLabel = 'ยืนยันการเซ็น' }: Props) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [saving, setSaving] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

  const handleClear = () => {
    sigRef.current?.clear();
    setIsEmpty(true);
  };

  const handleConfirm = async () => {
    if (!sigRef.current || sigRef.current.isEmpty()) return;
    setSaving(true);
    try {
      const dataUrl = sigRef.current.getCanvas().toDataURL('image/png');
      await onConfirm(dataUrl);
      sigRef.current.clear();
      setIsEmpty(true);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="rounded-lg border border-dashed border-gray-300 bg-white">
          <SignatureCanvas
            ref={sigRef}
            penColor="#111827"
            canvasProps={{
              width: 480,
              height: 200,
              className: 'w-full h-[200px] rounded-lg touch-none',
            }}
            onEnd={() => setIsEmpty(false)}
          />
        </div>
        <p className="text-xs text-gray-500">เซ็นชื่อในกรอบด้านบนด้วยเมาส์หรือนิ้ว</p>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={handleClear} className="gap-2">
            <Eraser className="w-4 h-4" /> ล้าง
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={saving || isEmpty}>
              {saving ? 'กำลังบันทึก...' : confirmLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
