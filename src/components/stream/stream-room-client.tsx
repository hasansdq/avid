"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, LogIn, Radio, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StreamRoom } from "@/components/stream/stream-room";
import type { StreamSession } from "@/components/stream/types";

/**
 * پوسته‌ی صفحه‌ی کلاس آنلاین — نقش بیننده را از API می‌گیرد و بر اساس آن
 * اتاق (استاد/دانشجو)، صفحه‌ی اخراج/پایان/بدون‌دعوت یا ورود را نشان می‌دهد.
 */
export function StreamRoomClient({ streamId }: { streamId: string }) {
  const [session, setSession] = React.useState<StreamSession | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/streams/${streamId}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as StreamSession | null;
        if (cancelled) return;
        if (!res.ok || !json) {
          setError(
            (json as unknown as { error?: string })?.error ??
              "خطا در بررسی وضعیت کلاس."
          );
          return;
        }
        setSession(json);
      })
      .catch(() => {
        if (!cancelled) setError("ارتباط با سرور برقرار نشد.");
      });
    return () => {
      cancelled = true;
    };
  }, [streamId]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-red-500/[0.05] p-8 text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-400 to-rose-600 shadow-lg shadow-red-500/25">
            <ShieldAlert className="size-8 text-white" strokeWidth={2.2} />
          </span>
          <h1 className="mt-5 text-lg font-black text-foreground">
            {error}
          </h1>
          <Button asChild className="mt-6 h-11 w-full rounded-xl font-bold">
            <Link href="/">بازگشت به صفحه‌ی اصلی</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background"
        role="status"
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-teal-600 dark:text-teal-300" />
          <p className="text-sm font-bold text-muted-foreground">
            در حال ورود به کلاس آنلاین...
          </p>
        </div>
      </div>
    );
  }

  // — مهمان: باید از پنل وارد شود —
  if (!session.canJoin && session.reason === "login") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="gradient-border w-full max-w-md rounded-[1.75rem] bg-card/85 p-8 text-center shadow-2xl shadow-black/10 backdrop-blur-xl md:p-9 dark:bg-[#08110e]/80 dark:shadow-black/30">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/25">
            <LogIn className="size-8 text-teal-950" strokeWidth={2.2} />
          </span>
          <h1 className="mt-5 text-xl font-black leading-8 text-foreground">
            برای ورود به کلاس آنلاین وارد حساب خود شوید
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            {session.stream.title} — کلاس‌های آنلاین فقط برای کاربران دعوت‌شده
            برگزار می‌شود.
          </p>
          <Button asChild className="mt-6 h-12 w-full rounded-2xl bg-gradient-to-l from-teal-400 to-emerald-500 text-sm font-black text-teal-950 shadow-xl shadow-teal-500/30">
            <Link href="/panel">ورود به پنل کاربر</Link>
          </Button>
        </div>
      </div>
    );
  }

  // — اخراج‌شده —
  if (!session.canJoin && session.reason === "kicked") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-red-500/[0.05] p-8 text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-400 to-rose-600 shadow-lg shadow-red-500/25">
            <ShieldAlert className="size-8 text-white" strokeWidth={2.2} />
          </span>
          <h1 className="mt-5 text-xl font-black text-foreground">
            شما از این کلاس اخراج شده‌اید
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            تا پایان این جلسه امکان بازگشت ندارید.
          </p>
          <Button asChild variant="outline" className="mt-6 h-11 w-full rounded-xl font-bold">
            <Link href="/panel">بازگشت به پنل کاربر</Link>
          </Button>
        </div>
      </div>
    );
  }

  // — پایان‌یافته —
  if (!session.canJoin && session.reason === "ended") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card/70 p-8 text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-foreground/[0.06]">
            <Radio className="size-8 text-muted-foreground" strokeWidth={2.2} />
          </span>
          <h1 className="mt-5 text-xl font-black text-foreground">
            این جلسه پایان یافته است
          </h1>
          <Button asChild variant="outline" className="mt-6 h-11 w-full rounded-xl font-bold">
            <Link href="/panel">بازگشت به پنل کاربر</Link>
          </Button>
        </div>
      </div>
    );
  }

  // — بدون دعوت —
  if (!session.canJoin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-8 text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/25">
            <ShieldAlert className="size-8 text-amber-950" strokeWidth={2.2} />
          </span>
          <h1 className="mt-5 text-xl font-black text-foreground">
            شما به این کلاس دعوت نشده‌اید
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            دعوت به کلاس‌های آنلاین از طریق دوره/کلاس‌های شما انجام می‌شود.
          </p>
          <Button asChild variant="outline" className="mt-6 h-11 w-full rounded-xl font-bold">
            <Link href="/panel">بازگشت به پنل کاربر</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <StreamRoom session={session} />;
}
