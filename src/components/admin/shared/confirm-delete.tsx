"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * دیالوگ تأیید حذف — فرزند (children) به عنوان دکمه‌ی راه‌انداز عمل می‌کند
 * تا بتوان آیکن‌باتن‌های مختلف در جدول‌ها به آن سپرد.
 */
export function ConfirmDelete({
  title,
  description,
  confirmLabel = "بله، حذف شود",
  onConfirm,
  children,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => Promise<unknown> | unknown;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    let success = true;
    try {
      await onConfirm();
    } catch {
      success = false;
    } finally {
      setPending(false);
    }
    if (success) setOpen(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent dir="rtl" className="max-w-sm rounded-2xl">
        <AlertDialogHeader className="text-right sm:text-right">
          <AlertDialogTitle className="text-base">{title}</AlertDialogTitle>
          <AlertDialogDescription className="leading-6">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <AlertDialogAction
            dir="rtl"
            onClick={handleConfirm}
            disabled={pending}
            className="bg-destructive/90 font-bold text-white hover:bg-destructive"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </AlertDialogAction>
          <AlertDialogCancel dir="rtl" disabled={pending}>
            انصراف
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
