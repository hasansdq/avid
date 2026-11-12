"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * فیلد تصویر با دو حالت — آدرس (URL) یا آپلود مستقیم از سیستم —
 * همراه با پیش‌نمایش زنده:
 *  • آپلود: فایل به /api/admin/upload ارسال می‌شود و آدرس نسبی
 *    برگشتی در همان فیلد قرار می‌گیرد (برای مدیر).
 *  • آدرس: مسیر داخلی (مثل /images/logo.png) یا آدرس کامل خارجی.
 * اگر تصویر در دسترس نباشد کاشی جایگزین نمایش داده می‌شود.
 *
 * خطای بارگذاری به‌صورت «آدرس خراب» نگه داشته می‌شود تا با تغییر
 * آدرس، پیش‌نمایش خودکار دوباره تلاش کند (بدون نیاز به افکت ریست).
 */

const ACCEPTED_FORMATS = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";

export function ImageUrlField({
  id,
  label,
  value,
  onChange,
  hint,
  previewClassName = "h-24 w-24",
  previewAlt = "پیش‌نمایش تصویر",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  /** اندازه‌ی کانتینر پیش‌نمایش (مثلاً h-24 w-24 یا h-[90px] w-40) */
  previewClassName?: string;
  previewAlt?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trimmed = value.trim();
  const failed = failedSrc !== null && failedSrc === trimmed;

  /** آپلود مستقیم فایل انتخاب‌شده و قرار دادن آدرس آن در فیلد */
  async function handleUpload(file: File | undefined) {
    if (!file || uploading) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("حجم تصویر حداکثر ۴ مگابایت می‌تواند باشد.");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.url) {
        throw new Error(data?.error ?? "خطا در بارگذاری تصویر.");
      }
      onChange(data.url);
      setFailedSrc(null);
      toast.success("تصویر بارگذاری شد");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا در بارگذاری تصویر.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-start gap-3">
        {trimmed ? (
          failed ? (
            <div
              className={`flex items-center justify-center rounded-2xl border border-dashed border-border bg-foreground/[0.02] ${previewClassName}`}
              title="تصویر در دسترس نیست"
            >
              <ImageIcon className="size-5 text-muted-foreground" />
            </div>
          ) : (
            <div
              className={`relative shrink-0 overflow-hidden rounded-2xl border border-border bg-foreground/[0.03] ${previewClassName}`}
            >
              <Image
                src={trimmed}
                alt={previewAlt}
                fill
                sizes="160px"
                className="object-cover"
                onError={() => setFailedSrc(trimmed)}
              />
            </div>
          )
        ) : (
          <div
            className={`flex items-center justify-center rounded-2xl border border-dashed border-border bg-foreground/[0.02] ${previewClassName}`}
            title="بدون تصویر"
          >
            <ImageIcon className="size-5 text-muted-foreground/60" />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              id={id}
              dir="ltr"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="آدرس تصویر یا بارگذاری از سیستم"
              className="text-left"
              autoComplete="off"
            />
            {trimmed ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange("")}
                aria-label={`حذف تصویر ${label}`}
                title="حذف تصویر"
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg text-[0.7rem] font-bold"
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              بارگذاری از سیستم
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FORMATS}
              className="hidden"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                void handleUpload(file);
              }}
            />
          </div>
          {hint ? (
            <p className="text-[0.7rem] leading-5 text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** رندر یک تصویر اختیاری با جایگزین در صورت خطا یا خالی بودن آدرس */
export function OptionalImage({
  src,
  alt,
  fallback,
  sizes = "64px",
  className = "",
  imageClassName = "",
}: {
  src: string;
  alt: string;
  fallback: React.ReactNode;
  sizes?: string;
  className?: string;
  imageClassName?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const trimmed = src.trim();
  if (!trimmed || failedSrc === trimmed) return <>{fallback}</>;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <Image
        src={trimmed}
        alt={alt}
        fill
        sizes={sizes}
        className={`object-cover ${imageClassName}`}
        onError={() => setFailedSrc(trimmed)}
      />
    </div>
  );
}
