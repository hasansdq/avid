"use client";

import * as React from "react";
import { Radio, UserCheck } from "lucide-react";
import type { PanelStreamInvite } from "@/components/stream/types";
import { faDigits } from "@/lib/fa";
import { cn } from "@/lib/utils";

/**
 * باکس «دعوت به کلاس» — مستطیلی، درست زیر کارت مشخصات کاربر در پنل.
 *
 * فقط وقتی دیده می‌شود که استریمِ فعالی (در انتظار شروع یا زنده) برای
 * دوره/کلاس‌های این کاربر وجود داشته باشد؛ در غیاب آن کاملاً مخفی است.
 * هر ۳۰ ثانیه به‌روزرسانی می‌شود تا شروع لحظه‌ای کلاس دیده شود.
 */
export function StreamInviteBox() {
  const [invites, setInvites] = React.useState<PanelStreamInvite[] | null>(
    null
  );

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/panel/streams", { cache: "no-store" });
        if (!res.ok) {
          if (alive) setInvites([]);
          return;
        }
        const json = (await res.json()) as { streams?: PanelStreamInvite[] };
        if (alive) setInvites(json.streams ?? []);
      } catch {
        if (alive) setInvites([]);
      }
    };
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  // — هیچ دعوت فعالی نیست → باکس کاملاً مخفی —
  if (!invites || invites.length === 0) return null;

  const hasLive = invites.some((s) => s.status === "live");

  return (
    <section
      aria-label="دعوت به کلاس آنلاین"
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4 shadow-xl backdrop-blur-xl sm:p-5",
        hasLive
          ? "border-red-500/30 bg-red-500/[0.04] shadow-red-500/10 dark:border-red-400/25 dark:bg-red-400/[0.04]"
          : "border-teal-500/30 bg-teal-500/[0.04] shadow-black/[0.04] dark:border-teal-400/25 dark:bg-[#08110e]/70"
      )}
    >
      {/* درخشش نرم پس‌زمینه */}
      <div
        className={cn(
          "pointer-events-none absolute -top-16 -end-16 size-40 rounded-full blur-[80px]",
          hasLive ? "bg-red-400/15" : "bg-teal-400/15"
        )}
        aria-hidden
      />

      <div className="relative flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm font-black text-foreground">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl",
              hasLive
                ? "bg-gradient-to-br from-red-400 to-rose-600 shadow-lg shadow-red-500/25"
                : "bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/25"
            )}
            aria-hidden
          >
            <Radio
              className={cn("size-4 text-white", hasLive && "animate-pulse")}
              strokeWidth={2.2}
            />
          </span>
          کلاس آنلاین آوید
          {invites.length > 1 ? (
            <span className="rounded-full border border-border bg-foreground/[0.04] px-2 py-0.5 text-[0.6rem] font-black text-muted-foreground dark:bg-white/[0.04]">
              {faDigits(invites.length)} دعوت
            </span>
          ) : null}
        </p>

        <div className="flex flex-col gap-2">
          {invites.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-foreground/[0.08] bg-card/70 p-3 dark:border-white/[0.08]"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-black text-foreground">
                  <span className="truncate">{s.title}</span>
                  {s.status === "live" ? (
                    <span className="flex select-none items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[0.6rem] font-black text-red-600 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300">
                      <span className="relative flex size-1.5">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-red-500" />
                      </span>
                      در حال پخش زنده
                    </span>
                  ) : (
                    <span className="select-none rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[0.6rem] font-black text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
                      در انتظار شروع
                    </span>
                  )}
                </p>
                {s.reasons.length > 0 ? (
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.65rem] font-bold text-muted-foreground">
                    <UserCheck className="size-3" />
                    دعوت از طریق:
                    {s.reasons.map((r) => (
                      <span
                        key={r}
                        className="rounded-full border border-border bg-foreground/[0.03] px-2 py-0.5 dark:bg-white/[0.03]"
                      >
                        {r}
                      </span>
                    ))}
                  </p>
                ) : null}
                {s.description ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {s.description}
                  </p>
                ) : null}
              </div>

              {/* ناوبری کامل صفحه — ورود به کلاس نیازمند بارگذاری تازه است */}
              <a
                href={`/stream/${s.id}`}
                className={cn(
                  "flex h-11 shrink-0 select-none items-center gap-2 rounded-xl px-5 text-xs font-black transition-all hover:scale-[1.02]",
                  s.status === "live"
                    ? "bg-gradient-to-l from-red-400 to-rose-600 text-white shadow-lg shadow-red-500/30"
                    : "bg-gradient-to-l from-teal-400 to-emerald-500 text-teal-950 shadow-lg shadow-teal-500/25"
                )}
              >
                <Radio className="size-4" />
                دعوت به کلاس
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
