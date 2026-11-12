"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, UNAUTHORIZED_EVENT } from "@/components/admin/api";
import { LoginScreen } from "@/components/admin/login-screen";
import { AdminShell } from "@/components/admin/admin-shell";

interface SessionState {
  checking: boolean;
  authenticated: boolean;
  username?: string;
}

/**
 * ریشه‌ی پنل مدیریت —
 * بررسی احراز هویت در ابتدا، مدیریت سراسری ۴۰۱ (خروج اجباری)
 * و سوییچ بین صفحه‌ی ورود و پوسته‌ی مدیریت.
 */
export function SuperAdminApp() {
  const [session, setSession] = useState<SessionState>({
    checking: true,
    authenticated: false,
  });
  const authedRef = useRef(false);

  useEffect(() => {
    authedRef.current = session.authenticated;
  }, [session.authenticated]);

  // بررسی وضعیت نشست هنگام بارگذاری
  useEffect(() => {
    let alive = true;
    apiFetch<{ authenticated: boolean; username?: string }>("/api/auth/me")
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
        setSession({ checking: false, authenticated: false });
      });
    return () => {
      alive = false;
    };
  }, []);

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
