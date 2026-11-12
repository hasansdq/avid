"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { faDigits } from "@/lib/fa";
import {
  jalaliMonthLength,
  jalaliMonthName,
  jalaliWeekday,
  nextJalaliMonth,
  prevJalaliMonth,
  toGregorian,
  toJalali,
  type JalaliDate,
} from "@/lib/jalali";

/**
 * تقویم جلالی (شمسی) — قطعه‌ی رابط کاربری عمومی و مستقل از داده.
 *
 *  • نمایش یک ماه با سرستون‌های «ش ی د س چ پ ج» (هفته از شنبه شروع می‌شود)
 *  • پیمایش ماه/سال با دکمه‌های راست (قبل) و چپ (بعد) — منطق راست‌به‌چپ
 *  • روز جاری و روز انتخاب‌شده با رنگ‌های برجسته‌ی فیروزه‌ای
 *  • جمعه‌ها (آخرین ستون) با رنگ ملایم متمایز می‌شوند
 *
 * انتخاب هر روز با تاریخ میلادیِ نیمه‌شب (بدون ساعت) در onChange
 * برگردانده می‌شود تا ذخیره‌سازی در API ساده بماند.
 */

/** سرستون‌های روز هفته — شنبه تا جمعه */
const WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"] as const;

export function JalaliCalendar({
  value,
  onChange,
  className,
}: {
  /** تاریخ انتخاب‌شده (میلادی در Date) */
  value: Date;
  /** انتخاب روز جدید — نیمه‌شب همان روز */
  onChange: (date: Date) => void;
  className?: string;
}) {
  const selected = toJalali(value);
  const today = toJalali(new Date());

  // ماه در حال نمایش — با تغییر مقدار انتخابی هم‌گام می‌ماند
  const [view, setView] = React.useState<JalaliDate>(() => ({ ...selected }));

  React.useEffect(() => {
    setView((prev) =>
      prev.jy === selected.jy && prev.jm === selected.jm ? prev : { ...selected }
    );
  }, [selected.jy, selected.jm]);

  const daysInMonth = jalaliMonthLength(view.jy, view.jm);
  /** ستون روز هفته‌ی روز اول ماه (۰=شنبه) */
  const firstWeekday = jalaliWeekday(view.jy, view.jm, 1);

  /** سلول‌های شبکه: null = خانه‌ی خالی قبل/بعد از روزهای ماه */
  const cells = React.useMemo<Array<number | null>>(() => {
    const list: Array<number | null> = Array.from(
      { length: firstWeekday },
      () => null
    );
    for (let d = 1; d <= daysInMonth; d += 1) list.push(d);
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [firstWeekday, daysInMonth]);

  const rows = React.useMemo(() => {
    const out: Array<Array<number | null>> = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cells]);

  function goMonth(dir: 1 | -1) {
    setView((prev) =>
      dir === 1
        ? nextJalaliMonth(prev.jy, prev.jm)
        : prevJalaliMonth(prev.jy, prev.jm)
    );
  }

  function goYear(dir: 1 | -1) {
    setView((prev) => ({ ...prev, jy: prev.jy + dir }));
  }

  /** روز جلالی را به Date میلادیِ نیمه‌شب تبدیل و اعلام می‌کند */
  function pick(jy: number, jm: number, jd: number) {
    onChange(toGregorian(jy, jm, jd));
  }

  const isToday = (jd: number) =>
    view.jy === today.jy && view.jm === today.jm && jd === today.jd;
  const isSelected = (jd: number) =>
    view.jy === selected.jy && view.jm === selected.jm && jd === selected.jd;

  return (
    <div
      dir="rtl"
      role="grid"
      aria-label={`تقویم شمسی ${jalaliMonthName(view.jm)} ${faDigits(view.jy)}`}
      className={cn("w-[17.5rem] select-none", className)}
    >
      {/* ————— سربرگ: ماه/سال + دکمه‌های پیمایش ————— */}
      <div className="mb-2 flex items-center justify-between gap-1">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => goYear(-1)}
            aria-label="سال قبل"
            title="سال قبل"
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <ChevronsRight className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => goMonth(-1)}
            aria-label="ماه قبل"
            title="ماه قبل"
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <p className="min-w-0 text-center text-sm font-black text-foreground">
          {jalaliMonthName(view.jm)}{" "}
          <span className="tabular-nums">{faDigits(view.jy)}</span>
        </p>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => goMonth(1)}
            aria-label="ماه بعد"
            title="ماه بعد"
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => goYear(1)}
            aria-label="سال بعد"
            title="سال بعد"
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <ChevronsLeft className="size-3.5" />
          </button>
        </div>
      </div>

      {/* ————— سرستون‌های روز هفته ————— */}
      <div role="row" className="grid grid-cols-7">
        {WEEKDAYS.map((w, i) => (
          <span
            key={w + i}
            role="columnheader"
            aria-label={
              ["شنبه", "یکشنبه", "دوشنبه", "سهشنبه", "چهارشنبه", "پنجشنبه", "جمعه"][i]
            }
            className={cn(
              "flex h-7 items-center justify-center text-[0.65rem] font-bold",
              i === 6
                ? "text-rose-500/80 dark:text-rose-300/70"
                : "text-muted-foreground/80"
            )}
          >
            {w}
          </span>
        ))}
      </div>

      {/* ————— روزهای ماه ————— */}
      <div role="rowgroup" className="grid grid-cols-7 gap-y-0.5">
        {rows.map((row, ri) => (
          <React.Fragment key={ri}>
            {row.map((jd, ci) => {
              if (jd === null) {
                return (
                  <span
                    key={`${ri}-${ci}`}
                    role="gridcell"
                    aria-hidden
                    className="size-9"
                  />
                );
              }
              const isSel = isSelected(jd);
              const isTod = isToday(jd);
              const isFriday = ci === 6;
              return (
                <button
                  key={`${ri}-${ci}`}
                  type="button"
                  role="gridcell"
                  aria-selected={isSel}
                  aria-label={`${faDigits(jd)} ${jalaliMonthName(view.jm)} ${faDigits(view.jy)}`}
                  onClick={() => pick(view.jy, view.jm, jd)}
                  className={cn(
                    "size-9 rounded-lg text-xs font-bold tabular-nums transition-colors",
                    isSel
                      ? "bg-teal-600 text-white shadow-md shadow-teal-600/25 hover:bg-teal-700 dark:bg-teal-500 dark:text-teal-950 dark:hover:bg-teal-400"
                      : isTod
                        ? "border border-teal-500/50 text-teal-700 hover:bg-teal-500/10 dark:border-teal-400/50 dark:text-teal-300 dark:hover:bg-teal-400/10"
                        : isFriday
                          ? "text-rose-600/90 hover:bg-foreground/[0.06] dark:text-rose-300/80 dark:hover:bg-foreground/[0.06]"
                          : "text-foreground/85 hover:bg-foreground/[0.06]"
                  )}
                >
                  {faDigits(jd)}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
