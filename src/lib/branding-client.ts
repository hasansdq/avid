"use client";

import * as React from "react";

/**
 * برندینگ سمت کلاینت — هوک useBranding()
 *
 * لوگو/نام/شعار سایت را از /api/branding می‌خواند و در همه‌ی مؤلفه‌های
 * کلاینتی (LogoMark پنل مدیریت، صفحه‌ی ورود مدیر، بنر نصب وب‌اپ…)
 * مشترک است تا لوگوی جدید «تنظیمات سایت» همان‌جا اعمال شود.
 *
 *  • درخواست‌ها در سطح ماژول one-shot می‌شوند (چند LogoMark در یک صفحه
 *    = فقط یک fetch) و نتیجه در همه‌ی نمونه‌ها به اشتراک گذاشته می‌شود.
 *  • نسخه‌ی قبلی در localStorage کش می‌شود تا رندر اولیه بدون پرش/فلاش
 *    لوگوی درست باشد؛ پس از fetch تازه، در پس‌زمینه به‌روز می‌شود.
 */

export interface ClientBranding {
  logoUrl: string;
  siteName: string;
  tagline: string;
  version: string;
}

const STORAGE_KEY = "avid:branding";
const LS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // یک هفته — پس از آن نادیده

type State = {
  data: ClientBranding | null;
  /** پرچم «درخواست این نشست ارسال شده» — رندرهای بعدی همان داده را می‌گیرند */
  inflight: Promise<ClientBranding | null> | null;
  current: ClientBranding | null;
};

const state: State = { data: null, inflight: null, current: null };

function readCached(): ClientBranding | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { d?: ClientBranding; ts?: number };
    if (!parsed.d || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > LS_MAX_AGE_MS) return null;
    return parsed.d;
  } catch {
    return null;
  }
}

function writeCached(data: ClientBranding): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ d: data, ts: Date.now() })
    );
  } catch {
    // حافظه‌ی محلی پر/غیرفعال — بی‌خطر
  }
}

/** دریافت (و اشتراک‌گذاری) برندینگ — یک fetch در هر نشست مرورگر */
function loadBranding(): Promise<ClientBranding | null> {
  if (state.current) return Promise.resolve(state.current);
  if (state.inflight) return state.inflight;

  state.inflight = fetch("/api/branding", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((data: ClientBranding | null) => {
      if (data?.logoUrl) {
        state.current = data;
        writeCached(data);
        for (const listener of listeners) listener(data);
      }
      return data;
    })
    .catch(() => null)
    .finally(() => {
      state.inflight = null;
    });
  return state.inflight;
}

/** شنونده‌ها — وقتی داده‌ی تازه رسید همه‌ی نمونه‌ها به‌روز می‌شوند */
const listeners = new Set<(d: ClientBranding) => void>();

/**
 * هوک برندینگ — مقدار کش‌شده‌ی localStorage فوراً (اگر باشد)، سپس داده‌ی
 * تازه‌ی شبکه. خروجی null یعنی «هنوز نامشخص» (فراخواننده جایگزین می‌گذارد).
 */
export function useBranding(): ClientBranding | null {
  const [branding, setBranding] = React.useState<ClientBranding | null>(
    () => state.current ?? (typeof window === "undefined" ? null : readCached())
  );

  React.useEffect(() => {
    const listener = (d: ClientBranding) => setBranding(d);
    listeners.add(listener);
    if (!state.current) void loadBranding();
    else setBranding(state.current);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // داده‌ی کش‌شده قدیمی است ولی شبکه تازه‌تر را آورده؟ sync از state
  React.useEffect(() => {
    if (state.current && branding && state.current.version !== branding.version) {
      setBranding(state.current);
    }
  }, [branding]);

  return branding;
}
