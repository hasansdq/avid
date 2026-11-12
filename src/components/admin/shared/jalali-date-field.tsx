"use client";

import * as React from "react";
import { CalendarDays, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JalaliCalendar } from "@/components/ui/jalali-calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { faDate } from "@/lib/fa";
import { cn } from "@/lib/utils";

/**
 * JalaliDateField — جایگزینِ فارسیِ input[type="date"] برای فرم‌های مدیریت.
 *
 *  • دکمه‌ی نمایش تاریخ شمسی (مثل «۲۴ آبان ۱۴۰۵») که با کلیک، تقویم جلالی
 *    (JalaliCalendar) را در یک Popover باز می‌کند.
 *  • مقدار سیمی همان رشته‌ی «YYYY-MM-DD» میلادی است تا API بدون تغییر بماند.
 *  • «امروز» تاریخ جاری را می‌گذارد؛ «پاک کردن» (فقط با clearable) مقدار
 *    را خالی می‌کند برای فیلدهای اختیاری مثل تاریخ انقضای کد تخفیف.
 */

/** رشته‌ی YYYY-MM-DD محلی از یک Date نیمه‌شب */
function toInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** رشته‌ی YYYY-MM-DD → Date نیمه‌شب محلی (null برای خالی/نامعتبر) */
function parseInputValue(value: string): Date | null {
  if (!value || value.length !== 10) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function JalaliDateField({
  id,
  value,
  onChange,
  placeholder = "انتخاب تاریخ...",
  clearable = false,
  className,
  ariaLabel,
}: {
  /** شناسه‌ی برای برچسب htmlFor فرم */
  id?: string;
  /** مقدار فعلی — رشته‌ی «YYYY-MM-DD» یا خالی */
  value: string;
  /** انتخاب تاریخ جدید — همان قالب رشته‌ای YYYY-MM-DD */
  onChange: (value: string) => void;
  /** متن حالت خالی */
  placeholder?: string;
  /** نمایش دکمه‌ی «پاک کردن» برای فیلدهای اختیاری */
  clearable?: boolean;
  /** کلاس ظاهری دکمه (مثلاً h-10 rounded-lg) */
  className?: string;
  /** برچسب دسترسی — پیش‌فرض از روی متن دکمه ساخته می‌شود */
  ariaLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const parsed = React.useMemo(() => parseInputValue(value), [value]);

  function pick(date: Date) {
    onChange(toInputValue(date));
    setOpen(false);
  }

  function clear() {
    onChange("");
    setOpen(false);
  }

  const label = parsed ? faDate(parsed) : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          aria-label={ariaLabel ?? label}
          title={label}
          className={cn(
            "flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-input bg-foreground/[0.03] px-3 text-sm font-bold text-foreground transition-colors hover:border-teal-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 disabled:opacity-50 dark:bg-white/[0.04] dark:hover:border-teal-400/40",
            parsed ? "text-foreground" : "text-muted-foreground/70",
            className
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <CalendarDays className="size-4 shrink-0 text-teal-600 dark:text-teal-300" />
            <span className="truncate">{label}</span>
          </span>
          {clearable && parsed ? (
            <Eraser
              className="size-3.5 shrink-0 text-muted-foreground/60"
              aria-hidden
            />
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent
        dir="rtl"
        align="start"
        className="w-auto rounded-2xl p-3"
      >
        <JalaliCalendar value={parsed ?? new Date()} onChange={pick} />

        {/* — پاورقی: تاریخ انتخاب فعلی + میان‌برها — */}
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-foreground/[0.07] pt-2 dark:border-white/[0.07]">
          <p className="min-w-0 truncate text-[0.65rem] font-black text-muted-foreground">
            {parsed ? faDate(parsed) : placeholder}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {clearable ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clear}
                disabled={!parsed}
                className="h-7 rounded-lg px-2.5 text-[0.65rem] font-bold"
              >
                <Eraser className="size-3" />
                پاک کردن
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => pick(new Date())}
              className="h-7 rounded-lg px-2.5 text-[0.65rem] font-bold"
            >
              امروز
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
