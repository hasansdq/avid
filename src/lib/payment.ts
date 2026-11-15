import { db } from "@/lib/db";
import type { Course, DiscountCode, PaymentSettings } from "@prisma/client";
import { computeDiscountAmount, type DiscountValueType } from "@/lib/discount";

/**
 * لایه‌ی یکپارچه‌سازی درگاه‌های پرداخت — زرین‌پال (PG v4) و پی‌پینگ (v3)
 *
 * همه‌ی مبالغ در سراسر سیستم به «تومان» ذخیره می‌شوند؛
 * زرین‌پال ریال می‌پذیرد (×۱۰) و پی‌پینگ تومان (طبق مستند رسمی v3:
 * «واحد پول در تمام سرویس‌ها تومان می‌باشد»).
 *
 * پی‌پینگ v3 (بر پایه‌ی مستند رسمی api.payping.ir — OpenAPI):
 *   • احراز هویت: هدر Authorization: Bearer TOKEN (مثل v2)
 *   • ساخت پرداخت: POST /v3/pay → PaymentDto { paymentCode, url, … }
 *     — کاربر به «url» (یا /v3/pay/start/{paymentCode}) هدایت می‌شود
 *   • بازگشت نتیجه: POST x-www-form-urlencoded به returnUrl با
 *     status / errorCode / data(JSON) — «نه» رشته‌ی کوئری GET مثل v2
 *     (مسیر POST در src/app/api/payment/callback/route.ts)
 *   • تأیید: POST /v3/pay/verify با { paymentRefId, paymentCode, amount }
 *     — هر سه الزامی؛ 202/502 یعنی «در حال پردازش، دوباره تلاش کنید»؛
 *     409 + metaData.code=110 یعنی «قبلاً تأیید شده» (کال‌بک تکراری)
 *
 * gateway = "test" حالت آزمایشی است و بدون تماس با درگاه واقعی،
 * کل چرخه‌ی پرداخت را شبیه‌سازی می‌کند تا بتوان بدون پذیرنده‌ی واقعی
 * جریان را تست کرد.
 */

export type PaymentGateway = "none" | "zarinpal" | "payping" | "test";

export const PAYMENT_GATEWAYS = {
  none: { label: "غیرفعال", hint: "پرداخت آنلاین در فرم نمایش داده نمی‌شود" },
  zarinpal: { label: "زرین‌پال", hint: "درگاه پرداخت زرین‌پال (PG v4)" },
  payping: { label: "پی‌پینگ", hint: "درگاه پرداخت پی‌پینگ (v3)" },
  test: {
    label: "آزمایشی (شبیه‌سازی)",
    hint: "بدون اتصال واقعی، چرخه‌ی پرداخت شبیه‌سازی می‌شود",
  },
} as const;

export function isGateway(v: string): v is PaymentGateway {
  return v in PAYMENT_GATEWAYS;
}

/** دریافت (و در صورت نبود، ایجاد) تنظیمات یکتای پرداخت */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  return db.paymentSettings.upsert({
    where: { id: "main" },
    create: {},
    update: {},
  });
}

/** آیا پرداخت آنلاین برای فرم فعال است؟ */
export function isPaymentEnabled(s: PaymentSettings): boolean {
  return s.gateway !== "none";
}

/** مبلغ قابل پرداخت بر اساس شهریه‌ی اختصاصی همان دوره (تومان) — با کسر تخفیف */
export function payableAmount(
  course: Pick<Course, "cashTuition" | "installmentTuition">,
  settings: Pick<PaymentSettings, "installmentCount">,
  method: "cash" | "installment",
  discountAmount = 0
): number {
  if (method === "installment") {
    if (course.installmentTuition <= 0) return 0; // اقساط برای این دوره تعریف نشده
    // مبلغ کل طرح پس از کسر تخفیف؛ صفر یعنی کل شهریه با تخفیف تسویه شده
    const total = Math.max(0, course.installmentTuition - discountAmount);
    if (total <= 0) return 0;
    const count = Math.max(1, settings.installmentCount);
    // قسط اول؛ باقیمانده در اقساط بعدی
    return Math.ceil(total / count);
  }
  return Math.max(0, course.cashTuition - discountAmount);
}

/* ------------------------------------------------------------------ */
/*                        کدهای تخفیف پیش‌ثبت‌نام                       */
/* ------------------------------------------------------------------ */

/** یافتن کد تخفیف بر اساس متن کد (نرمال‌شده با حروف بزرگ) */
export async function findDiscountCode(
  raw: string
): Promise<DiscountCode | null> {
  const code = raw.trim().toUpperCase();
  if (!code) return null;
  return db.discountCode.findUnique({ where: { code } });
}

/**
 * اعتبارسنجی کامل کد تخفیف برای یک روش پرداخت و مبلغ پایه‌ی مشخص —
 * فعال بودن، تناسب نوع پرداخت (نقدی/اقساطی)، انقضا و ظرفیت استفاده.
 */
export function checkDiscountCode(
  code: DiscountCode,
  method: "cash" | "installment",
  baseAmount: number
):
  | { ok: true; discountAmount: number }
  | { ok: false; reason: string } {
  if (!code.active) {
    return { ok: false, reason: "این کد تخفیف غیرفعال است." };
  }
  if (
    code.paymentType !== "both" &&
    code.paymentType !== method
  ) {
    return {
      ok: false,
      reason:
        method === "cash"
          ? "این کد فقط برای پرداخت اقساطی معتبر است."
          : "این کد فقط برای پرداخت نقدی معتبر است.",
    };
  }
  if (code.expiresAt && code.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "این کد تخفیف منقضی شده است." };
  }
  if (code.maxUses > 0 && code.usedCount >= code.maxUses) {
    return {
      ok: false,
      reason: "ظرفیت استفاده از این کد تخفیف تکمیل شده است.",
    };
  }
  if (code.value <= 0) {
    return { ok: false, reason: "این کد تخفیف معتبر نیست." };
  }
  const discountAmount = computeDiscountAmount(
    code.valueType as DiscountValueType,
    code.value,
    baseAmount
  );
  if (discountAmount <= 0) {
    return {
      ok: false,
      reason: "مبلغ تخفیف این کد برای این پرداخت صفر است.",
    };
  }
  return { ok: true, discountAmount };
}

/* ------------------------------------------------------------------ */
/*                           زرین‌پال (PG v4)                          */
/* ------------------------------------------------------------------ */

const ZARINPAL_BASE = "https://payment.zarinpal.com/pg";
const ZARINPAL_START = `${ZARINPAL_BASE}/StartPay/`;

interface ZarinpalRequestResponse {
  data?: { code?: number; authority?: string; message?: string };
  errors?: unknown;
}

/** درخواست پرداخت زرین‌پال → آدرس شروع پرداخت */
export async function requestZarinpalPayment(opts: {
  settings: PaymentSettings;
  amountToman: number;
  callbackUrl: string;
  description: string;
  mobile?: string;
  /** شناسه‌ی سفارش (metadata.order_id) — اختیاری */
  orderId?: string;
}): Promise<{ redirectUrl: string; authority: string }> {
  const { settings, amountToman, callbackUrl, description, mobile } = opts;

  if (!settings.zarinpalMerchantId) {
    throw new Error(
      "شناسه‌ی پذیرنده‌ی زرین‌پال در پنل مدیریت تنظیم نشده است."
    );
  }

  const { orderId } = opts;

  const res = await fetch(`${ZARINPAL_BASE}/v4/payment/request.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      merchant_id: settings.zarinpalMerchantId,
      // زرین‌پال مبالغ را به ریال می‌پذیرد
      amount: amountToman * 10,
      callback_url: callbackUrl,
      description,
      metadata: {
        ...(mobile ? { mobile } : {}),
        ...(orderId ? { order_id: orderId } : {}),
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error("خطا در ارتباط با درگاه زرین‌پال.");
  }

  const json = (await res.json()) as ZarinpalRequestResponse;
  const authority = json.data?.authority;
  if (json.data?.code !== 100 || !authority) {
    throw new Error(
      `زرین‌پال درخواست را نپذیرفت${json.data?.message ? `: ${json.data.message}` : ""}`
    );
  }

  return { redirectUrl: `${ZARINPAL_START}${authority}`, authority };
}

interface ZarinpalVerifyResponse {
  data?: {
    code?: number;
    ref_id?: number;
    card_pan?: string;
    message?: string;
  };
}

/** تأیید پرداخت زرین‌پال — کد ۱۰۰/۱۰۱ یعنی موفق */
export async function verifyZarinpalPayment(opts: {
  settings: PaymentSettings;
  amountToman: number;
  authority: string;
}): Promise<{ ok: boolean; refId?: string; cardPan?: string }> {
  const { settings, amountToman, authority } = opts;

  const res = await fetch(`${ZARINPAL_BASE}/v4/payment/verify.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      merchant_id: settings.zarinpalMerchantId,
      amount: amountToman * 10,
      authority,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    return { ok: false };
  }

  const json = (await res.json()) as ZarinpalVerifyResponse;
  const code = json.data?.code;
  if (code === 100 || code === 101) {
    return {
      ok: true,
      refId: json.data?.ref_id ? String(json.data.ref_id) : undefined,
      cardPan: json.data?.card_pan ?? undefined,
    };
  }
  return { ok: false };
}

/* ------------------------------------------------------------------ */
/*                            پی‌پینگ (v3)                             */
/* ------------------------------------------------------------------ */

const PAYPING_BASE = "https://api.payping.ir/v3";

/** پاسخ ساخت پرداخت v3 — PaymentDto */
interface PaypingPayResponse {
  paymentCode?: string;
  url?: string;
  amount?: number;
  isError?: boolean;
  message?: string;
  detail?: string;
  metaData?: {
    code?: number;
    errors?: Array<{ message?: string }>;
  };
}

/** برخی پاسخ‌های غیررسمی/ناهمگام فقط «code» می‌فرستند (مثل v2) */
interface PaypingPayResponseCompat extends PaypingPayResponse {
  code?: string;
}

/** استخراج پیام خطای خوانا از PaymentProblemDetails پی‌پینگ v3 */
function paypingErrorMessage(json: PaypingPayResponse): string {
  const list = json.metaData?.errors?.map((e) => e.message).filter(Boolean);
  if (list && list.length > 0) return list.join(" — ");
  return json.message ?? json.detail ?? "";
}

/** درخواست پرداخت پی‌پینگ v3 → آدرس شروع پرداخت
 * (clientRefId = «کد تلاش پرداخت» یکتا — در بازگشت درگاه داخل data(JSON)
 * برمی‌گردد و برای یافتن دقیق «همان تلاش» به‌همراه مبلغ تطبیق می‌شود) */
export async function requestPaypingPayment(opts: {
  settings: PaymentSettings;
  amountToman: number;
  callbackUrl: string;
  description: string;
  clientRefId?: string;
  payerIdentity?: string;
}): Promise<{ redirectUrl: string; code: string }> {
  const {
    settings,
    amountToman,
    callbackUrl,
    description,
    clientRefId,
    payerIdentity,
  } = opts;

  if (!settings.paypingApiKey) {
    throw new Error("توکن API پی‌پینگ در پنل مدیریت تنظیم نشده است.");
  }

  const res = await fetch(`${PAYPING_BASE}/pay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.paypingApiKey}`,
    },
    body: JSON.stringify({
      // طبق مستند v3 مبالغ «در تمام سرویس‌ها» به تومان هستند
      amount: amountToman,
      returnUrl: callbackUrl,
      description,
      ...(clientRefId ? { clientRefId } : {}),
      ...(payerIdentity ? { payerIdentity } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const json = (await res.json().catch(() => ({}))) as PaypingPayResponseCompat;
  if (!res.ok) {
    const why = paypingErrorMessage(json);
    throw new Error(
      `پی‌پینگ درخواست را نپذیرفت${why ? `: ${why}` : ` (HTTP ${res.status})`}`
    );
  }

  const code = json.paymentCode ?? json.code;
  if (!code) {
    throw new Error("پی‌پینگ کد پرداخت (paymentCode) را برنگرداند.");
  }

  // آدرس شروع پرداخت: مستند v3 خودِ «url» پاسخ را معتبر می‌داند؛
  // نبودش (پاسخ‌های ناهمگام) با مسیر رسمی «انتقال به درگاه» جایگزین می‌شود
  const redirectUrl =
    json.url && /^https?:\/\//i.test(json.url)
      ? json.url
      : `${PAYPING_BASE}/pay/start/${code}`;
  return { redirectUrl, code };
}

/** پاسخ تأیید v3 — VerifyDto (۲۰۰) */
interface PaypingVerifyDto {
  amount?: number;
  cardNumber?: string;
  clientRefId?: string;
  paymentRefId?: number;
  code?: string;
  isError?: boolean;
}

/** نتیجه‌ی تأیید پی‌پینگ v3 — وضعیت‌های معنی‌دار جدا از هم */
export interface PaypingVerifyResult {
  ok: boolean;
  /** 202/502 — تأیید هنوز در حال پردازش است؛ دوباره فراخوانی شود */
  processing?: boolean;
  /** 409 + metaData.code=110 — تراکنش قبلاً در درگاه تأیید شده است */
  alreadyVerified?: boolean;
  /** مبلغ تأییدشده‌ی درگاه (تومان — «مبلغ دستور پرداخت») */
  amount?: number;
  /** شناسه‌ی ارجاع برگشتی (کد تلاش) — برای تطبیق دوباره */
  clientRefId?: string;
  /** شماره کارت پرداخت‌کننده (اگر درگاه فرستاده باشد) */
  cardNumber?: string;
}

/** بدنه‌ی 409 — metaData.message با کلیدهای PascalCase */
interface PaypingConflictBody {
  metaData?: {
    code?: number;
    message?: Record<string, unknown>;
  };
}

/** جست‌وجوی کلید در رکورد با نام‌های حساس/غیرحساس به حروف */
function pickKey(
  obj: Record<string, unknown> | null | undefined,
  ...names: string[]
): unknown {
  if (!obj) return undefined;
  for (const n of names) {
    if (obj[n] !== undefined) return obj[n];
  }
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) lower.set(k.toLowerCase(), v);
  for (const n of names) {
    const v = lower.get(n.toLowerCase());
    if (v !== undefined) return v;
  }
  return undefined;
}

/** آیا مبلغ برگشتیِ درگاه با «مبلغ دستور پرداخت» منطبق است؟
 * (مستند: واحد همه‌ی سرویس‌ها تومان است؛ معادل ریالی ×۱۰ هم تحمل
 * می‌شود تا اگر پذیرنده‌ای پاسخ ریالی گرفت، تراکنشِ درست رد نشود) */
function matchesCommandAmount(returned: number, expectedToman: number): boolean {
  return returned === expectedToman || returned === expectedToman * 10;
}

/** تأیید پرداخت پی‌پینگ v3 — POST /v3/pay/verify
 *  { paymentRefId (الزامی), paymentCode (الزامی), amount (الزامی) }
 *  • مبلغ سفارشِ ثبت‌شده ارسال می‌شود؛ درگاه فقط در صورت تطابق کامل تأیید می‌کند.
 *  • مبلغ و clientRefId پاسخ هم باید دقیقاً منطبق باشند (توصیه‌ی مستند رسمی).
 *  • 202/502 → «در حال پردازش» — چند بار با فاصله تلاش، سپس processing برمی‌گردد
 *    (پرداخت هنوز ناموفق نیست؛ نباید failed ثبت شود).
 *  • 409 + metaData.code=110 → «قبلاً تأیید شده» — کال‌بک تکراریِ سمت درگاه؛
 *    با مبلغ/کدِ همان پیام تطبیق می‌شود (تضمینِ idempotentِ کامل در سمت ما). */
export async function verifyPaypingPayment(opts: {
  settings: PaymentSettings;
  amountToman: number;
  /** کد رهگیری پرداخت — paymentRefId در بدنه‌ی فرم کال‌بک v3 */
  paymentRefId: number | string;
  /** کد پرداخت — همان paymentCode ذخیره‌شده روی ثبت‌نام در آغاز پرداخت */
  paymentCode: string;
  /** دفعات تلاش مجدد برای 202/502 (پیش‌فرض ۳ با فاصله‌ی ۲ ثانیه) */
  processingRetries?: number;
}): Promise<PaypingVerifyResult> {
  const { settings, amountToman, paymentRefId, paymentCode } = opts;
  const retries = Math.max(1, opts.processingRetries ?? 3);
  const refIdNum = Number(paymentRefId);

  const call = async (): Promise<Response> =>
    fetch(`${PAYPING_BASE}/pay/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.paypingApiKey}`,
      },
      body: JSON.stringify({
        paymentRefId: Number.isFinite(refIdNum) ? refIdNum : paymentRefId,
        paymentCode,
        amount: amountToman,
      }),
      signal: AbortSignal.timeout(15_000),
    });

  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));

    let res: Response;
    try {
      res = await call();
    } catch {
      // خطای شبکه/مهلت — یک تلاش دیگر (اگر آخرین تلاش بود: ناموفق)
      if (attempt === retries - 1) return { ok: false };
      continue;
    }

    // 202/502 — تأیید هنوز در حال پردازش است؛ طبق مستند نباید پرداخت
    // مجدد آغاز شود و Verify دوباره فراخوانی می‌شود
    if (res.status === 202 || res.status === 502) {
      if (attempt === retries - 1) return { ok: false, processing: true };
      continue;
    }

    // ۲۰۰ — VerifyDto: مبلغ و شناسه‌ی ارجاع باید منطبق باشند
    if (res.ok) {
      const dto = (await res.json().catch(() => null)) as
        | PaypingVerifyDto
        | null;
      const amount = dto?.amount;
      if (
        !dto ||
        typeof amount !== "number" ||
        !matchesCommandAmount(amount, amountToman) ||
        dto.isError === true
      ) {
        return { ok: false };
      }
      return {
        ok: true,
        amount,
        clientRefId:
          typeof dto.clientRefId === "string" ? dto.clientRefId : undefined,
        cardNumber:
          typeof dto.cardNumber === "string" ? dto.cardNumber : undefined,
      };
    }

    // 409 + metaData.code=110 — قبلاً تأیید شده (کال‌بک تکراری سمت درگاه)
    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as
        | PaypingConflictBody
        | null;
      if (body?.metaData?.code === 110) {
        const msg = (body.metaData.message ?? {}) as Record<string, unknown>;
        const amount = pickKey(msg, "Amount", "amount");
        const clientRefId = pickKey(msg, "ClientRefId", "clientRefId");
        const cardNumber = pickKey(msg, "CardNumber", "cardNumber");
        if (
          typeof amount !== "number" ||
          !matchesCommandAmount(amount, amountToman)
        ) {
          // مبلغِ «قبلاً تأییدشده» با مبلغ سفارش ما یکی نیست — رد می‌شود
          return { ok: false };
        }
        return {
          ok: true,
          alreadyVerified: true,
          amount,
          clientRefId:
            typeof clientRefId === "string" ? clientRefId : undefined,
          cardNumber:
            typeof cardNumber === "string" ? cardNumber : undefined,
        };
      }
      return { ok: false };
    }

    // هر وضعیت دیگر (400 اعتبارسنجی، 401 توکن، 500…) — ناموفق قطعی این تلاش
    return { ok: false };
  }
  return { ok: false };
}

/* ------------------------------------------------------------------ */
/*        پی‌پینگ v2 — فقط برای تراکنش‌های آغازشده پیش از ارتقای v3       */
/* ------------------------------------------------------------------ */

const PAYPING_V2_BASE = "https://api.payping.ir/v2";

interface PaypingV2VerifyResponse {
  amount?: number;
  isError?: boolean;
}

/** تأیید «پرداخت‌های قدیمی v2» — پرداخت‌های آغازشده پیش از ارتقا که هنوز
 * در جریان‌اند (کال‌بک GET با refid/clientrefid). پرداخت‌های تازه همه با
 * v3 آغاز می‌شوند (requestPaypingPayment) و با POST برمی‌گردند.
 * «تطبیق مبلغ» دو سویه:
 *  ۱) مبلغِ سفارشِ ثبت‌شده (amountToman) در درخواست verify ارسال می‌شود؛
 *     درگاه فقط وقتی تراکنش را تأیید می‌کند که با مبلغِ واقعیِ تراکنش یکی باشد.
 *  ۲) مبلغِ برگشتیِ پاسخ هم باید دقیقاً همان مبلغ سفارش باشد — پی‌پینگ مبلغ را
 *     به تومان (یا معادل ریالی ×۱۰) برمی‌گرداند؛ هر دو پذیرفته می‌شود. */
export async function verifyPaypingLegacyV2Payment(opts: {
  settings: PaymentSettings;
  amountToman: number;
  refId: string;
}): Promise<{ ok: boolean; amount?: number }> {
  const { settings, amountToman, refId } = opts;

  const res = await fetch(`${PAYPING_V2_BASE}/pay/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.paypingApiKey}`,
    },
    body: JSON.stringify({
      refId: Number(refId) || refId,
      amount: amountToman,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) return { ok: false };

  const json = (await res.json().catch(() => null)) as
    | PaypingV2VerifyResponse
    | null;
  const amount = json?.amount;
  const ok =
    !!json &&
    !json.isError &&
    typeof amount === "number" &&
    (amount === amountToman || amount === amountToman * 10);
  return { ok, amount: typeof amount === "number" ? amount : undefined };
}
