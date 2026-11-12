import { db } from "@/lib/db";
import type { Course, DiscountCode, PaymentSettings } from "@prisma/client";
import { computeDiscountAmount, type DiscountValueType } from "@/lib/discount";

/**
 * لایه‌ی یکپارچه‌سازی درگاه‌های پرداخت — زرین‌پال (PG v4) و پی‌پینگ (v3)
 *
 * همه‌ی مبالغ در سراسر سیستم به «تومان» ذخیره می‌شوند؛
 * زرین‌پال ریال می‌پذیرد (×۱۰) و پی‌پینگ تومان.
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
const PAYPING_START = `${PAYPING_BASE}/pay/start/`;

/** ایجاد تراکنش پی‌پینگ برای یک ثبت‌نام مشخص. */
export async function requestPaypingPayment(opts: {
  settings: PaymentSettings;
  amountToman: number;
  callbackUrl: string;
  description: string;
  clientRefId: string;
  payerIdentity: string;
  payerName: string;
}): Promise<{ redirectUrl: string; code: string }> {
  const {
    settings, amountToman, callbackUrl, description, clientRefId, payerIdentity, payerName,
  } = opts;

  if (!settings.paypingApiKey) {
    throw new Error("توکن API پی‌پینگ در پنل مدیریت تنظیم نشده است.");
  }

  const res = await fetch(`${PAYPING_BASE}/pay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${settings.paypingApiKey}`,
    },
    body: JSON.stringify({
      Amount: amountToman,
      ReturnUrl: callbackUrl,
      Description: description,
      ClientRefId: clientRefId,
      PayerIdentity: payerIdentity,
      PayerName: payerName,
      NationalCode: "",
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const result = (await res.json().catch(() => null)) as { paymentCode?: unknown } | null;
  if (res.status !== 200 || typeof result?.paymentCode !== "string" || !result.paymentCode) {
    throw new Error("پی‌پینگ درخواست پرداخت را نپذیرفت.");
  }

  return {
    redirectUrl: `${PAYPING_START}${encodeURIComponent(result.paymentCode)}`,
    code: result.paymentCode,
  };
}

/** تطبیق کد تراکنش و مبلغ با پاسخ تأیید درگاه. */
export async function verifyPaypingPayment(opts: {
  settings: PaymentSettings;
  amountToman: number;
  refId: string;
  paymentCode: string;
}): Promise<{ ok: boolean }> {
  const { settings, amountToman, refId, paymentCode } = opts;
  if (!settings.paypingApiKey) return { ok: false };

  const res = await fetch(`${PAYPING_BASE}/pay/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${settings.paypingApiKey}`,
    },
    body: JSON.stringify({
      PaymentRefId: refId,
      PaymentCode: paymentCode,
      Amount: amountToman,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status !== 200) return { ok: false };
  const result = (await res.json().catch(() => null)) as {
    code?: unknown;
    amount?: unknown;
  } | null;
  return { ok: result?.code === paymentCode && result.amount === amountToman };
}
