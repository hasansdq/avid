import { createHmac, timingSafeEqual } from "crypto";

/**
 * گره‌ی خصوصی فایل‌های گواهینامه — (بند ۸ اصلاحات امنیتی)
 *
 * فایل‌های گواهینامه در public/uploads/certificates ذخیره می‌شوند اما
 * «لینک عمومی» نیستند: سروِ مسیر /uploads فقط در سه حالت اجازه می‌دهد:
 *   ۱) امضای HMAC معتبر در query (?sig=expiry.hmac) — لینک‌هایی که API
 *      برای نمایش/دانلود (پنل کاربر، صفحه‌ی استعلام عمومی، next/image)
 *      صادر می‌کند؛
 *   ۲) نشست مدیر معتبر (کوکی avid_admin)؛
 *   ۳) نشست کاربرِ «مالکِ» همان گواهینامه (کوکی avid_user).
 * بقیه‌ی دسترسی‌ها ۴۰۴ می‌گیرند (بدون افشای وجود/نبود فایل).
 *
 * API همچنان همان فیلد fileUrl را برمی‌گرداند؛ فقط مقدارش «امضاشده»
 * می‌شود (…?sig=…) — ساختار پاسخ و اسم فیلد تغییر نمی‌کند و همه‌ی
 * مصرف‌کننده‌های فعلی (fileKindOfها به query حساس نیستند) کار می‌کنند.
 * در مسیر ذخیره‌سازی (POST/PATCH مدیر) query جدا می‌شود تا DB تمیز بماند.
 */

const CERT_PREFIX = "/uploads/certificates/";

/** عمر امضای لینک گواهینامه — ۲۴ ساعت */
const SIGN_TTL_MS = 24 * 60 * 60 * 1000;

/** رمز امضا — FILE_SIGN_SECRET یا همان CHAT_AUTH_SECRET اجباریِ استقرار */
function signingSecret(): string {
  const dedicated = process.env.FILE_SIGN_SECRET?.trim();
  if (dedicated) return dedicated;
  const chat = process.env.CHAT_AUTH_SECRET?.trim();
  if (chat) return chat;
  // محیط توسعه بدون رمز — مقدار توسعه‌ای ثابت (production همیشه رمز دارد)
  return process.env.NODE_ENV === "production" ? "" : "avid-dev-file-sign";
}

function hmac(path: string, expMs: number): string {
  return createHmac("sha256", signingSecret())
    .update(`${path}|${expMs}`)
    .digest("hex");
}

/** آیا این مسیر، فایل گواهینامه‌ی محلی است؟ */
export function isCertFileUrl(fileUrl: string | null | undefined): boolean {
  return typeof fileUrl === "string" && fileUrl.startsWith(CERT_PREFIX);
}

/** افزودن امضای کوتاه‌عمر به fileUrl — بقیه‌ی آدرس‌ها دست‌نخورده */
export function signCertFileUrl(fileUrl: string | null | undefined): string {
  if (!fileUrl) return fileUrl ?? "";
  if (!isCertFileUrl(fileUrl)) return fileUrl;
  if (!signingSecret()) return fileUrl; // production بدون رمز — بدون امضا (گیت نشست)
  const clean = fileUrl.split("?")[0];
  const exp = Date.now() + SIGN_TTL_MS;
  return `${clean}?sig=${exp}.${hmac(clean, exp)}`;
}

/** جداکردن query از fileUrl پیش از ذخیره در دیتابیس */
export function stripCertSig(fileUrl: string | null | undefined): string {
  if (typeof fileUrl !== "string" || !fileUrl) return fileUrl ?? "";
  return fileUrl.split("?")[0];
}

/** تایید امضای query برای مسیر دقیق فایل درخواستی */
export function verifyCertSig(
  filePath: string,
  sigParam: string | null
): boolean {
  if (!sigParam) return false;
  const dot = sigParam.lastIndexOf(".");
  if (dot <= 0) return false;
  const expRaw = sigParam.slice(0, dot);
  const sig = sigParam.slice(dot + 1);
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  if (!/^[a-f0-9]{64}$/.test(sig)) return false;
  const expected = Buffer.from(hmac(filePath, exp), "hex");
  const provided = Buffer.from(sig, "hex");
  return (
    expected.length === provided.length &&
    timingSafeEqual(expected, provided)
  );
}
