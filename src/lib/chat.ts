import { createHmac, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { ChatSettings } from "@prisma/client";
import { db } from "@/lib/db";

/** نام کوکی شناسایی بازدیدکننده‌ی چت */
export const CHAT_VISITOR_COOKIE = "avid_chat_vid";
/** عمر کوکی بازدیدکننده: یک سال */
export const CHAT_VISITOR_TTL_S = 60 * 60 * 24 * 365;

/** حداکثر طول پیام چت */
export const CHAT_MESSAGE_MAX = 2000;

/** مقادیر مجاز نحوه‌ی نمایش تصویر پروفایل چت‌بات */
export type ChatAvatarMode = "circle" | "custom";

/** اعتبارسنجی مقدار حالت نمایش آواتار (نامعتبر → دایره‌ای) */
export function parseChatAvatarMode(v: unknown): ChatAvatarMode {
  return v === "custom" ? "custom" : "circle";
}

/** فرمت عمومی تنظیمات چت که برای بازدیدکننده ارسال می‌شود */
export interface PublicChatSettings {
  botName: string;
  botTitle: string;
  botAvatar: string;
  botAvatarMode: ChatAvatarMode;
  welcomeMessage: string;
  autoOpen: boolean;
  /** ثانیه‌های نمایش حباب خوش‌آمدگویی تا مخفی‌شدن خودکار (۰ = بدون) */
  welcomeAutoHideSeconds: number;
  isActive: boolean;
}

/** خواندن (یا ساخت) رکورد یگانه‌ی تنظیمات چت */
export async function getChatSettings(): Promise<ChatSettings> {
  const existing = await db.chatSettings.findUnique({ where: { id: "main" } });
  if (existing) return existing;
  return db.chatSettings.create({ data: { id: "main" } }).catch(() =>
    // در حالت همزمانی، رکورد توسط درخواست دیگری ساخته شده است
    db.chatSettings.findUniqueOrThrow({ where: { id: "main" } })
  );
}

/** تبدیل به فرم عمومی (بدون فیلدهای داخلی) */
export function toPublicChatSettings(s: ChatSettings): PublicChatSettings {
  return {
    botName: s.botName,
    botTitle: s.botTitle,
    botAvatar: s.botAvatar,
    botAvatarMode: parseChatAvatarMode(s.botAvatarMode),
    welcomeMessage: s.welcomeMessage,
    autoOpen: s.autoOpen,
    welcomeAutoHideSeconds: s.welcomeAutoHideSeconds ?? CHAT_WELCOME_AUTOHIDE_DEFAULT,
    isActive: s.isActive,
  };
}

/** سقف و کف مخفی‌شدن خودکار حباب خوش‌آمدگویی (ثانیه) — ۰ = بدون مخفی‌شدن */
export const CHAT_WELCOME_AUTOHIDE_MIN = 0;
export const CHAT_WELCOME_AUTOHIDE_MAX = 300;
/** مقدار پیش‌فرض پیشنهادی (ثانیه) */
export const CHAT_WELCOME_AUTOHIDE_DEFAULT = 7;

/**
 * اعتبارسنجی ثانیه‌های مخفی‌شدن خودکار حباب خوش‌آمدگویی —
 * نامعتبر/خالی = null (فراخواننده به پیش‌فرض/مقدار قبلی برمی‌گردد)
 */
export function parseChatWelcomeAutoHideSeconds(
  v: unknown
): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const r = Math.round(v);
    return r >= CHAT_WELCOME_AUTOHIDE_MIN &&
      r <= CHAT_WELCOME_AUTOHIDE_MAX
      ? r
      : null;
  }
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.trim());
    if (!Number.isFinite(n)) return null;
    const r = Math.round(n);
    return r >= CHAT_WELCOME_AUTOHIDE_MIN &&
      r <= CHAT_WELCOME_AUTOHIDE_MAX
      ? r
      : null;
  }
  return null;
}

/** اعتبارسنجی محتوای پیام چت */
export function parseChatMessage(
  body: unknown
): { content: string } | { error: string } {
  const content =
    typeof (body as { content?: unknown })?.content === "string"
      ? ((body as { content: string }).content ?? "").trim()
      : "";
  if (!content) return { error: "متن پیام را وارد کنید." };
  if (content.length > CHAT_MESSAGE_MAX)
    return { error: "پیام خیلی طولانی است (حداکثر ۲۰۰۰ کاراکتر)." };
  return { content };
}

/**
 * توکن بازدیدکننده را از کوکی می‌خواند؛
 * اگر وجود نداشت توکن جدید تولید می‌کند تا در پاسخ ست شود.
 */
export function readVisitorToken(req: NextRequest): {
  token: string;
  isNew: boolean;
} {
  const existing = req.cookies.get(CHAT_VISITOR_COOKIE)?.value;
  if (existing && /^[a-f0-9]{24,64}$/.test(existing)) {
    return { token: existing, isNew: false };
  }
  return { token: randomBytes(24).toString("hex"), isNew: true };
}

/** ست کردن کوکی بازدیدکننده روی پاسخ (secure = استقرار HTTPS از طریق پروکسی) */
export function attachVisitorCookie(
  res: NextResponse,
  token: string,
  secure = false
): void {
  res.cookies.set(CHAT_VISITOR_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: CHAT_VISITOR_TTL_S,
    path: "/",
  });
}

/* ---------------- تیکت عضویت گفتگو (احراز هویت سمت سرویس رله) ---------------- */

/**
 * کلید امضای تیکت‌ها — در استقرار باید با CHAT_AUTH_SECRET برای سرویس چت
 * (mini-services/chat-service) یکسان باشد تا تیکت‌ها در آن سمت تایید شوند.
 *
 * • production: باید از environment (compose/.env) تنظیم شود؛ بدون آن
 *   تیکتی صادر نمی‌شود (خطای واضح در لاگ) و عضویتِ کوکی‌محور باقی می‌ماند.
 * • توسعه: از .env ریشه پروژه خوانده می‌شود.
 * هیچ کلید ثابتِ جایگزینی در کد وجود ندارد.
 */
const CHAT_AUTH_SECRET = process.env.CHAT_AUTH_SECRET?.trim() ?? "";
if (process.env.NODE_ENV === "production" && !CHAT_AUTH_SECRET) {
  console.error(
    "CHAT_AUTH_SECRET is not set — chat membership tickets are disabled (set it in the deployment environment; see .env.example)"
  );
}
/** عمر تیکت عضویت: ۲۴ ساعت */
const CHAT_TICKET_TTL_MS = 1000 * 60 * 60 * 24;

/**
 * تیکت امضاشده (HMAC) برای عضویت بازدیدکننده در اتاق یک گفتگو.
 *
 * کوکی شناسایی بازدیدکننده httpOnly است و ممکن است «بعد از» برقراری اتصال
 * socket ست شود (اولین بازدید) — بنابراین API اصلی این تیکت را صادر می‌کند
 * تا عضویت در اتاق بدون وابستگی به کوکی handshake قابل اثبات باشد.
 *
 * بدون کلیدِ امضا null برگردانده می‌شود (تیکت صادر نمی‌شود).
 */
export function issueChatTicket(
  conversationId: string,
  visitorToken: string
): string | null {
  if (!CHAT_AUTH_SECRET) return null;
  const exp = Date.now() + CHAT_TICKET_TTL_MS;
  const payload = `v1|${conversationId}|${visitorToken}|${exp}`;
  const b64 = Buffer.from(payload, "utf8").toString("base64url");
  const sig = createHmac("sha256", CHAT_AUTH_SECRET).update(payload).digest("hex");
  return `${b64}.${sig}`;
}

/* ---------------- نمایش خوش‌آمدگویی: هر IP یک بار در شبانه‌روز ---------------- */

/** استخراج IP بازدیدکننده از هدرهای پروکسی (Caddy) */
export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "local";
}

/** روز تقویمی به وقت تهران (YYYY-MM-DD) — مرز «هر روز» بر اساس وقت ایران */
const tehranDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function tehranDay(d: Date): string {
  return tehranDayFmt.format(d);
}

/**
 * آیا حباب پیام خوش‌آمدگویی باید برای این IP نمایش داده شود؟
 * در کل سایت برای هر IP حداکثر یک بار در هر شبانه‌روز (به وقت تهران) مجاز است؛
 * در صورت مجاز بودن، نمایش بلافاصله ثبت می‌شود تا در صفحات بعدی همان روز تکرار نشود.
 */
export async function shouldShowWelcome(ip: string): Promise<boolean> {
  const now = new Date();
  const log = await db.chatWelcomeLog.findUnique({ where: { ip } });
  if (log && tehranDay(log.shownAt) === tehranDay(now)) return false;
  await db.chatWelcomeLog.upsert({
    where: { ip },
    update: { shownAt: now },
    create: { ip, shownAt: now },
  });
  return true;
}

/* ---------------- محدودسازی نرخ ارسال (در حافظه) ---------------- */

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_MESSAGES = 30;
const rateBuckets = new Map<string, number[]>();

/** آیا این توکن در پنجره‌ی فعلی مجاز به ارسال است؟ */
export function checkRateLimit(token: string): boolean {
  const now = Date.now();
  const bucket = (rateBuckets.get(token) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS
  );
  if (bucket.length >= RATE_MAX_MESSAGES) {
    rateBuckets.set(token, bucket);
    return false;
  }
  bucket.push(now);
  rateBuckets.set(token, bucket);
  return true;
}

/* ---------------- محدودسازی نرخ ارسال مدیر ---------------- */

const ADMIN_RATE_MAX = 60;
const adminBuckets = new Map<string, number[]>();

export function checkAdminRateLimit(adminId: string): boolean {
  const now = Date.now();
  const bucket = (adminBuckets.get(adminId) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS
  );
  if (bucket.length >= ADMIN_RATE_MAX) {
    adminBuckets.set(adminId, bucket);
    return false;
  }
  bucket.push(now);
  adminBuckets.set(adminId, bucket);
  return true;
}
