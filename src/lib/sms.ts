import { db } from "@/lib/db";
import type { SmsSettings } from "@prisma/client";

/**
 * ارسال پیامک — یکپارچه‌سازی با ملی پیامک (Melipayamak)
 *
 * دو روش اتصال پشتیبانی می‌شود (از تنظیمات پنل مدیریت، رکورد یگانه‌ی SmsSettings):
 *  • rest    → وب‌سرویس REST (rest.payamak-panel.com) با «نام کاربری/رمز» یا «کلید API»
 *  • console → کنسول ملی پیامک (console.melipayamak.com) با کلید API کنسول
 *  • none    → حالت نمایشی: پیامکی ارسال نمی‌شود و کد OTP در پاسخ API برمی‌گردد
 *
 * هیچ‌کدام از توابع این ماژول استثنا پرتاب نمی‌کنند؛ همیشه SmsSendResult
 * برمی‌گردانند تا جریان ثبت‌نام هرگز به‌خاطر قطعی سرویس پیامک متوقف نشود.
 *
 * پس از هر ارسال واقعی (موفق یا ناموفق) یک رکورد SmsLog برای عیب‌یابی
 * و گزارش‌گیری مدیر ثبت می‌شود؛ ارسال‌های نمایشی ثبت نمی‌شوند.
 */

export interface SmsSendResult {
  /** آیا پیامک به مخابرات تحویل شد؟ */
  delivered: boolean;
  provider: "rest" | "console" | "none";
  /** شناسه‌ی رسالت ملی پیامک (Value) */
  recId?: string;
  /** پاسخ خام سرویس (کوتاه‌شده تا ۳۰۰ نویسه) برای عیب‌یابی */
  response: string;
  /** پیام خطای فارسی در صورت عدم تحویل */
  error?: string;
}

/** نوع ارسال — برای ثبت در گزارش SmsLog */
export type SmsKind = "manual" | "otp" | "test" | "system";

/* ------------------------------------------------------------------ */
/*                    تنظیمات (رکورد یگانه + کش ۱۰ ثانیه‌ای)           */
/* ------------------------------------------------------------------ */

const SMS_SETTINGS_TTL_MS = 10_000; // کش حافظه‌ای برای پرهیز از کوئری DB در هر ارسال

let smsSettingsCache: { value: SmsSettings; at: number } | null = null;

/** دریافت (و در صورت نبود، ایجاد) تنظیمات یکتای پیامک */
export async function getSmsSettings(): Promise<SmsSettings> {
  if (
    smsSettingsCache &&
    Date.now() - smsSettingsCache.at < SMS_SETTINGS_TTL_MS
  ) {
    return smsSettingsCache.value;
  }
  const settings = await db.smsSettings.upsert({
    where: { id: "main" },
    create: {},
    update: {},
  });
  smsSettingsCache = { value: settings, at: Date.now() };
  return settings;
}

/** باطل‌کردن کش تنظیمات — پس از ذخیره‌ی تنظیمات جدید از پنل مدیر */
export function invalidateSmsSettingsCache(): void {
  smsSettingsCache = null;
}

/* ------------------------------------------------------------------ */
/*                        اعتبارسنجی و ابزارها                         */
/* ------------------------------------------------------------------ */

/** آیا اعتبار وب‌سرویس REST در دسترس است؟ (کلید API یا نام کاربری/رمز) */
function hasRestCredentials(s: SmsSettings): boolean {
  return !!s.apiKey || (!!s.username && !!s.password);
}

/** آیا سرویس پیامکی واقعاً پیکربندی شده است؟ (بدون آن → حالت نمایشی) */
export function isSmsConfigured(s: SmsSettings): boolean {
  if (s.provider === "rest") {
    return hasRestCredentials(s) && !!s.fromNumber;
  }
  if (s.provider === "console") {
    return !!s.consoleApiKey && !!s.fromNumber;
  }
  return false;
}

/** پاک‌سازی شماره موبایل: حذف فاصله/خط تیره و یکسان‌سازی پیش‌شماره‌ی کشور */
function normalizePhone(phone: string): string {
  let p = phone.replace(/[\s-]/g, "").trim();
  if (p.startsWith("+98")) p = `0${p.slice(3)}`;
  else if (p.startsWith("98") && p.length === 12) p = `0${p.slice(2)}`;
  return p;
}

/** کوتاه‌کردن رشته برای ذخیره/گزارش */
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

/** پیام خطای فارسی برای کدهای RetStatus وب‌سرویس REST ملی پیامک */
const REST_ERROR_MESSAGES: Record<string, string> = {
  "2": "اعتبار حساب پیامکی کافی نیست.",
  "3": "محدودیت ارسال در روزِ جاری رسیده است.",
  "5": "شماره‌ی گیرنده نامعتبر است.",
  "6": "شماره‌ی خط فرستنده نامعتبر است.",
  "7": "متن پیامک نامعتبر است.",
  "8": "متن پیامک شامل کلمات فیلترشده است.",
  "9": "ارسال در این بازه‌ی ساعتی مجاز نیست.",
  "10": "حساب پیامکی فعال نیست.",
  "11": "نام کاربری یا رمز عبور اشتباه است.",
  "12": "حساب کاربری غیرفعال است.",
  "13": "اعتبار حساب کافی نیست.",
  "14": "فرمان ارسال غیرمعتبر است.",
  "15": "شماره‌ی فرستنده معتبر نیست.",
  "16": "شماره‌ی گیرنده یا متن پیام نامعتبر است.",
  "17": "متن پیامک نامعتبر است.",
  "18": "تعداد گیرندگان بیش از حد مجاز است.",
  "19": "امکان ارسال به این شماره وجود ندارد.",
  "20": "شماره‌ی گیرنده نامعتبر است.",
  "22": "شماره‌ی فرستنده (خط اختیاری) معتبر نیست.",
  "100": "پارامترهای ارسالی به سرویس ناقص است.",
};

function restErrorMessage(
  retStatus: string,
  strRetStatus: unknown
): string {
  const mapped = REST_ERROR_MESSAGES[retStatus];
  if (mapped) return mapped;
  const raw = typeof strRetStatus === "string" ? strRetStatus.trim() : "";
  if (raw) return `سرویس پیامک پیام را نپذیرفت: ${truncate(raw, 120)}`;
  return `سرویس پیامک پیام را نپذیرفت (کد وضعیت: ${retStatus || "نامشخص"}).`;
}

/** ثبت گزارش ارسال در SmsLog — هرگز استثنا پرتاب نمی‌کند */
async function logSms(entry: {
  phone: string;
  text: string;
  kind: SmsKind;
  provider: "rest" | "console";
  delivered: boolean;
  recId?: string;
  response: string;
}): Promise<void> {
  try {
    await db.smsLog.create({
      data: {
        phone: entry.phone,
        text: truncate(entry.text, 500),
        kind: entry.kind,
        provider: entry.provider,
        status: entry.delivered ? "sent" : "failed",
        recId: entry.recId ?? "",
        response: truncate(entry.response, 300),
      },
    });
  } catch (error) {
    console.error("sms log error:", error);
  }
}

/* ------------------------------------------------------------------ */
/*                     وب‌سرویس REST ملی پیامک                          */
/* ------------------------------------------------------------------ */

const REST_SEND_URL = "https://rest.payamak-panel.com/api/SendSMS/SendSMS";
const REST_PATTERN_URL =
  "https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber";

interface RestResponse {
  Value?: unknown;
  RetStatus?: unknown;
  StrRetStatus?: unknown;
}

/** ارسال ساده از طریق REST — پاسخ {Value, RetStatus, StrRetStatus} */
async function sendViaRest(
  settings: SmsSettings,
  to: string,
  text: string,
  kind: SmsKind
): Promise<SmsSendResult> {
  const useApiKey = !!settings.apiKey;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (useApiKey) headers["X-API-KEY"] = settings.apiKey;

  const body = useApiKey
    ? { to, from: settings.fromNumber, text, isFlash: false }
    : {
        username: settings.username,
        password: settings.password,
        to,
        from: settings.fromNumber,
        text,
        isFlash: false,
      };

  try {
    const res = await fetch(REST_SEND_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const responseText = await res.text();

    let json: RestResponse | null = null;
    try {
      json = JSON.parse(responseText) as RestResponse;
    } catch {
      json = null;
    }

    const retStatus = json?.RetStatus;
    const delivered = retStatus === 1 || retStatus === "1";
    const rawValue = json?.Value;
    const recId =
      rawValue !== undefined && rawValue !== null && String(rawValue) !== ""
        ? String(rawValue)
        : undefined;

    const result: SmsSendResult = {
      delivered,
      provider: "rest",
      ...(recId !== undefined ? { recId } : {}),
      response: truncate(responseText, 300),
    };
    if (!delivered) {
      result.error = restErrorMessage(String(retStatus ?? ""), json?.StrRetStatus);
    }

    await logSms({
      phone: to,
      text,
      kind,
      provider: "rest",
      delivered,
      ...(recId !== undefined ? { recId } : {}),
      response: responseText,
    });
    return result;
  } catch (error) {
    // خطای شبکه/مهلت زمانی — هرگز استثنا بیرون نمی‌رود
    const message = error instanceof Error ? error.message : String(error);
    const result: SmsSendResult = {
      delivered: false,
      provider: "rest",
      response: "",
      error: `خطا در ارتباط با وب‌سرویس ملی پیامک: ${truncate(message, 120)}`,
    };
    await logSms({
      phone: to,
      text,
      kind,
      provider: "rest",
      delivered: false,
      response: "",
    });
    return result;
  }
}

/** ارسال با پترن خدماتی (BaseServiceNumber) — متن فقط کد است */
async function sendRestPattern(
  settings: SmsSettings,
  to: string,
  bodyId: string,
  code: string
): Promise<SmsSendResult> {
  const useApiKey = !!settings.apiKey;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (useApiKey) headers["X-API-KEY"] = settings.apiKey;

  const body = useApiKey
    ? { to, bodyId, text: code }
    : {
        username: settings.username,
        password: settings.password,
        to,
        bodyId,
        text: code,
      };

  try {
    const res = await fetch(REST_PATTERN_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const responseText = await res.text();

    let json: RestResponse | null = null;
    try {
      json = JSON.parse(responseText) as RestResponse;
    } catch {
      json = null;
    }

    const retStatus = json?.RetStatus;
    const delivered = retStatus === 1 || retStatus === "1";
    const rawValue = json?.Value;
    const recId =
      rawValue !== undefined && rawValue !== null && String(rawValue) !== ""
        ? String(rawValue)
        : undefined;

    const result: SmsSendResult = {
      delivered,
      provider: "rest",
      ...(recId !== undefined ? { recId } : {}),
      response: truncate(responseText, 300),
    };
    if (!delivered) {
      result.error = restErrorMessage(String(retStatus ?? ""), json?.StrRetStatus);
    }

    await logSms({
      phone: to,
      text: code,
      kind: "otp",
      provider: "rest",
      delivered,
      ...(recId !== undefined ? { recId } : {}),
      response: responseText,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: SmsSendResult = {
      delivered: false,
      provider: "rest",
      response: "",
      error: `خطا در ارتباط با وب‌سرویس ملی پیامک (ارسال پترن): ${truncate(message, 120)}`,
    };
    await logSms({
      phone: to,
      text: code,
      kind: "otp",
      provider: "rest",
      delivered: false,
      response: "",
    });
    return result;
  }
}

/* ------------------------------------------------------------------ */
/*                       کنسول ملی پیامک                               */
/* ------------------------------------------------------------------ */

const CONSOLE_SEND_URL = "https://console.melipayamak.com/api/send/simple/";

/** ارسال ساده از طریق کنسول — پاسخ 2xx یعنی تحویل موفق */
async function sendViaConsole(
  settings: SmsSettings,
  to: string,
  text: string,
  kind: SmsKind
): Promise<SmsSendResult> {
  try {
    const res = await fetch(CONSOLE_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.consoleApiKey}`,
      },
      body: JSON.stringify({ from: settings.fromNumber, to, text }),
      signal: AbortSignal.timeout(15_000),
    });
    const responseText = await res.text();

    // استخراج شناسه‌ی رسالت از ساختارهای رایج پاسخ کنسول
    let recId: string | undefined;
    try {
      const json = JSON.parse(responseText) as {
        data?: { recId?: unknown; messageId?: unknown; id?: unknown };
        Value?: unknown;
      };
      const candidate =
        json?.data?.recId ?? json?.data?.messageId ?? json?.data?.id ?? json?.Value;
      if (
        candidate !== undefined &&
        candidate !== null &&
        String(candidate) !== ""
      ) {
        recId = String(candidate);
      }
    } catch {
      // پاسخ غیر JSON — مهم نیست؛ وضعیت HTTP ملاک است
    }

    const delivered = res.ok;
    const result: SmsSendResult = {
      delivered,
      provider: "console",
      ...(recId !== undefined ? { recId } : {}),
      response: truncate(responseText, 300),
    };
    if (!delivered) {
      result.error = `کنسول ملی پیامک پیام را نپذیرفت (کد HTTP ${res.status}).`;
    }

    await logSms({
      phone: to,
      text,
      kind,
      provider: "console",
      delivered,
      ...(recId !== undefined ? { recId } : {}),
      response: responseText,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: SmsSendResult = {
      delivered: false,
      provider: "console",
      response: "",
      error: `خطا در ارتباط با کنسول ملی پیامک: ${truncate(message, 120)}`,
    };
    await logSms({
      phone: to,
      text,
      kind,
      provider: "console",
      delivered: false,
      response: "",
    });
    return result;
  }
}

/* ------------------------------------------------------------------ */
/*                          API عمومی ارسال                            */
/* ------------------------------------------------------------------ */

/** نتیجه‌ی حالت نمایشی — سرویس پیامکی متصل نیست */
function demoResult(): SmsSendResult {
  return {
    delivered: false,
    provider: "none",
    response: "حالت نمایشی — سرویس پیامکی متصل نیست",
  };
}

/**
 * ارسال پیامک متنی (ساده) — امضای تنظیم‌شده در پایان متن افزوده می‌شود.
 * هرگز استثنا پرتاب نمی‌کند.
 */
export async function sendSms(
  phone: string,
  text: string,
  kind: SmsKind = "manual"
): Promise<SmsSendResult> {
  try {
    const settings = await getSmsSettings();

    // — بدون سرویس متصل: حالت نمایشی —
    if (!isSmsConfigured(settings)) {
      console.log(`[SMS demo] → ${phone}: ${text}`);
      return demoResult();
    }

    const to = normalizePhone(phone);
    const finalText = settings.signature
      ? `${text}\n${settings.signature}`
      : text;

    if (settings.provider === "rest") {
      return await sendViaRest(settings, to, finalText, kind);
    }
    return await sendViaConsole(settings, to, finalText, kind);
  } catch (error) {
    // تضمین نهایی: هرگز استثنا بیرون نمی‌رود
    console.error("sms send error:", error);
    return {
      delivered: false,
      provider: "none",
      response: "",
      error: "خطای غیرمنتظره در ارسال پیامک.",
    };
  }
}

/**
 * ارسال کد تایید (OTP) — در صورت تنظیم پترن خدماتی از همان مسیر
 * استفاده می‌شود؛ در غیر این صورت پیامک متنی استاندارد.
 */
export async function sendOtpSms(
  phone: string,
  code: string
): Promise<SmsSendResult> {
  try {
    const settings = await getSmsSettings();
    const to = normalizePhone(phone);

    // — مسیر ۱: پترن خدماتی REST (BaseServiceNumber) —
    if (
      settings.provider === "rest" &&
      settings.otpBodyId &&
      hasRestCredentials(settings)
    ) {
      return await sendRestPattern(settings, to, settings.otpBodyId, code);
    }

    // — مسیر ۲: ارسال متنی ساده (rest یا console) —
    if (isSmsConfigured(settings)) {
      return await sendSms(
        phone,
        `آوید | کد تایید شما: ${code}\nاین کد ۵ دقیقه معتبر است.`,
        "otp"
      );
    }

    // — مسیر ۳: حالت نمایشی — کد در پاسخ API برگردانده می‌شود —
    console.log(
      `[SMS demo] → ${phone}: آوید | کد تایید شما: ${code}\nاین کد ۵ دقیقه معتبر است.`
    );
    return demoResult();
  } catch (error) {
    console.error("otp sms send error:", error);
    return {
      delivered: false,
      provider: "none",
      response: "",
      error: "خطای غیرمنتظره در ارسال کد تایید.",
    };
  }
}
