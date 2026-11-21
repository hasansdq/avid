import { toast } from "sonner";

/**
 * لایه ارتباط با API مدیریت —
 * همه‌ی درخواست‌ها از همین تابع عبور می‌کنند تا خطاها و ۴۰۱ یکدست مدیریت شوند.
 */

/** نام رویداد سراسری «دسترسی غیرمجاز» */
export const UNAUTHORIZED_EVENT = "avid:unauthorized";

/**
 * سقف زمان پیش‌فرض درخواست‌های مدیریت (۳۰ ثانیه) —
 * هیچ فراخوانی نباید بی‌پایان در حال انتظار بماند؛ اگر پاسخی نرسید
 * خطا می‌شود تا UI همیشه به حالت پایدار برمی‌گردد.
 * فراخواننده می‌تواند سیگنال خودش را بدهد تا این سقف را دور بزند.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/** مکث کوتاه پیش از تلاش مجدد خودکار درخواست‌های GET (میلی‌ثانیه) */
const RETRY_BACKOFF_MS = 400;

/**
 * سیگنال سقف زمان — سازگار با مرورگرهای بدون AbortSignal.timeout.
 * فراخوانی مستقیمِ AbortSignal.timeout در چنین مرورگرهایی «هم‌زمان با اجرا»
 * TypeError می‌اندازد؛ آن خطا داخل effect می‌افتد و هرگز به catchِ promise
 * نمی‌رسد — در نتیجه UI برای همیشه در «در حال بررسی» می‌ماند.
 */
export function timeoutSignal(ms: number): AbortSignal {
  if (
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.timeout === "function"
  ) {
    try {
      return AbortSignal.timeout(ms);
    } catch {
      /* بازگشت به پیاده‌سازی دستی */
    }
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/** خطای API همراه با وضعیت HTTP */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * خطای سطح شبکه / سقف زمان — رسیدن پاسخ HTTP ناموفق بود.
 *
 * پیام فارسیِ مشخص دارد تا کاربر (و ما) بتوانیم علت را تشخیص دهیم:
 *  • سقف زمان → «پاسخ سرور بیش از حد طول کشید…» (کم‌سرعت/سرعت پایین/سرور مشغول)
 *  • قطع شبکه → «ارتباط با سرور برقرار نشد…» (اینترنت/پروکسی/سرور خاموش)
 */
export class NetworkError extends Error {
  /** علت اصلی مرورگر (AbortError/TypeError/…) — فقط برای ثبت و تشخیص */
  cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "NetworkError";
    this.cause = cause;
  }
}

/** آیا خطای پرتاب‌شده از جنس «گذرا» است؟ (قطع لحظه‌ای/سقف زمان — نه خطای HTTP) */
function isTransientNetworkFailure(error: unknown): boolean {
  if (error instanceof ApiError) return false;
  // NetworkError → به علت اصلیِ داخلش نگاه می‌کنیم
  if (error instanceof NetworkError) {
    return isTransientNetworkFailure(error.cause);
  }
  const name =
    typeof (error as { name?: unknown })?.name === "string"
      ? (error as { name: string }).name
      : "";
  // AbortError/TimeoutError = سقف زمان؛ TypeError = خطای شبکه‌ی fetch
  return (
    name === "AbortError" ||
    name === "TimeoutError" ||
    error instanceof TypeError
  );
}

/** پیام فارسی مشخص برای خطای سطح شبکه */
function networkErrorMessage(error: unknown): string {
  const name =
    typeof (error as { name?: unknown })?.name === "string"
      ? (error as { name: string }).name
      : "";
  if (name === "AbortError" || name === "TimeoutError") {
    return "پاسخ سرور بیش از حد طول کشید — لطفاً دوباره تلاش کنید.";
  }
  return "ارتباط با سرور برقرار نشد — اتصال خود را بررسی و دوباره تلاش کنید.";
}

/** یک تلاشِ خام fetch + پردازش پاسخ (بدون تلاش مجدد) */
async function attemptFetch(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<unknown> {
  // اگر فراخواننده سیگنال خاصی نداده، سقف زمان پیش‌فرض اعمال می‌شود
  const signal = init?.signal ?? timeoutSignal(timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (error) {
    // اگر فراخواننده خودش درخواست را لغو کرده (Unmount دیالوگ و…)،
    // خطای خام عیناً عبور می‌کند — نه پیام شبکه، نه تلاش مجدد.
    if (init?.signal?.aborted) throw error;
    // سقف زمانِ خودِ ما → پیام مشخصِ «طول کشید»؛ هر چیز دیگر → «قطع ارتباط»
    throw new NetworkError(networkErrorMessage(error), error);
  }

  const data: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    // نشست منقضی شده: رویداد سراسری صادر می‌شود تا ریشه‌ی پنل کاربر را به صفحه ورود برگرداند
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    const message =
      (data as { error?: string } | null)?.error ?? "خطای ناشناخته رخ داد.";
    throw new ApiError(message, res.status);
  }

  return data;
}

/**
 * fetch مدیریت — با «یک تلاش مجدد خودکار» برای GETهای بدون سیگنالِ فراخواننده.
 *
 * چرا؟ نخستین درخواستِ یک مسیر پس از راه‌اندازی/بازسازی سرور (کامپایل
 * درخواستی در dev، سردترین حالتِ اجرا در VPS) ممکن است از سقف ۳۰ ثانیه
 * بلندتر شود یا اتصال، حین بازسازی، لحظه‌ای قطع شود — تلاش دوم معمولاً
 * همان لحظه موفق می‌شود و کاربر اصلاً خطایی نمی‌بیند. درخواست‌های
 * تغییردهنده (POST/PUT/DELETE/…) هرگز خودکار تلاش مجدد نمی‌شوند تا
 * اثباتِ دومِ یک عملیات تکراری رخ ندهد.
 */
export async function apiFetch<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const canRetry = method === "GET" && !init?.signal;

  try {
    return (await attemptFetch(url, init, DEFAULT_TIMEOUT_MS)) as T;
  } catch (error) {
    if (!canRetry || !isTransientNetworkFailure(error)) throw error;
    // فقط برای خطاهای گذرای شبکه‌ی GET — یک بار، پس از مکث کوتاه
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    return (await attemptFetch(url, init, DEFAULT_TIMEOUT_MS)) as T;
  }
}

/**
 * نمایش خطای API با توست — خطاهای ۴۰۱ توسط شنونده‌ی سراسری
 * (در super-admin) مدیریت می‌شوند و دوباره توست نمی‌خورند.
 */
export function toastApiError(error: unknown): void {
  if (error instanceof ApiError && error.status === 401) return;
  if (error instanceof NetworkError) {
    // پیام مشخص: سقف زمان یا قطع ارتباط — قابل‌اقدام برای کاربر
    toast.error(error.message);
    return;
  }
  if (error instanceof ApiError) {
    toast.error(error.message);
    return;
  }
  toast.error("خطای ناشناخته رخ داد. لطفاً دوباره تلاش کنید.");
}
