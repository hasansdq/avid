/**
 * کدهای تخفیف پیش‌ثبت‌نام — ثابت‌ها و توابع خالص (قابل استفاده در کلاینت و سرور)
 *
 * هر کد برای یک «نوع پرداخت» تعریف می‌شود:
 *  • cash        → فقط پرداخت نقدی
 *  • installment → فقط پرداخت اقساطی
 *  • both        → هر دو روش
 *
 * مقدار تخفیف دو صورت دارد:
 *  • percent → درصدی از مبلغ پایه (۱ تا ۱۰۰)
 *  • amount  → مبلغ ثابت (تومان)
 */

export type DiscountPaymentType = "cash" | "installment" | "both";
export type DiscountValueType = "percent" | "amount";

export const DISCOUNT_PAYMENT_TYPES = {
  cash: { label: "فقط پرداخت نقدی" },
  installment: { label: "فقط پرداخت اقساطی" },
  both: { label: "نقدی و اقساطی (هر دو)" },
} as const;

export const DISCOUNT_VALUE_TYPES = {
  percent: { label: "درصدی", hint: "درصد تخفیف از مبلغ (۱ تا ۱۰۰)" },
  amount: { label: "مبلغ ثابت", hint: "مبلغ ثابت تخفیف به تومان" },
} as const;

export function isDiscountPaymentType(
  v: string
): v is DiscountPaymentType {
  return v in DISCOUNT_PAYMENT_TYPES;
}

export function isDiscountValueType(v: string): v is DiscountValueType {
  return v in DISCOUNT_VALUE_TYPES;
}

/** نرمال‌سازی متن کد: حذف فاصله‌ها + حروف بزرگ */
export function normalizeDiscountCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** فرمت مجاز کد: ۳ تا ۳۲ نویسه از حروف/ارقام انگلیسی، خط تیره و زیرخط */
export function isValidDiscountCodeFormat(code: string): boolean {
  return /^[A-Z0-9_-]{3,32}$/.test(code);
}

/**
 * محاسبه‌ی مبلغ تخفیف (تومان) بر پایه‌ی مبلغ اصلی —
 * تخفیف هرگز از مبلغ پایه بیشتر نمی‌شود.
 */
export function computeDiscountAmount(
  valueType: DiscountValueType,
  value: number,
  baseAmount: number
): number {
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) return 0;
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (valueType === "percent") {
    const pct = Math.min(Math.round(value), 100);
    return Math.min(baseAmount, Math.floor((baseAmount * pct) / 100));
  }
  return Math.min(baseAmount, Math.round(value));
}

/** متن کوتاه مقدار تخفیف برای نمایش در پنل (بدون مبلغ پایه) */
export function discountValueLabel(
  valueType: DiscountValueType,
  value: number,
  faAmount: (n: number) => string
): string {
  if (valueType === "percent") return `${faAmount(value)}٪`;
  return `${faAmount(value)} تومان`;
}
