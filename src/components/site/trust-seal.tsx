"use client";

import * as React from "react";
import { ShieldCheck, ExternalLink } from "lucide-react";

/**
 * رندر کد نمادهای اعتماد (اینماد / زرین‌پال) — عیناً و بدون هیچ تغییری
 * (طبق راهنمای رسمی اینماد، تغییر کد می‌تواند به ابطال نماد منجر شود).
 *
 * مشکل ظاهری که این کامپوننت حل می‌کند: کدهای رسمی نمادها یک <img> بدون
 * width/height و با alt خالی/کوتاه هستند؛ تا وقتی تصویر از سرور رسمی
 * (trustseal.enamad.ir / zarinpal.com) بارگذاری نشود، عنصر ۰×۰ پیکسل است
 * و «چیزی دیده نمی‌شود». اگر تصویر به هر دلیل (قطعی اینترنت، مسدودکننده‌ی
 * تبلیغات، محیط پیش‌نمایش) بارگذاری نشود، به‌جای ناپدیدشدن، یک نشان جایگزین
 * با پیوند به صفحه‌ی تأیید رسمی نمایش داده می‌شود تا نشان همیشه دیده شود.
 *
 * خود کد رسمی همیشه عیناً در DOM باقی می‌ماند و تغییری نمی‌کند؛
 * این کامپوننت فقط خواهرِ بصری برای وضعیت بارگذاری اضافه می‌کند.
 */

type SealState = "loading" | "loaded" | "error" | "none";

/** اگر تصویر بدون پاسخ ماند، بعد از این مدت حالت خطا نشان می‌دهیم (شنونده‌ی load همچنان فعال می‌ماند) */
const HANG_TIMEOUT_MS = 12_000;

/** href صفحه‌ی تأیید رسمی را از خودِ کد استخراج می‌کند (بدون تغییر کد) */
function extractVerifyHref(html: string): string | null {
  const match = /href\s*=\s*["']([^"']+)["']/i.exec(html);
  return match?.[1] ?? null;
}

/** رنگ‌بندی بر اساس ارائه‌دهنده‌ی نشان: اینماد (فیروزه‌ای) / زرین‌پال (طلایی) */
const TONE_CLASSES = {
  teal: {
    badge:
      "border-teal-600/30 bg-teal-500/[0.07] text-teal-700 hover:bg-teal-500/15 dark:border-teal-400/30 dark:bg-teal-400/[0.08] dark:text-teal-300 dark:hover:bg-teal-400/[0.15]",
    skeleton:
      "border-teal-500/40 bg-teal-500/[0.06] dark:border-teal-400/40 dark:bg-teal-400/[0.08]",
    icon: "text-teal-600/70 dark:text-teal-300/70",
  },
  amber: {
    badge:
      "border-amber-600/30 bg-amber-500/[0.07] text-amber-700 hover:bg-amber-500/15 dark:border-amber-400/30 dark:bg-amber-400/[0.08] dark:text-amber-300 dark:hover:bg-amber-400/[0.15]",
    skeleton:
      "border-amber-500/40 bg-amber-500/[0.06] dark:border-amber-400/40 dark:bg-amber-400/[0.08]",
    icon: "text-amber-600/70 dark:text-amber-300/70",
  },
} as const;

export function TrustSeal({
  html,
  /** رنگ‌بندی: teal = اینماد، amber = زرین‌پال */
  tone = "teal",
  /** متن نشان جایگزین در حالت خطا (به‌جای ناپدیدشدن) */
  fallbackLabel = "نماد اعتماد الکترونیکی",
  /** نام ارائه‌دهنده — در یادداشت خطا (پنل ادمین) به کار می‌رود */
  provider = "اینماد",
  /** سقف اندازه‌ی تصویر رسمی */
  maxImgClass = "[&_img]:max-h-[4.5rem] [&_img]:max-w-[9rem]",
  /** در پنل مدیر، توضیح خطای بارگذاری نیز نمایش داده می‌شود */
  showNote = false,
}: {
  html: string;
  tone?: keyof typeof TONE_CLASSES;
  fallbackLabel?: string;
  provider?: string;
  maxImgClass?: string;
  showNote?: boolean;
}) {
  const rawRef = React.useRef<HTMLDivElement | null>(null);
  const [state, setState] = React.useState<SealState>("loading");

  const verifyHref = React.useMemo(() => extractVerifyHref(html), [html]);
  const toneClasses = TONE_CLASSES[tone];

  React.useEffect(() => {
    const root = rawRef.current;
    if (!root) return;

    const img = root.querySelector("img");
    if (!img) {
      setState("none");
      return;
    }

    // تصویر پیش‌تر (از کش) کامل شده است
    if (img.complete) {
      setState(img.naturalWidth > 0 ? "loaded" : "error");
      return;
    }

    setState("loading");
    const onLoad = () => setState("loaded");
    const onError = () => setState("error");
    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);

    // درخواست معلق (بدون خطا و بدون پاسخ) را هم پوشش می‌دهیم؛
    // اگر بعداً تصویر برسد، load هنوز شنونده دارد و وضعیت اصلاح می‌شود.
    const hangTimer = window.setTimeout(() => {
      if (img.complete) {
        setState(img.naturalWidth > 0 ? "loaded" : "error");
      } else {
        setState("error");
      }
    }, HANG_TIMEOUT_MS);

    return () => {
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
      window.clearTimeout(hangTimer);
    };
  }, [html]);

  if (state === "none") {
    // کدی بدون تصویر — عیناً رندر می‌شود
    return <div ref={rawRef} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      {/* کد رسمی — عیناً و بدون تغییر */}
      <div
        ref={rawRef}
        className={`flex items-center justify-center [&_img]:h-auto [&_img]:w-auto ${maxImgClass}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* تا رسیدن تصویر از سرور رسمی، جای لوگو خالی نمی‌ماند */}
      {state === "loading" ? (
        <span
          aria-hidden="true"
          className={`flex size-16 animate-pulse items-center justify-center rounded-xl border border-dashed ${toneClasses.skeleton}`}
          title={`در حال دریافت لوگوی ${provider}…`}
        >
          <ShieldCheck
            className={`size-6 ${toneClasses.icon}`}
            strokeWidth={1.7}
          />
        </span>
      ) : null}

      {/* تصویر از سرور رسمی دریافت نشد — نشان جایگزین با پیوند تأیید
          (فشرده تا در ستون فوتر، در کنار نشان دیگر و بدون شکستن خط جا شود) */}
      {state === "error" ? (
        <div className="flex flex-col items-center gap-1.5">
          {verifyHref ? (
            <a
              href={verifyHref}
              target="_blank"
              rel="noreferrer"
              className={`flex h-8 items-center gap-1 rounded-full border px-2.5 text-[0.6rem] font-bold transition-colors ${toneClasses.badge}`}
              title={`نمایش صفحه‌ی تأیید ${fallbackLabel}`}
            >
              <ShieldCheck className="size-3.5" strokeWidth={2} />
              {fallbackLabel}
              <ExternalLink className="size-2.5" strokeWidth={2} />
            </a>
          ) : (
            <span
              className={`flex h-8 items-center gap-1 rounded-full border px-2.5 text-[0.6rem] font-bold ${toneClasses.badge}`}
            >
              <ShieldCheck className="size-3.5" strokeWidth={2} />
              {fallbackLabel}
            </span>
          )}
          {showNote ? (
            <p className="max-w-md text-center text-[0.62rem] leading-5 text-muted-foreground">
              تصویر لوگو در این لحظه از سرورهای {provider} دریافت نشد — کد عیناً
              ذخیره شده و در فوتر سایت درج می‌شود. در محیط پیش‌نمایش، هنگام قطعی
              اینترنت یا با فعال بودن مسدودکننده‌ی تبلیغات، تصویر بارگذاری
              نمی‌شود؛ روی سایت اصلی با اینترنت عادی، لوگوی {provider} نمایش
              داده می‌شود.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
