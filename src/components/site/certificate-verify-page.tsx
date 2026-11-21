"use client";

import * as React from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Award,
  Download,
  FileSearch,
  FileText,
  FolderOpen,
  GraduationCap,
  IdCard,
  Loader2,
  LogIn,
  Mail,
  Phone,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { SiteSettings } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { faDate, faDigits } from "@/lib/fa";
import {
  isValidNationalId,
  NATIONAL_ID_INVALID_MESSAGE,
  normalizeNationalId,
  toEnDigits,
} from "@/lib/national-id";
import {
  CertificatePdfSheet,
  type PdfCertificate,
} from "@/components/site/certificate-pdf-sheet";
import { downloadCertificatePdf } from "@/lib/certificate-pdf";

/* ————————————————— انواع و ثابت‌ها ————————————————— */

/** گواهی‌نامه در پاسخ عمومی استعلام */
export interface PublicCertificate {
  id: string;
  code: string;
  courseTitle: string;
  grade: number | null;
  note: string;
  fileUrl: string;
  issuedAt: string;
}

interface VerifyOk {
  ok: true;
  user: { firstName: string; lastName: string };
  certificates: PublicCertificate[];
}

type Phase = "idle" | "searching" | "success" | "failure";

/** مدت نمایش روکش جستجو (۳ ثانیه) و تأخیر ظهور لیست پس از موفقیت */
const SEARCH_MS = 3000;
const REVEAL_MS = 1500;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** نوع فایل گواهی‌نامه از روی آدرس — pdf | image | none */
function fileKindOf(url: string): "pdf" | "image" | "none" {
  const clean = (url ?? "").trim().split("?")[0];
  if (!clean) return "none";
  return /\.pdf$/i.test(clean) ? "pdf" : "image";
}

/** معدل با ارقام فارسی — ۱۸٫۵ / ۱۹٫۲۵ / ۱۸ */
function faGrade(g: number): string {
  const dec = g % 1 === 0 ? 0 : (g * 10) % 1 === 0 ? 1 : 2;
  return faDigits(g.toFixed(dec)).replace(".", "٫");
}

/* الگوی کاشی‌های «پرونده» برای مسیرهای پس‌زمینه‌ی روکش جستجو */
const LANE_TILE: { icon: LucideIcon; tone: string }[] = [
  { icon: FileText, tone: "text-teal-500/70 dark:text-teal-300/60" },
  { icon: FolderOpen, tone: "text-amber-500/70 dark:text-amber-300/60" },
  { icon: FileText, tone: "text-muted-foreground/50" },
  { icon: FileText, tone: "text-teal-500/60 dark:text-teal-300/50" },
  { icon: FolderOpen, tone: "text-muted-foreground/40" },
  { icon: FileText, tone: "text-amber-500/60 dark:text-amber-300/50" },
  { icon: FileText, tone: "text-muted-foreground/50" },
  { icon: FolderOpen, tone: "text-teal-500/60 dark:text-teal-300/50" },
  { icon: FileText, tone: "text-amber-500/70 dark:text-amber-300/60" },
  { icon: FileText, tone: "text-muted-foreground/40" },
  { icon: FolderOpen, tone: "text-teal-500/70 dark:text-teal-300/60" },
  { icon: FileText, tone: "text-muted-foreground/50" },
];

/** دو نوار متحرک پرونده‌ها در پس‌زمینه‌ی روکش */
const LANES: {
  pos: React.CSSProperties;
  duration: number;
  opacity: number;
  blur: number;
  size: number;
  gap: number;
}[] = [
  { pos: { top: "11%" }, duration: 19, opacity: 0.09, blur: 2.5, size: 74, gap: 96 },
  { pos: { bottom: "8%" }, duration: 13, opacity: 0.16, blur: 0, size: 54, gap: 62 },
];

/** پرونده‌های شناور پیرامون ذره‌بین مرکزی */
const ORBIT_TILES: {
  x: number;
  y: number;
  icon: LucideIcon;
  delay: number;
}[] = [
  { x: -104, y: -58, icon: FolderOpen, delay: 0 },
  { x: 104, y: -72, icon: FileText, delay: 0.4 },
  { x: -90, y: 62, icon: FileText, delay: 0.8 },
  { x: 98, y: 60, icon: FolderOpen, delay: 1.1 },
  { x: 2, y: -112, icon: FileText, delay: 0.6 },
];

/* ————————————————— صفحه‌ی اصلی ————————————————— */

/**
 * CertificateVerifyPage — استعلام عمومی گواهی‌نامه با کد ملی.
 *
 * بدون نیاز به ورود: کد ملی ۱۰ رقمی گرفته می‌شود، روکش «جستجوی پرونده‌ها»
 * ۳ ثانیه نمایش داده می‌شود، سپس استعلام انجام و نتیجه با انیمیشن
 * سبز/قرمز اعلام می‌گردد. گواهی‌نامه‌ها با دکمه‌ی دانلود (فایل آپلودی یا
 * ساخت PDF سیستمی) نمایش داده می‌شوند.
 */
export function CertificateVerifyPage({
  settings,
}: {
  settings: SiteSettings;
}) {
  const [logoFailed, setLogoFailed] = React.useState(false);
  const [nationalId, setNationalId] = React.useState("");
  const [inputError, setInputError] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [result, setResult] = React.useState<VerifyOk | null>(null);
  const [revealList, setRevealList] = React.useState(false);
  const [pdfFor, setPdfFor] = React.useState<PublicCertificate | null>(null);
  const [pdfBusyId, setPdfBusyId] = React.useState<string | null>(null);

  const sheetRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const revealTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    },
    []
  );

  /** فقط رقم (لاتین/فارسی) — حداکثر ۱۰ رقم */
  function sanitizeInput(v: string) {
    return toEnDigits(v).replace(/\D/g, "").slice(0, 10);
  }

  function reset() {
    setPhase("idle");
    setResult(null);
    setRevealList(false);
    setNationalId("");
    setInputError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (phase === "searching") return;

    const clean = normalizeNationalId(nationalId);
    if (!isValidNationalId(clean)) {
      setInputError(NATIONAL_ID_INVALID_MESSAGE);
      inputRef.current?.focus();
      return;
    }

    setInputError(null);
    setResult(null);
    setRevealList(false);
    setPhase("searching");

    // — روکش جستجو کامل ۳ ثانیه نمایش داده می‌شود؛ سپس استعلام انجام می‌شود —
    await sleep(SEARCH_MS);

    let json: VerifyOk | { ok: false; reason?: string } | null = null;
    let networkFailed = false;
    try {
      const res = await fetch("/api/certificate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nationalId: clean }),
      });
      if (res.status === 400) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setPhase("idle");
        setInputError(data.error ?? NATIONAL_ID_INVALID_MESSAGE);
        inputRef.current?.focus();
        return;
      }
      if (!res.ok) throw new Error("server-error");
      json = (await res.json()) as VerifyOk | { ok: false; reason?: string };
    } catch {
      networkFailed = true;
    }

    if (networkFailed || !json) {
      setPhase("idle");
      toast.error("خطا در برقراری ارتباط با سرور؛ لطفاً دوباره تلاش کنید.");
      return;
    }

    if (json.ok === true) {
      setResult(json);
      setPhase("success");
      if (revealTimer.current) clearTimeout(revealTimer.current);
      revealTimer.current = setTimeout(() => setRevealList(true), REVEAL_MS);
    } else {
      setPhase("failure");
    }
  }

  /** ساخت فایل PDF برگه‌ی سیستمی برای گواهی‌نامه‌ی بدون فایل آپلودی */
  async function handleDownloadPdf(cert: PublicCertificate) {
    if (pdfBusyId) return;
    setPdfBusyId(cert.id);
    setPdfFor(cert);
    try {
      await sleep(220); // رندر برگه‌ی پنهان
      const el = sheetRef.current;
      if (!el) throw new Error("sheet-not-mounted");
      await downloadCertificatePdf(el, `گواهینامه-${cert.code}`);
      toast.success("فایل PDF گواهی‌نامه ساخته و دانلود شد.", {
        description: `کد رهگیری ${cert.code}`,
      });
    } catch {
      toast.error(
        "ساخت فایل PDF گواهی‌نامه با خطا مواجه شد؛ دوباره تلاش کنید."
      );
    } finally {
      setPdfBusyId(null);
      setPdfFor(null);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-background">
      {/* پس‌زمینه‌ی تزئینی نرم — بریده‌شده تا اسکرول شبحایی ایجاد نکند */}
      <div className="pointer-events-none absolute inset-0 -z-[1] overflow-hidden">
        <div className="absolute -top-32 right-1/4 size-[26rem] rounded-full bg-teal-500/[0.08] blur-[130px] dark:bg-teal-400/[0.06]" />
        <div className="absolute top-1/3 -left-32 size-[22rem] rounded-full bg-amber-500/[0.06] blur-[130px] dark:bg-amber-400/[0.05]" />
        <div className="absolute -bottom-40 left-1/4 size-[26rem] rounded-full bg-violet-500/[0.07] blur-[130px] dark:bg-violet-400/[0.05]" />
      </div>

      {/* هدر مینیمال — هم‌الکان صفحه‌ی ثبت‌نام */}
      <header className="px-4 pt-5">
        <nav className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-3 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] px-4 backdrop-blur-md md:px-6 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <a href="/" className="flex items-center gap-3" aria-label="بازگشت به صفحه اصلی">
            {settings.logoUrl && !logoFailed ? (
              <Image
                src={settings.logoUrl}
                alt={settings.siteName}
                width={44}
                height={44}
                onError={() => setLogoFailed(true)}
                className="size-11 rounded-2xl border border-foreground/10 bg-background object-cover shadow-lg"
              />
            ) : (
              <span className="relative flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/25">
                <GraduationCap className="size-6 text-teal-950" strokeWidth={2.2} />
                <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-violet-400 shadow shadow-violet-500/40">
                  <Sparkles className="size-2 text-violet-950" />
                </span>
              </span>
            )}
            <span className="leading-tight">
              <span className="block text-lg font-black tracking-tight text-foreground">
                {settings.siteName}
              </span>
              <span className="block text-[0.65rem] font-medium text-muted-foreground">
                استعلام گواهی‌نامه‌ها
              </span>
            </span>
          </a>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              asChild
              variant="outline"
              className="hidden h-10 rounded-xl border-foreground/[0.12] bg-foreground/[0.04] px-4 text-sm font-bold text-foreground transition-colors hover:border-teal-500/40 hover:text-teal-700 sm:inline-flex dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-teal-400/40 dark:hover:text-teal-200"
            >
              <a href="/">
                <ArrowRight className="size-4" />
                بازگشت به سایت
              </a>
            </Button>
          </div>
        </nav>
      </header>

      {/* محتوای اصلی */}
      <main className="flex flex-1 items-center justify-center px-4 py-10 md:py-14">
        <div className="w-full max-w-2xl">
          {/* سربرگ صفحه */}
          <motion.div
            className="mb-8 text-center"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
              <ShieldCheck className="size-3.5" />
              استعلام رسمی گواهی‌نامه‌ها
            </span>
            <h1 className="mt-4 text-3xl font-black leading-[1.3] tracking-tight text-foreground md:text-4xl">
              استعلام <span className="text-gradient">گواهی‌نامه</span>
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-muted-foreground">
              کد ملی ۱۰ رقمی دارنده‌ی گواهی‌نامه را وارد کنید تا اصالت
              گواهی‌نامه‌های صادرشده در آکادمی بررسی شود — بدون نیاز به ورود
              به حساب کاربری.
            </p>
          </motion.div>

          {/* فرم استعلام */}
          <motion.form
            noValidate
            onSubmit={handleSubmit}
            className="glass rounded-3xl border border-foreground/[0.07] p-5 shadow-2xl shadow-black/[0.05] sm:p-7 dark:border-white/[0.07]"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
          >
            <Label
              htmlFor="nationalId"
              className="flex items-center gap-2 text-sm font-bold text-foreground/90"
            >
              <IdCard className="size-4 text-teal-600 dark:text-teal-300" />
              کد ملی دارنده‌ی گواهی‌نامه
            </Label>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="nationalId"
                ref={inputRef}
                dir="ltr"
                inputMode="numeric"
                autoComplete="off"
                value={nationalId}
                onChange={(e) => {
                  setNationalId(sanitizeInput(e.target.value));
                  if (inputError) setInputError(null);
                }}
                placeholder="1234567891"
                aria-invalid={!!inputError}
                aria-describedby={inputError ? "nationalId-error" : "nationalId-hint"}
                disabled={phase === "searching"}
                className="h-14 rounded-2xl border-foreground/[0.09] bg-foreground/[0.02] pr-10 text-center text-lg font-black tracking-[0.35em] tabular-nums placeholder:text-muted-foreground/45 focus-visible:ring-teal-500/30 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:focus-visible:ring-teal-400/40"
              />
            </div>

            <AnimatePresence initial={false}>
              {inputError ? (
                <motion.p
                  key="input-error"
                  id="nationalId-error"
                  role="alert"
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: "auto", marginTop: 8 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  className="overflow-hidden text-xs font-bold leading-5 text-red-600 dark:text-red-300"
                >
                  {inputError}
                </motion.p>
              ) : (
                <motion.p
                  key="input-hint"
                  id="nationalId-hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-2 text-[0.65rem] font-bold leading-5 text-muted-foreground"
                >
                  کد ملی ۱۰ رقمی — برای بررسی اصالت گواهی‌نامه‌های ثبت‌شده در
                  سامانه
                </motion.p>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              disabled={phase === "searching"}
              className="mt-4 h-13 w-full rounded-2xl bg-gradient-to-l from-teal-400 to-emerald-500 px-5 text-sm font-black text-teal-950 shadow-lg shadow-teal-500/25 transition-all hover:scale-[1.01] disabled:opacity-60 dark:text-teal-950"
            >
              <Search className="size-4" />
              استعلام گواهی‌نامه
            </Button>

            <p className="mt-3 text-center text-[0.6rem] leading-5 text-muted-foreground">
              اطلاعات واردشده صرفاً برای بررسی اصالت گواهی‌نامه استفاده می‌شود.
            </p>
          </motion.form>

          {/* نشان‌های اعتماد — فقط در حالت اولیه */}
          <AnimatePresence>
            {phase === "idle" ? (
              <motion.div
                key="trust"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, delay: 0.15 }}
                className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3"
              >
                {[
                  { icon: LogIn, label: "بدون نیاز به ورود به حساب" },
                  { icon: Zap, label: "بررسی آنی اصالت" },
                  { icon: Download, label: "دانلود فایل گواهی‌نامه" },
                ].map((t) => (
                  <div
                    key={t.label}
                    className="glass flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-[0.7rem] font-bold text-muted-foreground"
                  >
                    <t.icon className="size-4 text-teal-600 dark:text-teal-300" />
                    {t.label}
                  </div>
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* ناحیه‌ی نتیجه */}
          <div className="mt-6 space-y-5">
            <AnimatePresence mode="wait">
              {phase === "failure" ? (
                <FailureCard key="failure" onRetry={reset} />
              ) : phase === "success" && result ? (
                <SuccessBlock
                  key="success"
                  result={result}
                  revealed={revealList}
                  onReset={reset}
                  onDownloadPdf={handleDownloadPdf}
                  pdfBusyId={pdfBusyId}
                />
              ) : null}
            </AnimatePresence>
          </div>

          {/* اطلاعات تماس */}
          <div className="mt-8 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground sm:flex-row sm:gap-6">
            <a
              href={`tel:${settings.contactPhone}`}
              className="flex items-center gap-1.5 transition-colors hover:text-teal-600 dark:hover:text-teal-300"
            >
              <Phone className="size-3.5" />
              {faDigits(settings.contactPhone)}
            </a>
            <span className="hidden h-3 w-px bg-foreground/10 sm:block dark:bg-white/10" />
            <a
              href={`mailto:${settings.contactEmail}`}
              className="flex items-center gap-1.5 transition-colors hover:text-teal-600 dark:hover:text-teal-300"
            >
              <Mail className="size-3.5" />
              {settings.contactEmail}
            </a>
          </div>
        </div>
      </main>

      {/* فوتر باریک چسبیده به پایین — با فاصله‌ی امن تا منوی موبایلیِ پایین صفحه */}
      <footer className="mt-auto border-t border-foreground/[0.06] py-5 text-center text-xs font-bold text-muted-foreground md:mb-0 dark:border-white/[0.06] max-md:mb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]">
        © {faDigits(1404)} آکادمی {settings.siteName} — استعلام رسمی گواهی‌نامه‌ها
        با کد ملی
      </footer>

      {/* برگه‌ی PDF پنهان — خارج از دید برای html2canvas */}
      {pdfFor && result ? (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            top: 0,
            left: "-2400px",
            width: 1123,
            pointerEvents: "none",
          }}
        >
          <div ref={sheetRef}>
            <CertificatePdfSheet
              cert={pdfFor satisfies PdfCertificate}
              settings={settings}
              userName={`${result.user.firstName} ${result.user.lastName}`}
            />
          </div>
        </div>
      ) : null}

      {/* روکش جستجوی پرونده‌ها — پس‌زمینه‌ی تمام‌صفحه */}
      <AnimatePresence>
        {phase === "searching" ? (
          <SearchingOverlay
            key="searching"
            code={normalizeNationalId(nationalId)}
            siteName={settings.siteName}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ————————————————— روکش جستجوی پرونده‌ها ————————————————— */

/**
 * SearchingOverlay — روکش پس‌زمینه‌ی «جستجو میان پرونده‌ها»:
 * دو نوار پرونده‌ی متحرک در پس‌زمینه + ذره‌بین مداری در مرکز +
 * نوار پیشرفت ۳ ثانیه‌ای؛ پس از پایان، نتیجه جایگزین می‌شود.
 */
function SearchingOverlay({
  code,
  siteName,
}: {
  code: string;
  siteName: string;
}) {
  return (
    <motion.div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-background/85 backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.45 } }}
      transition={{ duration: 0.3 }}
    >
      {/* — نوارهای پرونده‌ی متحرک (پس‌زمینه) — */}
      {LANES.map((lane, li) => (
        <div
          key={li}
          aria-hidden
          className="pointer-events-none absolute left-0 right-0"
          style={{
            ...lane.pos,
            opacity: lane.opacity,
            filter: lane.blur ? `blur(${lane.blur}px)` : undefined,
          }}
        >
          <motion.div
            className="flex w-max"
            animate={{ x: ["0%", "-50%"] }}
            transition={{
              duration: lane.duration,
              repeat: Infinity,
              ease: "linear",
            }}
          >
            {[0, 1].map((copy) => (
              <div
                key={copy}
                className="flex"
                style={{ gap: lane.gap, paddingRight: lane.gap }}
              >
                {LANE_TILE.map((tile, i) => (
                  <span
                    key={i}
                    className={cn(
                      "flex items-center justify-center rounded-xl border border-foreground/[0.08] bg-foreground/[0.04] dark:border-white/[0.08] dark:bg-white/[0.04]",
                      tile.tone
                    )}
                    style={{ width: lane.size, height: lane.size }}
                  >
                    <tile.icon
                      style={{
                        width: lane.size * 0.42,
                        height: lane.size * 0.42,
                      }}
                      strokeWidth={1.6}
                    />
                  </span>
                ))}
              </div>
            ))}
          </motion.div>
        </div>
      ))}

      {/* — ترکیب مرکزی: ذره‌بین میان پرونده‌ها — */}
      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        <div className="relative mb-7" style={{ width: 230, height: 230 }}>
          {/* حلقه‌ی چرخان خط‌چین */}
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-dashed border-teal-500/45 dark:border-teal-400/40"
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          />
          {/* دایره‌ی مرکزی شیشه‌ای با ذره‌بین */}
          <motion.div
            className="absolute inset-[26px] flex items-center justify-center rounded-full border border-teal-500/40 bg-card/80 shadow-2xl shadow-teal-500/25 dark:border-teal-400/35"
            animate={{ scale: [1, 1.045, 1] }}
            transition={{ duration: 1.7, repeat: Infinity, ease: "easeInOut" }}
          >
            <FileSearch
              className="size-14 text-teal-600 dark:text-teal-300"
              strokeWidth={1.7}
            />
          </motion.div>
          {/* نقاط مداری */}
          <motion.div
            aria-hidden
            className="absolute inset-0"
            animate={{ rotate: -360 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          >
            <span className="absolute left-1/2 top-0 size-3 -translate-x-1/2 rounded-full bg-teal-500 shadow shadow-teal-500/60" />
            <span className="absolute left-1/2 bottom-0 size-2 -translate-x-1/2 rounded-full bg-amber-400 shadow shadow-amber-400/60" />
          </motion.div>
          {/* پرونده‌های شناور پیرامون ذره‌بین */}
          {ORBIT_TILES.map((t, i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute flex size-10 items-center justify-center rounded-xl border border-foreground/[0.09] bg-card/90 text-teal-600 shadow-lg dark:border-white/[0.09] dark:text-teal-300"
              style={{
                left: "50%",
                top: "50%",
                marginLeft: -20 + t.x,
                marginTop: -20 + t.y,
              }}
              animate={{ y: [-7, 7, -7] }}
              transition={{
                duration: 3.6,
                repeat: Infinity,
                ease: "easeInOut",
                delay: t.delay,
              }}
            >
              <t.icon className="size-5" strokeWidth={1.7} />
            </motion.span>
          ))}
        </div>

        <h2 className="flex items-center gap-1 text-lg font-black text-foreground sm:text-xl">
          در حال جستجو در پرونده‌ها
          <span className="flex w-5 items-center justify-start gap-1 ps-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="size-1.5 rounded-full bg-teal-500"
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </span>
        </h2>

        <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
          کد ملی:
          <span
            dir="ltr"
            className="rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 font-black tabular-nums tracking-[0.2em] text-foreground dark:border-white/10 dark:bg-white/[0.04]"
          >
            {faDigits(code)}
          </span>
        </p>

        {/* نوار پیشرفت — دقیقاً ۳ ثانیه */}
        <div className="mt-5 h-1.5 w-56 overflow-hidden rounded-full bg-foreground/10 sm:w-64 dark:bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-l from-teal-400 to-emerald-500"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: SEARCH_MS / 1000, ease: "easeInOut" }}
          />
        </div>
        <p className="mt-3 text-[0.65rem] font-bold text-muted-foreground">
          در حال بررسی آرشیو گواهی‌نامه‌های آکادمی {siteName} — لطفاً چند لحظه
          صبر کنید
        </p>
      </div>
    </motion.div>
  );
}

/* ————————————————— نتیجه‌ی ناموفق (قرمز) ————————————————— */

/** FailureCard — انیمیشن قرمز «گواهی‌نامه‌ای یافت نشد» */
function FailureCard({ onRetry }: { onRetry: () => void }) {
  const burst = React.useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        return {
          x: Math.cos(angle) * (78 + (i % 3) * 24),
          y: Math.sin(angle) * (78 + (i % 3) * 24),
        };
      }),
    []
  );

  return (
    <motion.section
      key="failure"
      role="alert"
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, transition: { duration: 0.25 } }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className="relative overflow-hidden rounded-3xl border-2 border-red-500/40 bg-gradient-to-br from-red-500/[0.09] via-background to-rose-500/[0.06] p-6 text-center shadow-xl shadow-red-500/10 sm:p-8 dark:border-red-400/35"
    >
      {/* خط تزئینی بالای کارت */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-red-500 to-rose-400"
      />
      {/* ذرات قرمزِ پراکنده */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        {burst.map((b, i) => (
          <motion.span
            key={i}
            className="absolute size-1.5 rounded-full bg-red-500"
            initial={{ opacity: 0, x: 0, y: 0 }}
            animate={{ opacity: [0, 0.9, 0], x: b.x, y: b.y }}
            transition={{ duration: 0.85, delay: 0.15, ease: "easeOut" }}
          />
        ))}
      </div>

      {/* علامت ضربدر با انیمیشن کشیده‌شدن خطوط */}
      <motion.span
        className="mx-auto mb-4 flex size-20 items-center justify-center rounded-full border-2 border-red-500/50 bg-red-500/15 text-red-600 dark:text-red-300"
        animate={{ x: [0, -9, 9, -5, 5, 0] }}
        transition={{ duration: 0.5, delay: 0.25 }}
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-10" aria-hidden>
          <motion.path
            d="M7 7 L17 17"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.28, delay: 0.15, ease: "easeOut" }}
          />
          <motion.path
            d="M17 7 L7 17"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.28, delay: 0.38, ease: "easeOut" }}
          />
        </svg>
      </motion.span>

      <h2 className="text-lg font-black text-red-600 dark:text-red-300 sm:text-xl">
        گواهی‌نامه‌ای یافت نشد
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm font-bold leading-7 text-red-700/90 dark:text-red-300/90">
        هیچ کاربری با این کد ملی دارای یک گواهی‌نامه معتبر نمی‌باشد.
      </p>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-6 text-muted-foreground">
        کد ملی واردشده در سامانه‌ی گواهی‌نامه‌های آکادمی، به نام کاربری با
        گواهی‌نامه‌ی معتبر ثبت نشده است.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
        <Button
          type="button"
          variant="outline"
          onClick={onRetry}
          className="h-11 rounded-2xl border-foreground/[0.12] bg-foreground/[0.04] px-5 text-sm font-bold text-foreground transition-colors hover:border-red-500/40 hover:text-red-600 dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-red-400/40 dark:hover:text-red-300"
        >
          <RotateCcw className="size-4" />
          استعلام مجدد
        </Button>
      </div>
    </motion.section>
  );
}

/* ————————————————— نتیجه‌ی موفق (سبز) + لیست ————————————————— */

/** SuccessBlock — انیمیشن سبز موفقیت و سپس لیست گواهی‌نامه‌ها با دانلود */
function SuccessBlock({
  result,
  revealed,
  onReset,
  onDownloadPdf,
  pdfBusyId,
}: {
  result: VerifyOk;
  revealed: boolean;
  onReset: () => void;
  onDownloadPdf: (cert: PublicCertificate) => void;
  pdfBusyId: string | null;
}) {
  const confetti = React.useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        x: (Math.random() * 2 - 1) * 190,
        y: -(Math.random() * 120 + 36),
        r: Math.random() * 360,
        round: i % 3 === 0,
        color: ["#10B981", "#14B8A6", "#F59E0B", "#8B5CF6", "#F43F5E"][i % 5],
        delay: 0.12 + Math.random() * 0.18,
      })),
    []
  );

  return (
    <>
      <motion.section
        key="success-card"
        role="status"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, transition: { duration: 0.25 } }}
        transition={{ type: "spring", stiffness: 240, damping: 23 }}
        className="relative overflow-hidden rounded-3xl border-2 border-emerald-500/45 bg-gradient-to-br from-emerald-500/[0.10] via-background to-teal-500/[0.07] p-6 text-center shadow-xl shadow-emerald-500/10 sm:p-8 dark:border-emerald-400/40"
      >
        {/* خط تزئینی بالای کارت */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-emerald-500 via-teal-400 to-emerald-500"
        />
        {/* کانفتی جشن */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-20 flex h-0 items-center justify-center"
        >
          {confetti.map((c, i) => (
            <motion.span
              key={i}
              className="absolute"
              style={{
                width: 8,
                height: 8,
                background: c.color,
                borderRadius: c.round ? "9999px" : "2px",
              }}
              initial={{ opacity: 0, x: 0, y: 0, rotate: 0 }}
              animate={{
                opacity: [0, 1, 0],
                x: c.x,
                y: [0, c.y, c.y + 46],
                rotate: c.r,
              }}
              transition={{ duration: 1.5, delay: c.delay, ease: "easeOut" }}
            />
          ))}
        </div>

        {/* تیک سبز با انیمیشن کشیده‌شدن */}
        <span className="relative mx-auto mb-4 flex size-20 items-center justify-center rounded-full border-2 border-emerald-500/50 bg-emerald-500/15">
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border border-emerald-500/40"
            animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.3 }}
          />
          <svg viewBox="0 0 24 24" fill="none" className="size-10" aria-hidden>
            <motion.path
              d="M5 12.5 L10 17.5 L19 7"
              stroke="#10B981"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.25, ease: "easeOut" }}
            />
          </svg>
        </span>

        <h2 className="text-lg font-black text-emerald-600 dark:text-emerald-300 sm:text-xl">
          استعلام گواهی‌نامه با موفقیت انجام شد.
        </h2>
        <p className="mt-2 text-sm font-bold leading-7 text-foreground/85">
          {result.user.firstName} {result.user.lastName} در سامانه‌ی آکادمی
          دارای{" "}
          <span className="text-emerald-600 dark:text-emerald-300">
            {faDigits(result.certificates.length)}
          </span>{" "}
          گواهی‌نامه‌ی معتبر است.
        </p>
      </motion.section>

      {/* لیست گواهی‌نامه‌ها — با تأخیر کوتاه پس از انیمیشن موفقیت */}
      <AnimatePresence>
        {revealed ? (
          <motion.div
            key="cert-list"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ type: "spring", stiffness: 200, damping: 26 }}
            className="space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-base font-black text-foreground sm:text-lg">
                <Award className="size-5 text-amber-500 dark:text-amber-300" />
                گواهی‌نامه‌های {result.user.firstName}{" "}
                {result.user.lastName}
              </h3>
              <div className="flex items-center gap-2">
                <span className="select-none rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[0.6rem] font-black text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
                  {faDigits(result.certificates.length)} گواهی‌نامه
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onReset}
                  className="h-8 rounded-xl px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground dark:hover:bg-white/[0.05]"
                >
                  <RotateCcw className="size-3.5" />
                  استعلام جدید
                </Button>
              </div>
            </div>

            {result.certificates.map((cert, i) => (
              <CertCard
                key={cert.id}
                cert={cert}
                index={i}
                onDownloadPdf={onDownloadPdf}
                pdfBusyId={pdfBusyId}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/** کارت یک گواهی‌نامه — جزئیات + دکمه‌ی دانلود (فایل یا ساخت PDF) */
function CertCard({
  cert,
  index,
  onDownloadPdf,
  pdfBusyId,
}: {
  cert: PublicCertificate;
  index: number;
  onDownloadPdf: (cert: PublicCertificate) => void;
  pdfBusyId: string | null;
}) {
  const kind = fileKindOf(cert.fileUrl);
  const busy = pdfBusyId === cert.id;

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: 0.1 + index * 0.09,
        type: "spring",
        stiffness: 210,
        damping: 24,
      }}
      className="rounded-3xl border border-foreground/[0.08] bg-card/85 p-4 shadow-xl shadow-black/[0.04] backdrop-blur-xl sm:p-6 dark:border-white/[0.08] dark:bg-[#08110e]/70"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/[0.07] pb-3 dark:border-white/[0.07]">
        <h4 className="flex min-w-0 items-center gap-2.5 text-base font-black leading-7 text-foreground">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/25">
            <Award className="size-5 text-amber-950" strokeWidth={2.2} />
          </span>
          <span className="truncate">
            گواهی‌نامه‌ی دوره‌ی «{cert.courseTitle}»
          </span>
        </h4>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[0.65rem] font-black text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300">
          <ShieldCheck className="size-3" />
          معتبر
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-bold text-muted-foreground">
        <span
          dir="ltr"
          className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-black tracking-[0.18em] text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300"
        >
          {cert.code}
        </span>
        <span>تاریخ صدور: {faDate(cert.issuedAt)}</span>
        {cert.grade !== null && cert.grade !== undefined ? (
          <span
            className={cn(
              "tabular-nums",
              cert.grade >= 17
                ? "text-emerald-600 dark:text-emerald-300"
                : cert.grade >= 10
                  ? "text-teal-600 dark:text-teal-300"
                  : "text-amber-600 dark:text-amber-300"
            )}
          >
            معدل: {faGrade(cert.grade)} از {faDigits(20)}
          </span>
        ) : null}
      </div>

      {cert.note ? (
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          {cert.note}
        </p>
      ) : null}

      <div className="mt-4">
        {kind === "none" ? (
          <Button
            type="button"
            onClick={() => onDownloadPdf(cert)}
            disabled={busy}
            className="h-12 w-full rounded-2xl bg-gradient-to-l from-amber-400 to-orange-500 px-5 text-sm font-black text-amber-950 shadow-lg shadow-amber-500/25 transition-all hover:scale-[1.01] disabled:opacity-70"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                در حال ساخت فایل PDF…
              </>
            ) : (
              <>
                <Download className="size-4" />
                دانلود فایل گواهی‌نامه (PDF)
              </>
            )}
          </Button>
        ) : (
          <Button
            asChild
            className="h-12 w-full rounded-2xl bg-gradient-to-l from-amber-400 to-orange-500 px-5 text-sm font-black text-amber-950 shadow-lg shadow-amber-500/25 transition-all hover:scale-[1.01]"
          >
            <a
              href={cert.fileUrl}
              download={`گواهینامه-${cert.code}`}
              aria-label={`دانلود فایل گواهی‌نامه ${cert.courseTitle}`}
            >
              <Download className="size-4" />
              دانلود فایل گواهی‌نامه
            </a>
          </Button>
        )}
      </div>
    </motion.article>
  );
}
