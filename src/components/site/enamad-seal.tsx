"use client";

import * as React from "react";
import { ShieldCheck, ExternalLink } from "lucide-react";

/**
 * رندر کد نماد اعتماد الکترونیکی (اینماد) — عیناً و بدون هیچ تغییری
 * (طبق راهنمای رسمی اینماد، تغییر کد می‌تواند به ابطال نماد منجر شود).
 *
 * مشکل ظاهری که این کامپوننت حل می‌کند: کد رسمی اینماد یک <img> بدون
 * width/height و با alt خالی است؛ تا وقتی تصویر از سرور trustseal.enamad.ir
 * بارگذاری نشود، عنصر ۰×۰ پیکسل است و «چیزی دیده نمی‌شود». اگر تصویر به هر
 * دلیل (قطعی اینترنت، مسدودکننده‌ی تبلیغات، محیط پیش‌نمایش) بارگذاری نشود،
 * به‌جای ناپدیدشدن، یک نشان جایگزین با پیوند به صفحه‌ی تأیید اینماد
 * نمایش داده می‌شود تا کاربران همیشه بتوانند اعتماد را بررسی کنند.
 *
 * خود کد اینماد همیشه عیناً در DOM باقی می‌ماند و تغییری نمی‌کند؛
 * این کامپوننت فقط یک خواهرِ بصری برای وضعیت بارگذاری اضافه می‌کند.
 */

type SealState = "loading" | "loaded" | "error" | "none";

/** اگر تصویر بدون پاسخ ماند، بعد از این مدت حالت خطا نشان می‌دهیم (شنونده‌ی load همچنان فعال می‌ماند) */
const HANG_TIMEOUT_MS = 12_000;

/** href صفحه‌ی تأیید اینماد را از خودِ کد استخراج می‌کند (بدون تغییر کد) */
function extractVerifyHref(html: string): string | null {
  const match = /href\s*=\s*["']([^"']+)["']/i.exec(html);
  return match?.[1] ?? null;
}

export function EnamadSeal({
  html,
  /** سقف ارتفاع لوگو — فوتر سایت ۴.۵rem، پیش‌نمایش پنل ۵rem */
  maxImgClass = "[&_img]:max-h-[4.5rem]",
  /** در پنل مدیر، توضیح خطای بارگذاری نیز نمایش داده می‌شود */
  showNote = false,
}: {
  html: string;
  maxImgClass?: string;
  showNote?: boolean;
}) {
  const rawRef = React.useRef<HTMLDivElement | null>(null);
  const [state, setState] = React.useState<SealState>("loading");

  const verifyHref = React.useMemo(() => extractVerifyHref(html), [html]);

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
      {/* کد رسمی اینماد — عیناً و بدون تغییر */}
      <div
        ref={rawRef}
        className={`flex items-center justify-center [&_img]:h-auto [&_img]:w-auto ${maxImgClass}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* تا رسیدن تصویر از سرور اینماد، جای لوگو خالی نمی‌ماند */}
      {state === "loading" ? (
        <span
          aria-hidden="true"
          className="flex size-[4.5rem] animate-pulse items-center justify-center rounded-xl border border-dashed border-teal-500/40 bg-teal-500/[0.06] dark:border-teal-400/40 dark:bg-teal-400/[0.08]"
          title="در حال دریافت لوگوی اینماد…"
        >
          <ShieldCheck
            className="size-7 text-teal-600/70 dark:text-teal-300/70"
            strokeWidth={1.7}
          />
        </span>
      ) : null}

      {/* تصویر از سرور اینماد دریافت نشد — نشان جایگزین با پیوند تأیید */}
      {state === "error" ? (
        <div className="flex flex-col items-center gap-1.5">
          {verifyHref ? (
            <a
              href={verifyHref}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 items-center gap-1.5 rounded-full border border-teal-600/30 bg-teal-500/[0.07] px-3.5 text-[0.65rem] font-bold text-teal-700 transition-colors hover:bg-teal-500/15 dark:border-teal-400/30 dark:bg-teal-400/[0.08] dark:text-teal-300 dark:hover:bg-teal-400/[0.15]"
              title="نمایش صفحه‌ی تأیید نماد اعتماد الکترونیکی"
            >
              <ShieldCheck className="size-4" strokeWidth={2} />
              نماد اعتماد الکترونیکی
              <ExternalLink className="size-3" strokeWidth={2} />
            </a>
          ) : (
            <span className="flex h-9 items-center gap-1.5 rounded-full border border-teal-600/30 bg-teal-500/[0.07] px-3.5 text-[0.65rem] font-bold text-teal-700 dark:border-teal-400/30 dark:bg-teal-400/[0.08] dark:text-teal-300">
              <ShieldCheck className="size-4" strokeWidth={2} />
              نماد اعتماد الکترونیکی
            </span>
          )}
          {showNote ? (
            <p className="max-w-md text-center text-[0.62rem] leading-5 text-muted-foreground">
              تصویر لوگو در این لحظه از سرورهای اینماد دریافت نشد — کد عیناً
              ذخیره شده و در فوتر سایت درج می‌شود. در محیط پیش‌نمایش، هنگام
              قطعی اینترنت یا با فعال بودن مسدودکننده‌ی تبلیغات، تصویر
              بارگذاری نمی‌شود؛ روی سایت اصلی با اینترنت عادی، لوگوی اینماد
              نمایش داده می‌شود.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
