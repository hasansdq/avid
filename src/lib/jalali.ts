/**
 * تبدیل تاریخ جلالی (شمسی) ↔ میلادی — بر پایه‌ی الگوریتم استاندارد
 * jalaali (MIT، kajweb/jalaali-js) بازنویسی‌شده به TypeScript بدون
 * هیچ وابستگی خارجی.
 *
 * کاربرد: تقویم شمسی پنل مدیریت (تغییر تاریخ جلسات حضور و غیاب) و
 * هر جایی که نمایش/انتخاب تاریخ ایرانی لازم باشد.
 */

/** سال‌های اصلاحی گاه‌شمار جلالی (۱۷ گاه) */
const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097,
  2192, 2262, 2324, 2394, 2456, 3178,
];

const div = (a: number, b: number): number => Math.trunc(a / b);
const mod = (a: number, b: number): number => a - Math.trunc(a / b) * b;

export interface JalaliDate {
  /** سال جلالی (مثلاً ۱۴۰۵) */
  jy: number;
  /** ماه جلالی ۱..۱۲ */
  jm: number;
  /** روز ماه ۱..۳۱ */
  jd: number;
}

interface JalCalResult {
  leap: number;
  gy: number;
  march: number;
}

/** محاسبات سال جلالی: کبیسه و روز میلادیِ اول فروردین */
function jalCal(jy: number): JalCalResult {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;

  for (let i = 1; i < bl; i += 1) {
    jump = BREAKS[i] - jp;
    if (jy < BREAKS[i]) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = BREAKS[i];
  }
  let n = jy - jp;

  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

/** روز جولینی از تاریخ میلادی */
function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

/** تاریخ میلادی از روز جولینی */
function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

/** روز جولینی از تاریخ جلالی */
function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

/** تاریخ جلالی از روز جولینی */
function d2j(jdn: number): JalaliDate {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;

  if (k >= 0) {
    if (k <= 185) {
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

/** تاریخ میلادی (Date) → جلالی (فقط بخش روز، بدون ساعت) */
export function toJalali(date: Date): JalaliDate {
  return d2j(g2d(date.getFullYear(), date.getMonth() + 1, date.getDate()));
}

/** تاریخ جلالی → میلادی (نیمه‌شب محلی) */
export function toGregorian(jy: number, jm: number, jd: number): Date {
  const g = d2g(j2d(jy, jm, jd));
  return new Date(g.gy, g.gm - 1, g.gd);
}

/** آیا سال جلالی کبیسه است؟ (اسفند ۳۰ روزه) */
export function isJalaliLeap(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

/** طول ماه جلالی: ۳۱ روز برای ۶ ماه اول، ۳۰ روز برای ۵ ماه بعد، ۲۹/۳۰ برای اسفند */
export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeap(jy) ? 30 : 29;
}

/** نام ماه‌های جلالی */
export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

/** نام ماه جلالی (۱..۱۲) */
export function jalaliMonthName(jm: number): string {
  return JALALI_MONTHS[jm - 1] ?? "";
}

/** روز هفته‌ی یک تاریخ جلالی: ۰=شنبه … ۶=جمعه */
export function jalaliWeekday(jy: number, jm: number, jd: number): number {
  const g = toGregorian(jy, jm, jd);
  return (g.getDay() + 1) % 7;
}

/** ماه بعدی (با رفتن به سال بعد در دی) */
export function nextJalaliMonth(jy: number, jm: number): JalaliDate {
  return jm === 12 ? { jy: jy + 1, jm: 1, jd: 1 } : { jy, jm: jm + 1, jd: 1 };
}

/** ماه قبلی (با رفتن به سال قبل در فروردین) */
export function prevJalaliMonth(jy: number, jm: number): JalaliDate {
  return jm === 1 ? { jy: jy - 1, jm: 12, jd: 1 } : { jy, jm: jm - 1, jd: 1 };
}
