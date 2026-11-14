"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch, UNAUTHORIZED_EVENT } from "@/components/admin/api";
import { LoginScreen } from "@/components/admin/login-screen";
import { AdminShell } from "@/components/admin/admin-shell";
import { btnGradient } from "@/components/admin/shared/styles";

interface SessionState {
  checking: boolean;
  authenticated: boolean;
  username?: string;
  /** بررسی اولیه پاسخی از سرور نگرفت (شبکه/سقف زمان) — دکمه تلاش مجدد نشان می‌دهیم */
  networkError?: boolean;
}

/**
 * ریشه‌ی پنل مدیریت —
 * بررسی احراز هویت در ابتدا (با سقف زمان تا صفحه در «در حال بررسی دسترسی»
 * بی‌پایان نماند)، مدیریت سراسری ۴۰۱ (خروج اجباری)
 * و سوییچ بین صفحه‌ی ورود و پوسته‌ی مدیریت.
 */
export function SuperAdminApp() {
  const [session, setSession] = useState<SessionState>({
    checking: true,
    authenticated: false,
  });
  // با هر تلاش مجدد این شمارنده بالا می‌رود و اثر دوباره اجرا می‌شود
  const [retryTick, setRetryTick] = useState(0);
  const authedRef = useRef(false);

  useEffect(() => {
    authedRef.current = session.authenticated;
  }, [session.authenticated]);

  // بررسی وضعیت نشست هنگام بارگذاری — با سقف زمان ۱۰ ثانیه
  useEffect(() => {
    let alive = true;
    apiFetch<{ authenticated: boolean; username?: string }>("/api/auth/me", {
      // اگر درخواست گیر کند، حداکثر ۱۰ ثانیه صبر می‌کنیم؛ سپس به‌جای
      // چرخش بی‌پایان، حالت خطای شبکه با دکمه تلاش مجدد نمایش می‌یابد.
      signal: AbortSignal.timeout(10_000),
    })
      .then((res) => {
        if (!alive) return;
        setSession({
          checking: false,
          authenticated: res.authenticated,
          username: res.username,
        });
      })
      .catch(() => {
        if (!alive) return;
        // پاسخی از سرور نرسید — متمایز از «کاربر وارد نشده» تا کاربر
        // بداند مشکل اتصال است نه نیاز به ورود مجدد.
        setSession({ checking: false, authenticated: false, networkError: true });
      });
    return () => {
      alive = false;
    };
  }, [retryTick]);

  // خروج اجباری وقتی هر API وضعیت ۴۰۱ برگرداند
  useEffect(() => {
    const onUnauthorized = () => {
      if (!authedRef.current) return; // خطای ۴۰۱ صفحه‌ی ورود خودش مدیریت می‌شود
      toast.error("نشست شما منقضی شده است. لطفاً دوباره وارد شوید.");
      setSession({ checking: false, authenticated: false });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const handleLogin = useCallback((username: string) => {
    setSession({ checking: false, authenticated: true, username });
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // حتی اگر فراخوانی ناموفق بود، به حالت ورود برمی‌گردیم
    }
    setSession({ checking: false, authenticated: false });
  }, []);

  if (session.checking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-8 animate-spin text-teal-400" />
        <p className="text-sm">در حال بررسی دسترسی...</p>
      </div>
    );
  }

  // بررسی اولیه به خطای شبکه/سقف زمان خورد — به‌جای چرخش ابدی،
  // پیام شفاف + دکمه تلاش مجدد نشان می‌دهیم.
  if (session.networkError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
          <WifiOff className="size-7" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-black text-foreground">
            اتصال به سرور برقرار نشد
          </h1>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
            بررسی دسترسی با خطا مواجه شد. اتصال خود را بررسی کنید و دوباره
            تلاش کنید؛ اگر مشکل ادامه داشت صفحه را نوسازی کنید.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            className={`h-11 rounded-xl px-6 text-sm ${btnGradient}`}
            onClick={() => {
              setSession({ checking: true, authenticated: false });
              setRetryTick((c) => c + 1);
            }}
          >
            <RefreshCw className="size-4" />
            تلاش مجدد
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl px-6 text-sm"
            onClick={() => window.location.reload()}
          >
            نوسازی صفحه
          </Button>
        </div>
      </div>
    );
  }

  if (!session.authenticated) {
    return <LoginScreen onSuccess={handleLogin} />;
  }

  return (
    <AdminShell
      username={session.username ?? "admin"}
      onLogout={handleLogout}
    />
  );
}
