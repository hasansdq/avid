import { randomUUID } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * آمار سایت — شمارنده‌های روزانه + ضربان حضور کاربران آنلاین.
 *
 * اصول:
 *  • هیچ تابعی استثنا به بیرون نمی‌پرتاب می‌کند (آمار هرگز جریان اصلی
 *    سایت — ورود/ثبت‌نام/رندر — را نمی‌شکند)؛ خطا فقط لاگ می‌شود.
 *  • کلید روز «YYYY-MM-DD» بر اساس منطقه‌ی زمانی Tehran (مخاطب فارسی)
 *    ساخته می‌شود تا روزِ آماری با روزِ تقویمی مخاطب یکی باشد.
 *  • بازدید = هر بار لود صفحه‌ی سایت (POST /api/stats/visit از سمت
 *    بیکن سمت-کاربر؛ مسیر پنل مدیر شمرده نمی‌شود).
 *  • بازدیدکننده‌ی یکتا = کوکی یک‌ساله‌ی «avid_vid»؛ درج تکراری (روز،
 *    بازدیدکننده) با unique رد می‌شود و فقط بار اول شمرده می‌شود.
 *  • ثبت‌نام/ورود = نتیجه‌ی فرم یکپارچه (حساب تازه = ثبت‌نام؛ حساب
 *    موجود = ورود) + ساخت دستی کاربر توسط مدیر (ثبت‌نام).
 *  • آنلاین = ضربان حضور در ۵ دقیقه‌ی اخیر؛ ضربان حداکثر هر ۶۰ ثانیه
 *    یک‌بار برای هر نشست ثبت می‌شود (lastSeenAt روی UserSession).
 */

/** منطقه‌ی زمانی مرجعِ کلیدهای روز */
const STATS_TZ = "Asia/Tehran";

/** کوکی بازدیدکننده (یکتاسازی روزانه) */
export const VISITOR_COOKIE = "avid_vid";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // ~۱۳ ماه

/** ضربان حضور */
export const PRESENCE_ONLINE_MS = 5 * 60 * 1000; // آنلاین = ضربان در ۵ دقیقه‌ی اخیر
const PRESENCE_PULSE_THROTTLE_MS = 60 * 1000; // حداکثر یک ضربان در دقیقه برای هر نشست
const PRESENCE_PRUNE_MS = 48 * 60 * 60 * 1000; // هرس ضربان‌های قدیمی‌تر از ۴۸ ساعت

/** کلید روز جاری «YYYY-MM-DD» در منطقه‌ی زمانی مرجع */
export function dayKey(date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: STATS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date); // en-CA → YYYY-MM-DD
}

/** کلیدهای n روز متوالی منتهی به امروز (برای نمودار؛ روزهای خالی صفر می‌شوند) */
export function lastNDayKeys(n: number): string[] {
  // نقطه‌ی مرجع «امروز» در منطقه‌ی مرجع — برای محاسبه‌ی شیفت روزها
  const today = new Date();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    keys.push(dayKey(d));
  }
  return keys;
}

/* ---------------- شمارنده‌های روزانه ---------------- */

type DailyField = "visits" | "uniqueVisitors" | "signups" | "logins";

/** افزایش شمارنده‌های روزِ جاری — بی‌خطا (best-effort) */
async function bumpDaily(
  day: string,
  fields: Partial<Record<DailyField, number>>
): Promise<void> {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    data[k] = { increment: v ?? 0 };
  }
  try {
    await db.statsDaily.upsert({
      where: { day },
      create: { day, ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v ?? 0])) },
      update: data,
    });
  } catch (error) {
    console.error("stats bumpDaily error:", error);
  }
}

/* ---------------- بازدید و بازدیدکننده ---------------- */

/** ثبت یک بازدید صفحه + یکتاسازی بازدیدکننده (کوکی) */
export async function trackVisit(req: NextRequest): Promise<{
  visitorId: string;
  setCookie: boolean;
}> {
  const day = dayKey();

  // کوکی بازدیدکننده — اگر نیست یک شناسه‌ی تازه صادر می‌شود تا در پاسخ ست شود
  let visitorId = req.cookies.get(VISITOR_COOKIE)?.value?.trim() ?? "";
  let setCookie = false;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(visitorId)) {
    visitorId = randomUUID().replace(/-/g, "");
    setCookie = true;
  }

  // یکتاسازی روزانه — درج تکراری (P2002) یعنی همین بازدیدکننده امروز
  // قبلاً شمرده شده و uniqueVisitors نباید دوباره افزایش یابد
  let isNewVisitor = true;
  try {
    await db.visitVisitorDay.create({ data: { day, visitorId } });
  } catch {
    isNewVisitor = false; // قبلاً شمرده شده (یا خطای بی‌خطر)
  }

  await bumpDaily(day, {
    visits: 1,
    ...(isNewVisitor ? { uniqueVisitors: 1 } : {}),
  });

  return { visitorId, setCookie };
}

/** گزینه‌های کوکی بازدیدکننده — هم‌زبان با کوکی‌های نشست (پشتیبانی iframe) */
export function visitorCookieOptions(res: NextResponse, visitorId: string) {
  res.cookies.set(VISITOR_COOKIE, visitorId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: VISITOR_COOKIE_MAX_AGE,
  });
  return res;
}

/* ---------------- ثبت‌نام و ورود ---------------- */

/** ثبت یک ثبت‌نام موفق (ساخت حساب جدید) */
export async function trackSignup(): Promise<void> {
  await bumpDaily(dayKey(), { signups: 1 });
}

/** ثبت یک ورود موفق (حساب موجود) */
export async function trackLogin(): Promise<void> {
  await bumpDaily(dayKey(), { logins: 1 });
}

/* ---------------- حضور (کاربران آنلاین) ---------------- */

/**
 * ضربان حضور — از getSessionUser فراخوانده می‌شود؛ برای هر نشست حداکثر
 * هر ۶۰ ثانیه یک ضربان می‌نویسد و lastSeenAt نشست را تازه می‌کند.
 */
export async function presencePulse(
  sessionId: string,
  userId: string,
  lastSeenAt: Date | null
): Promise<Date> {
  const now = new Date();
  const fresh =
    lastSeenAt !== null && now.getTime() - lastSeenAt.getTime() < PRESENCE_PULSE_THROTTLE_MS;
  if (fresh) return lastSeenAt as Date;

  try {
    await db.$transaction([
      db.userSession.update({
        where: { id: sessionId },
        data: { lastSeenAt: now },
      }),
      db.presencePulse.create({ data: { userId } }),
    ]);
  } catch (error) {
    // حتی اگر ضربان نوشته نشد، lastSeenAt را best-effort آپدیت می‌کنیم
    db.userSession
      .update({ where: { id: sessionId }, data: { lastSeenAt: now } })
      .catch(() => {});
    console.error("stats presencePulse error:", error);
  }
  return now;
}

/** هرس ضربان‌های قدیمی — گاه‌به‌گاه از گزارش‌گیری نمودار صدا زده می‌شود */
async function prunePresencePulses(): Promise<void> {
  try {
    await db.presencePulse.deleteMany({
      where: { at: { lt: new Date(Date.now() - PRESENCE_PRUNE_MS) } },
    });
  } catch {
    /* بی‌خطر */
  }
}

/* ---------------- گزارش نمودارها (پنل مدیر) ---------------- */

export interface OnlineUserItem {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  lastSeenAt: string;
}

export interface StatsChartsData {
  days: {
    day: string; // YYYY-MM-DD
    visits: number;
    uniqueVisitors: number;
    signups: number;
    logins: number;
    revenue: number; // مبلغ اقساط پرداخت‌شده در آن روز (تومان)
  }[];
  onlineNow: number;
  onlineByHourToday: number[]; // ۲۴ خانه — کاربران یکتای هر ساعت امروز
  onlineUsers: OnlineUserItem[];
  totals: {
    todayVisits: number;
    todayUnique: number;
    todaySignups: number;
    todayLogins: number;
    totalVisits: number;
    totalUsers: number;
    todayRevenue: number; // درآمد امروز (تومان)
    totalRevenue: number; // مجموع درآمد از ابتدا (تومان)
    paidInstallments: number; // شمار کل اقساط پرداخت‌شده
  };
}

/** داده‌ی کامل نمودارها — GET /api/admin/stats/charts */
export async function buildStatsCharts(): Promise<StatsChartsData> {
  const day = dayKey();
  const days = lastNDayKeys(30);

  // — شمارنده‌های ۳۰ روز (روزهای بدون رکورد = صفر) —
  const rows = await db.statsDaily.findMany({
    where: { day: { in: days } },
  });
  const byDay = new Map(rows.map((r) => [r.day, r]));

  // — درآمد روزانه: اقساط پرداخت‌شده (تسویه‌ی دستی مدیر + پرداخت آنلاین
  // درگاه) به تفکیک روزِ تهرانِ تاریخ پرداخت —
  const revenueWindowStart = dayStartInUtc(days[0]);
  const paidInstallments = await db.installment.findMany({
    where: { status: "paid", paidAt: { gte: revenueWindowStart } },
    select: { paidAt: true, amount: true },
  });
  const revenueByDay = new Map<string, number>();
  for (const inst of paidInstallments) {
    if (!inst.paidAt) continue;
    const key = dayKey(inst.paidAt);
    revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + inst.amount);
  }

  const daySeries = days.map((d) => {
    const r = byDay.get(d);
    return {
      day: d,
      visits: r?.visits ?? 0,
      uniqueVisitors: r?.uniqueVisitors ?? 0,
      signups: r?.signups ?? 0,
      logins: r?.logins ?? 0,
      revenue: revenueByDay.get(d) ?? 0,
    };
  });

  // — کاربران آنلاین (ضربان در ۵ دقیقه‌ی اخیر) —
  const since = new Date(Date.now() - PRESENCE_ONLINE_MS);
  const onlineGroups = await db.presencePulse.groupBy({
    by: ["userId"],
    where: { at: { gte: since } },
  });
  const onlineNow = onlineGroups.length;

  // — کاربران یکتا به تفکیک ساعت امروز —
  const dayStartUTC = dayStartInUtc(day);
  const hourGroups = await db.presencePulse.groupBy({
    by: ["userId", "at"],
    where: { at: { gte: dayStartUTC } },
  });
  const onlineByHourToday = new Array(24).fill(0) as number[];
  const seenPerHour = Array.from({ length: 24 }, () => new Set<string>());
  for (const g of hourGroups) {
    const hour = hourInTz(g.at);
    if (hour >= 0 && hour < 24) seenPerHour[hour].add(g.userId);
  }
  for (let h = 0; h < 24; h++) onlineByHourToday[h] = seenPerHour[h].size;

  // — فهرست کاربران آنلاین (جدیدترین دیده‌شدن) —
  const latestSessions = await db.userSession.findMany({
    where: { lastSeenAt: { gte: since } },
    orderBy: { lastSeenAt: "desc" },
    take: 30,
    include: { user: true },
  });
  const onlineUsers: OnlineUserItem[] = latestSessions
    .filter((s, i, arr) => arr.findIndex((x) => x.userId === s.userId) === i)
    .slice(0, 20)
    .map((s) => ({
      userId: s.userId,
      firstName: s.user.firstName,
      lastName: s.user.lastName,
      phone: s.user.phone,
      lastSeenAt: (s.lastSeenAt as Date).toISOString(),
    }));

  // — جمع‌ها —
  const agg = await db.statsDaily.aggregate({
    _sum: { visits: true, signups: true, logins: true, uniqueVisitors: true },
  });
  const totalUsers = await db.user.count();
  const today = byDay.get(day);

  // — جمع‌های پرداخت (کل اقساط پرداخت‌شده از ابتدا) —
  const paidAgg = await db.installment.aggregate({
    where: { status: "paid" },
    _count: { _all: true },
    _sum: { amount: true },
  });

  // هرس گاه‌به‌گاه (احتمالی، بدون انتظار)
  if (Math.random() < 0.1) void prunePresencePulses();

  return {
    days: daySeries,
    onlineNow,
    onlineByHourToday,
    onlineUsers,
    totals: {
      todayVisits: today?.visits ?? 0,
      todayUnique: today?.uniqueVisitors ?? 0,
      todaySignups: today?.signups ?? 0,
      todayLogins: today?.logins ?? 0,
      totalVisits: agg._sum.visits ?? 0,
      totalUsers,
      todayRevenue: revenueByDay.get(day) ?? 0,
      totalRevenue: paidAgg._sum.amount ?? 0,
      paidInstallments: paidAgg._count._all ?? 0,
    },
  };
}

/* ---------------- ابزارهای زمان‌بندی ---------------- */

/** شروعِ UTCِ یک کلید روز تهران («YYYY-MM-DD» → لحظه‌ی ۰۰:۰۰ تهران به UTC) */
function dayStartInUtc(day: string): Date {
  // تهران = UTC+۳:۳۰ بدون ساعت تابستانی (از ۲۰۲۲ به بعد ثابت است)
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0) - 3.5 * 60 * 60 * 1000);
}

/** ساعتِ لحظه در منطقه‌ی مرجع (۰..۲۳) */
function hourInTz(date: Date): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: STATS_TZ,
    hour: "2-digit",
    hour12: false,
  });
  return Number(fmt.format(date)) || 0;
}
