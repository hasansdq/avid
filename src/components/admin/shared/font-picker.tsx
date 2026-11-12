"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Type } from "lucide-react";
import { FontStylesheets } from "@/components/font-loader";
import { apiFetch } from "@/components/admin/api";
import { fontStack } from "@/lib/fonts";
import type { InstalledFont } from "@/components/admin/types";
import { cn } from "@/lib/utils";

/**
 * انتخابگر فونت از بین فونت‌های نصب‌شده سایت —
 * کارت‌های تک‌انتخابی با پیش‌نمایش زنده‌ی هر فونت.
 * (برای اسلوگان در «هویت سایت» و برای هدر/فوتر در «ویرایش هدر و فوتر»)
 */

const SAMPLE_TEXT = "یادگیری هر مهارتی، سرمایه‌ی شما در آینده است";

export function FontPicker({
  value,
  onChange,
  disabled,
}: {
  /** کلید فونت انتخاب‌شده */
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  const [fonts, setFonts] = useState<InstalledFont[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<InstalledFont[]>("/api/admin/fonts")
      .then((list) => {
        if (!cancelled) setFonts(list);
      })
      .catch(() => {
        // خطا در فهرست فونت‌ها — انتخابگر با فهرست خالی ادامه می‌دهد
        if (!cancelled) setFonts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!fonts) {
    return (
      <div className="flex h-20 items-center justify-center rounded-2xl border border-dashed border-border bg-foreground/[0.02]">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* همه‌ی فونت‌ها برای پیش‌نمایش زنده بارگذاری می‌شوند */}
      <FontStylesheets cssTexts={fonts.map((f) => f.cssText)} />

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {fonts.map((font) => {
          const selected = value === font.key;
          return (
            <button
              key={font.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(font.key)}
              aria-pressed={selected}
              aria-label={`انتخاب فونت ${font.label}`}
              className={cn(
                "relative rounded-2xl border p-3.5 text-right transition-all duration-200 disabled:opacity-60",
                selected
                  ? "border-teal-500/60 bg-teal-500/[0.07] ring-2 ring-teal-500/40 dark:border-teal-400/50 dark:bg-teal-400/[0.07] dark:ring-teal-400/35"
                  : "border-border bg-foreground/[0.02] hover:border-foreground/20 hover:bg-foreground/[0.04] dark:bg-white/[0.02]"
              )}
            >
              {selected ? (
                <span className="absolute start-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 shadow-md">
                  <Check className="size-3 text-teal-950" strokeWidth={3} />
                </span>
              ) : null}

              <span className="flex items-center gap-2 pe-6">
                <Type className="size-3.5 shrink-0 text-muted-foreground" />
                <span
                  className="truncate text-sm font-black text-foreground"
                  style={{ fontFamily: fontStack(font.family) }}
                >
                  {font.label}
                </span>
              </span>
              <span
                className="mt-2 block truncate text-[0.7rem] leading-6 text-muted-foreground"
                style={{ fontFamily: fontStack(font.family) }}
                title={SAMPLE_TEXT}
              >
                {SAMPLE_TEXT}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
