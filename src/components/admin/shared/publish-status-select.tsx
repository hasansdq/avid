"use client";

import { Globe, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * انتخاب وضعیت انتشار در فرم‌های ویرایش (دوره/ویدئو/…) —
 * دو حالت صریح:
 *   • منتشر شده → در سایت قابل مشاهده است
 *   • پیش‌نویس   → فقط در پنل مدیر نمایش داده می‌شود
 */
export function PublishStatusSelect({
  id,
  value,
  onChange,
  disabled = false,
  labels,
}: {
  /** شناسه‌ی فرم (id دکمه‌ها از آن ساخته می‌شود) */
  id: string;
  /** وضعیت فعلی: true = منتشر شده، false = پیش‌نویس */
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** برچسب‌های اختیاری برای سایر ماژول‌ها (پیش‌فرض: دوره/محتوا) */
  labels?: { published?: string; draft?: string; title?: string };
}) {
  const publishedLabel = labels?.published ?? "منتشر شده";
  const draftLabel = labels?.draft ?? "پیش‌نویس";

  return (
    <fieldset
      id={id}
      className="sm:col-span-2"
      disabled={disabled}
      aria-label="وضعیت انتشار"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          id={`${id}-published`}
          role="radio"
          aria-checked={value === true}
          disabled={disabled}
          onClick={() => onChange(true)}
          className={cn(
            "flex items-start gap-3 rounded-xl border p-3.5 text-start transition-all",
            value
              ? "border-teal-500/50 bg-teal-500/10 shadow-sm shadow-teal-500/10"
              : "border-border bg-foreground/[0.02] hover:border-teal-500/30 hover:bg-teal-500/5",
          )}
        >
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              value
                ? "bg-gradient-to-br from-teal-400 to-emerald-500 text-white shadow-md shadow-teal-500/25"
                : "bg-foreground/[0.06] text-muted-foreground",
            )}
            aria-hidden
          >
            <Globe className="size-4" />
          </span>
          <span className="min-w-0">
            <span
              className={cn(
                "block text-sm font-bold",
                value ? "text-teal-700 dark:text-teal-300" : "text-foreground",
              )}
            >
              {publishedLabel}
            </span>
            <span className="mt-0.5 block text-[0.65rem] leading-5 text-muted-foreground">
              در سایت قابل مشاهده است.
            </span>
          </span>
        </button>

        <button
          type="button"
          id={`${id}-draft`}
          role="radio"
          aria-checked={value === false}
          disabled={disabled}
          onClick={() => onChange(false)}
          className={cn(
            "flex items-start gap-3 rounded-xl border p-3.5 text-start transition-all",
            !value
              ? "border-amber-500/50 bg-amber-500/10 shadow-sm shadow-amber-500/10"
              : "border-border bg-foreground/[0.02] hover:border-amber-500/30 hover:bg-amber-500/5",
          )}
        >
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              !value
                ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/25"
                : "bg-foreground/[0.06] text-muted-foreground",
            )}
            aria-hidden
          >
            <PenLine className="size-4" />
          </span>
          <span className="min-w-0">
            <span
              className={cn(
                "block text-sm font-bold",
                !value
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-foreground",
              )}
            >
              {draftLabel}
            </span>
            <span className="mt-0.5 block text-[0.65rem] leading-5 text-muted-foreground">
              فقط در پنل مدیر نمایش داده می‌شود.
            </span>
          </span>
        </button>
      </div>
    </fieldset>
  );
}
