import { db } from "@/lib/db";
import type { SmsSettings } from "@prisma/client";

/**
 * ارسال پیامک — یکپارچه‌سازی با ملی پیامک (Melipayamak)
 *
 * پیاده‌سازی دقیقاً بر اساس مستندات رسمی ملی پیامک:
 *  • وب‌سرویس REST  → docs.payamak-panel.com (rest.payamak-panel.com)
 *    - همه‌ی متدها POST با Content-Type: application/json; charset=utf-8
 *    - احراز هویت: username + password داخل بدنه‌ی JSON
 *      (طبق مستندات رسمی، مقدار password همان «کلید API» است که در بخش
 *      تنظیمات وب‌سرویس پنل تولید می‌شود و جایگزین رمز عبور می‌شود)
 *    - پاسخ: { Value, RetStatus, StrRetStatus } — موفقیت = RetStatus ۱
 *      و Value حاوی شناسه‌ی رسالت (recId)؛ کدهای خطا در Value برمی‌گردند
 *    - متد اختصاصی OTP: /api/SendSMS/SendOTP (ارسال سریع بدون تایید متن)
 *  • کنسول ملی پیامک → console.melipayamak.com (REST بر پایه‌ی توکن)
 *    - توکن داخل مسیر URL قرار می‌گیرد: /api/send/simple/{token}
 *      (فراخوانی بدون توکن در مسیر، خطای HTTP 405 برمی‌گرداند)
 *    - بدنه‌ی JSON: { from, to, text } — گیرنده به‌صورت رشته‌ی تکی
 *    - پترن خدماتی: /api/send/shared/{token} با { to, bodyId, args }
 *  • none → حالت نمایشی: پیامکی ارسال نمی‌شود و کد OTP در پاسخ API برمی‌گردد
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
  /** شناسه‌ی رسالت ملی پیامک (Value / recId) */
  recId?: string;
  /** پاسخ خام سرویس (کوتاه‌شده تا ۳۰۰ نویسه) برای عیب‌یابی */
  response: string;
  /** پیام خطای فارسی در صورت عدم تحویل */
  error?: string;
}

/** نوع ارسال — برای ثبت در گزارش SmsLog */
export type SmsKind = "manual" | "otp" | "test" | "system";

/** متن پیامک OTP (بدون امضا — مسیر OTP از خط مجاز پیش‌تاییدشده ارسال می‌شود) */
const OTP_TEXT = (code: string) =>
  `آوید | کد تایید شما: ${code}\nاین کد ۵ دقیقه معتبر است.`;

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

/**
 * اعتبارنامه‌های وب‌سرویس REST — طبق مستندات رسمی:
 * username همیشه الزامی است و password همان رمز عبور پنل یا «کلید API»
 * تولیدشده در بخش تنظیمات وب‌سرویس (کلید API جایگزین رمز عبور می‌شود).
 */
function restCredentials(
  s: SmsSettings
): { username: string; password: string } | null {
  const username = s.username.trim();
  const password = s.password.trim() || s.apiKey.trim();
  return username && password ? { username, password } : null;
}

/** آیا سرویس پیامکی واقعاً پیکربندی شده است؟ (بدون آن → حالت نمایشی) */
export function isSmsConfigured(s: SmsSettings): boolean {
  if (s.provider === "rest") {
    return restCredentials(s) !== null && !!s.fromNumber.trim();
  }
  if (s.provider === "console") {
    return !!s.consoleApiKey.trim() && !!s.fromNumber.trim();
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
const REST_OTP_URL = "https://rest.payamak-panel.com/api/SendSMS/SendOTP";
const REST_PATTERN_URL =
  "https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber";

interface RestResponse {
  Value?: unknown;
  RetStatus?: unknown;
  StrRetStatus?: unknown;
}

/**
 * پیام خطای فارسی برای کدهای بازگشتی وب‌سرویس REST ملی پیامک.
 * طبق مستندات رسمی، کدهای خطا در فیلد Value برمی‌گردند (و RetStatus
 * وضعیت کلی را نشان می‌دهد؛ ۱ = موفق، ۳۵ = داده نامعتبر).
 */
const REST_ERROR_MESSAGES: Record<string, string> = {
  "0": "نام کاربری یا رمز عبور (کلید API) صحیح نیست.",
  "2": "اعتبار حساب پیامکی کافی نیست.",
  "3": "محدودیت ارسال روزانه تکمیل شده است.",
  "4": "محدودیت حجم ارسال رعایت نشده است.",
  "5": "شماره‌ی خط فرستنده معتبر نیست.",
  "6": "ارسال از این خط مجاز نیست یا سامانه در حال به‌روزرسانی است.",
  "7": "متن پیامک حاوی کلمه‌ی فیلترشده است.",
  "8": "متن پیامک حاوی کلمات فیلترشده است.",
  "9": "ارسال از خطوط عمومی از طریق وب‌سرویس امکان‌پذیر نیست.",
  "10": "حساب کاربری فعال نیست.",
  "11": "ارسال پیامک انجام نشد.",
  "12": "مدارک کاربر کامل نیست.",
  "14": "متن پیامک حاوی لینک است.",
  "15": "عبارت «لغو11» در انتهای متن پیامک وجود ندارد.",
  "16": "شماره‌ی گیرنده‌ای یافت نشد.",
  "17": "متن پیامک خالی است.",
  "18": "شماره‌ی موبایل معتبر نیست.",
  "19": "سقف ارسال روزانه‌ی API تکمیل شده است.",
  "20": "شماره‌ی گیرنده نامعتبر است.",
  "22": "شماره‌ی خط فرستنده (خط اختیاری) معتبر نیست.",
  "35": "داده‌ی ارسالی نامعتبر است؛ نام کاربری/رمز و قالب پارامترها را بررسی کنید.",
  "100": "پارامترهای ارسالی به سرویس ناقص است.",
  "-1": "داده‌ی ارسالی نامعتبر است یا دسترسی وب‌سرویس غیرفعال است.",
  "-2": "در هر فراخوانی فقط یک شماره موبایل قابل ارسال است.",
  "-3": "خط ارسال در سیستم تعریف نشده است.",
  "-4": "شناسه‌ی متن خدماتی (پترن) صحیح نیست یا هنوز تأیید نشده است.",
  "-5": "متن ارسالی با متغیرهای پترن همخوانی ندارد.",
  "-6": "خطای داخلی سامانه رخ داده است.",
  "-10": "ارسال لینک در متغیرهای پترن مجاز نیست.",
  "-100": "خطای داخلی یا پارامتر نامعتبر؛ در صورت تکرار با پشتیبانی تماس بگیرید.",
  "-108": "IP سرور شما به دلیل تلاش‌های ناموفق مسدود شده است.",
  "-109": "ابتدا IP مجاز سرور را در تنظیمات وب‌سرویس پنل ثبت کنید.",
  "-110": "استفاده از کلید API به جای رمز عبور الزامی است.",
  "-111": "IP درخواست‌کننده مجاز نیست.",
  "-112": "دسترسی وب‌سرویس برای این حساب غیرفعال است.",
};

/** ساخت پیام خطای REST — اولویت: کد Value، سپس RetStatus، سپس متن خام */
function restError(json: RestResponse | null, responseText: string): string {
  const valueStr =
    json?.Value !== undefined && json?.Value !== null
      ? String(json.Value)
      : "";
  const retStr =
    json?.RetStatus !== undefined && json?.RetStatus !== null
      ? String(json.RetStatus)
      : "";

  const byValue = REST_ERROR_MESSAGES[valueStr];
  if (byValue) return byValue;
  const byRet = REST_ERROR_MESSAGES[retStr];
  if (byRet) return byRet;

  const raw =
    typeof json?.StrRetStatus === "string" ? json.StrRetStatus.trim() : "";
  if (raw) return `سرویس پیامک پیام را نپذیرفت: ${truncate(raw, 120)}`;
  return `سرویس پیامک پیام را نپذیرفت (پاسخ خام: ${truncate(responseText, 120) || "بدون پاسخ"}).`;
}

/**
 * تحلیل پاسخ REST — موفقیت یعنی RetStatus = 1 و Value حاوی شناسه‌ی
 * رسالت (عددی مثبت) باشد؛ در غیر این صورت کد خطا از Value خوانده می‌شود.
 */
function parseRestResponse(responseText: string): {
  delivered: boolean;
  recId?: string;
  error?: string;
} {
  let json: RestResponse | null = null;
  try {
    json = JSON.parse(responseText) as RestResponse;
  } catch {
    json = null;
  }

  const retStatus = json?.RetStatus;
  const retOk = retStatus === 1 || retStatus === "1";
  const rawValue = json?.Value;
  const valueStr =
    rawValue !== undefined && rawValue !== null ? String(rawValue) : "";
  const valueNum = Number(valueStr);

  // موفقیت: RetStatus=1 و Value یک شناسه‌ی رسالت معتبر است
  // (عددی مثبت — کدهای خطا یا ۰/منفی‌اند یا در جدول خطاها هستند)
  const valueIsRecId =
    valueStr !== "" &&
    (Number.isFinite(valueNum) ? valueNum > 0 : !/^-?\d+$/.test(valueStr));

  if (retOk && valueIsRecId) {
    return { delivered: true, recId: valueStr };
  }
  return { delivered: false, error: restError(json, responseText) };
}

/** POST امن به وب‌سرویس REST با بدنه‌ی JSON و مهلت ۱۵ ثانیه */
async function restPost(
  url: string,
  body: Record<string, unknown>
): Promise<{ responseText: string; networkError?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    return { responseText: await res.text() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { responseText: "", networkError: truncate(message, 120) };
  }
}

/** ثبت نتیجه در SmsLog و ساخت SmsSendResult برای مسیر REST */
async function finishRest(params: {
  to: string;
  text: string;
  kind: SmsKind;
  responseText: string;
  networkError?: string;
}): Promise<SmsSendResult> {
  if (params.networkError) {
    const result: SmsSendResult = {
      delivered: false,
      provider: "rest",
      response: "",
      error: `خطا در ارتباط با وب‌سرویس ملی پیامک: ${params.networkError}`,
    };
    await logSms({
      phone: params.to,
      text: params.text,
      kind: params.kind,
      provider: "rest",
      delivered: false,
      response: "",
    });
    return result;
  }

  const parsed = parseRestResponse(params.responseText);
  const result: SmsSendResult = {
    delivered: parsed.delivered,
    provider: "rest",
    ...(parsed.recId !== undefined ? { recId: parsed.recId } : {}),
    response: truncate(params.responseText, 300),
    ...(parsed.error !== undefined ? { error: parsed.error } : {}),
  };
  await logSms({
    phone: params.to,
    text: params.text,
    kind: params.kind,
    provider: "rest",
    delivered: parsed.delivered,
    ...(parsed.recId !== undefined ? { recId: parsed.recId } : {}),
    response: params.responseText,
  });
  return result;
}

/**
 * ارسال ساده از طریق REST — POST /api/SendSMS/SendSMS
 * بدنه: { username, password, to, from, text, isflash }
 */
async function sendViaRest(
  settings: SmsSettings,
  to: string,
  text: string,
  kind: SmsKind
): Promise<SmsSendResult> {
  const creds = restCredentials(settings);
  if (!creds) {
    return {
      delivered: false,
      provider: "rest",
      response: "",
      error: "نام کاربری و رمز عبور (یا کلید API) وب‌سرویس تنظیم نشده است.",
    };
  }

  const { responseText, networkError } = await restPost(REST_SEND_URL, {
    username: creds.username,
    password: creds.password,
    to,
    from: settings.fromNumber,
    text,
    isflash: false,
  });
  return finishRest({ to, text, kind, responseText, networkError });
}

/**
 * ارسال کد یک‌بارمصرف از طریق متد رسمی OTP — POST /api/SendSMS/SendOTP
 * بدنه: { username, password, to, from, code } — ارسال سریع بدون تایید متن
 */
async function sendRestOtp(
  settings: SmsSettings,
  to: string,
  code: string
): Promise<SmsSendResult> {
  const creds = restCredentials(settings);
  if (!creds) {
    return {
      delivered: false,
      provider: "rest",
      response: "",
      error: "نام کاربری و رمز عبور (یا کلید API) وب‌سرویس تنظیم نشده است.",
    };
  }

  const { responseText, networkError } = await restPost(REST_OTP_URL, {
    username: creds.username,
    password: creds.password,
    to,
    from: settings.fromNumber,
    code,
  });
  return finishRest({
    to,
    text: `کد تایید: ${code}`,
    kind: "otp",
    responseText,
    networkError,
  });
}

/**
 * ارسال با پترن خدماتی — POST /api/SendSMS/BaseServiceNumber
 * بدنه: { username, password, text, to, bodyId } — text فقط متغیرهای پترن است
 */
async function sendRestPattern(
  settings: SmsSettings,
  to: string,
  bodyId: string,
  code: string
): Promise<SmsSendResult> {
  const creds = restCredentials(settings);
  if (!creds) {
    return {
      delivered: false,
      provider: "rest",
      response: "",
      error: "نام کاربری و رمز عبور (یا کلید API) وب‌سرویس تنظیم نشده است.",
    };
  }

  const { responseText, networkError } = await restPost(REST_PATTERN_URL, {
    username: creds.username,
    password: creds.password,
    text: code,
    to,
    bodyId: Number(bodyId),
  });
  return finishRest({
    to,
    text: `پترن ${bodyId}: ${code}`,
    kind: "otp",
    responseText,
    networkError,
  });
}

/* ------------------------------------------------------------------ */
/*                       کنسول ملی پیامک                               */
/* ------------------------------------------------------------------ */

/**
 * توکن کنسول داخل «مسیر URL» قرار می‌گیرد (نه هدر Authorization).
 * فراخوانی بدون توکن در مسیر → خطای HTTP 405 (Method Not Allowed).
 */
const CONSOLE_SEND_URL = "https://console.melipayamak.com/api/send/simple";
const CONSOLE_SHARED_URL = "https://console.melipayamak.com/api/send/shared";

/** POST امن به کنسول ملی پیامک با مهلت ۱۵ ثانیه */
async function consolePost(
  url: string,
  token: string,
  body: Record<string, unknown>
): Promise<{ status: number; ok: boolean; responseText: string; networkError?: string }> {
  try {
    const res = await fetch(`${url}/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    return {
      status: res.status,
      ok: res.ok,
      responseText: await res.text(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 0,
      ok: false,
      responseText: "",
      networkError: truncate(message, 120),
    };
  }
}

/** پیام‌هایی که نشانه‌ی موفقیت‌اند (کنسول گاهی status متنی برمی‌گرداند) */
const CONSOLE_SUCCESS_RE = /موفق|ثبت شد|انجام شد|ارسال شد/;

/** ساختارهای رایج پاسخ موفق کنسول (recId سطح بالا یا داخل data) */
function consoleRecId(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  const j = json as {
    recId?: unknown;
    corId?: unknown;
    Value?: unknown;
    data?: { recId?: unknown; messageId?: unknown; id?: unknown };
  };
  const candidates = [
    j.recId,
    j.corId,
    j.data?.recId,
    j.data?.messageId,
    j.data?.id,
    j.Value,
  ];
  for (const c of candidates) {
    if (c !== undefined && c !== null && String(c) !== "") {
      return String(c);
    }
  }
  return undefined;
}

/** ثبت نتیجه در SmsLog و ساخت SmsSendResult برای مسیر کنسول */
async function finishConsole(params: {
  to: string;
  text: string;
  kind: SmsKind;
  status: number;
  ok: boolean;
  responseText: string;
  networkError?: string;
}): Promise<SmsSendResult> {
  let json: unknown = null;
  try {
    json = JSON.parse(params.responseText);
  } catch {
    json = null;
  }
  const recId = consoleRecId(json);

  // پیام متنی status — خطاها به‌صورت { "status": "..." } برمی‌گردند
  // (مثل «کلید کنسول معتبر نیست»)؛ پیام موفقیت هم ممکن است متنی باشد.
  const statusRaw =
    json && typeof json === "object"
      ? (json as { status?: unknown }).status
      : undefined;
  const statusMsg =
    typeof statusRaw === "string" ? statusRaw.trim() : "";

  let delivered: boolean;
  let error: string | undefined;

  if (params.networkError) {
    delivered = false;
    error = `خطا در ارتباط با کنسول ملی پیامک: ${params.networkError}`;
  } else if (!params.ok) {
    // خطای HTTP — مثل 400 کلید نامعتبر یا 405/404 مسیر اشتباه
    delivered = false;
    error =
      statusMsg ||
      `کنسول ملی پیامک پیام را نپذیرفت (کد HTTP ${params.status}).`;
  } else if (statusMsg && !CONSOLE_SUCCESS_RE.test(statusMsg)) {
    // پاسخ 2xx ولی status متنی خطا
    delivered = false;
    error = statusMsg;
  } else {
    delivered = true;
  }

  const result: SmsSendResult = {
    delivered,
    provider: "console",
    ...(recId !== undefined ? { recId } : {}),
    response: truncate(params.responseText, 300),
    ...(error !== undefined ? { error } : {}),
  };
  await logSms({
    phone: params.to,
    text: params.text,
    kind: params.kind,
    provider: "console",
    delivered,
    ...(recId !== undefined ? { recId } : {}),
    response: params.responseText,
  });
  return result;
}

/**
 * ارسال ساده از طریق کنسول — POST /api/send/simple/{token}
 * بدنه: { from, to, text } — گیرنده رشته‌ی تکی «09xxxxxxxxx»
 */
async function sendViaConsole(
  settings: SmsSettings,
  to: string,
  text: string,
  kind: SmsKind
): Promise<SmsSendResult> {
  const { status, ok, responseText, networkError } = await consolePost(
    CONSOLE_SEND_URL,
    settings.consoleApiKey.trim(),
    { from: settings.fromNumber, to, text }
  );
  return finishConsole({
    to,
    text,
    kind,
    status,
    ok,
    responseText,
    networkError,
  });
}

/**
 * ارسال پترن خدماتی از طریق کنسول — POST /api/send/shared/{token}
 * بدنه: { to, bodyId, args: [...] } — args آرایه‌ی متغیرهای پترن است
 */
async function sendConsoleShared(
  settings: SmsSettings,
  to: string,
  bodyId: string,
  args: string[]
): Promise<SmsSendResult> {
  const { status, ok, responseText, networkError } = await consolePost(
    CONSOLE_SHARED_URL,
    settings.consoleApiKey.trim(),
    { to, bodyId: Number(bodyId), args }
  );
  return finishConsole({
    to,
    text: `پترن ${bodyId}: ${args.join(" | ")}`,
    kind: "otp",
    status,
    ok,
    responseText,
    networkError,
  });
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
 * ارسال کد تایید (OTP) — مسیر رسمی ملی پیامک:
 *  ۱) اگر پترن خدماتی (otpBodyId) تنظیم شده → ارسال با پترن
 *     (REST: BaseServiceNumber / کنسول: shared)
 *  ۲) وگرنه REST → متد اختصاصی SendOTP (سریع، بدون تایید متن)
 *  ۳) وگرنه کنسول → ارسال ساده با متن کامل کد
 *  ۴) بدون سرویس متصل → حالت نمایشی (کد در پاسخ API برمی‌گردد)
 */
export async function sendOtpSms(
  phone: string,
  code: string
): Promise<SmsSendResult> {
  try {
    const settings = await getSmsSettings();
    const to = normalizePhone(phone);
    const bodyId = settings.otpBodyId.trim();

    if (settings.provider === "rest") {
      if (restCredentials(settings) && settings.fromNumber) {
        if (bodyId) {
          return await sendRestPattern(settings, to, bodyId, code);
        }
        return await sendRestOtp(settings, to, code);
      }
    }

    if (
      settings.provider === "console" &&
      settings.consoleApiKey.trim() &&
      settings.fromNumber
    ) {
      if (bodyId) {
        return await sendConsoleShared(settings, to, bodyId, [code]);
      }
      return await sendViaConsole(settings, to, OTP_TEXT(code), "otp");
    }

    // — حالت نمایشی: کد در پاسخ API برگردانده می‌شود —
    console.log(`[SMS demo] → ${phone}: ${OTP_TEXT(code)}`);
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
