import { randomInt } from "crypto";

/**
 * کلاس‌ها و لینک دعوت — ابزارهای مشترک API مدیر و عضویت کاربر.
 */

/** الفبای شناسه‌ی لینک دعوت — فقط نویسه‌های غیرقابل‌اشتباه (بدون i/l/o/0/1) */
const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** طول پیش‌فرض شناسه‌ی تولیدشده */
export const INVITE_SLUG_LENGTH = 8;

/** الگوی معتبر شناسه‌ی لینک دعوت: ۳ تا ۴۰ نویسه از حروف کوچک، رقم و خط تیره */
export const INVITE_SLUG_PATTERN = /^[a-z0-9-]{3,40}$/;

/** تولید شناسه‌ی تصادفی یکتا برای لینک دعوت کلاس */
export function generateInviteSlug(): string {
  let slug = "";
  for (let i = 0; i < INVITE_SLUG_LENGTH; i++) {
    slug += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];
  }
  return slug;
}

/** اعتبارسنجی شناسه‌ی سفارشی لینک دعوت — پیام خطای فارسی یا null */
export function validateInviteSlugInput(slug: string): string | null {
  if (!INVITE_SLUG_PATTERN.test(slug)) {
    return "شناسه‌ی لینک باید ۳ تا ۴۰ نویسه از حروف کوچک انگلیسی، رقم یا خط تیره باشد (بدون فاصله).";
  }
  if (/^-|-$/.test(slug)) {
    return "شناسه‌ی لینک نمی‌تواند با خط تیره شروع یا پایان یابد.";
  }
  if (/--/.test(slug)) {
    return "خط تیره‌ی پشت‌سرهم در شناسه‌ی لینک مجاز نیست.";
  }
  return null;
}
