"use client";

import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/components/admin/api";
import { btnGradient } from "@/components/admin/shared/styles";
import { LogoMark } from "@/components/admin/shared/logo-mark";

/** صفحه‌ی ورود به پنل — کارت شیشه‌ای وسط روی پس‌زمینه‌ی شبکه‌ای */
export function LoginScreen({
  onSuccess,
}: {
  onSuccess: (username: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const res = await apiFetch<{ ok: boolean; username: string }>(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ username: username.trim(), password }),
        }
      );
      toast.success(`خوش آمدید، ${res.username}`);
      onSuccess(res.username);
    } catch (error) {
      if (error instanceof Error && error.message) {
        toast.error(error.message);
      } else {
        toast.error("ورود ناموفق بود. لطفاً دوباره تلاش کنید.");
      }
      setPending(false);
    }
  }

  return (
    <div className="bg-grid-tech relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* هاله‌ی نور فیروزه‌ای */}
      <div className="pointer-events-none absolute -top-32 right-1/2 h-96 w-96 translate-x-1/2 rounded-full bg-teal-500/20 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-40 left-1/4 h-80 w-80 rounded-full bg-violet-500/10 blur-[120px]" />

      <div className="relative w-full max-w-md">
        <div className="glass gradient-border rounded-3xl p-6 sm:p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <LogoMark className="size-14" iconClassName="size-7" />
            <div className="space-y-1">
              <h1 className="text-xl font-black text-foreground">
                پنل مدیریت آوید
              </h1>
              <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                <ShieldCheck className="size-4 text-teal-600 dark:text-teal-300" />
                برای ادامه وارد شوید
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-username">نام کاربری</Label>
              <div className="relative">
                <User className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-muted-foreground" />
                <Input
                  id="login-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  required
                  disabled={pending}
                  className="ps-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-password">رمز عبور</Label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-muted-foreground" />
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  disabled={pending}
                  className="ps-10"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={pending || !username.trim() || !password}
              className={`h-11 w-full rounded-xl text-sm ${btnGradient}`}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              {pending ? "در حال ورود..." : "ورود به پنل"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
