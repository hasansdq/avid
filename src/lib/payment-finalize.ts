import { db } from "@/lib/db";
import type { Enrollment } from "@prisma/client";

/**
 * ثبت اتمیک پرداخت موفق + قسط اول (چرخه‌ی پرداخت نسخه‌ی ۳).
 *
 * کل چرخه‌ی «ثبت پرداخت» در «یک تراکنش واحد» انجام می‌شود:
 *   ۱) به‌روزرسانی وضعیت ثبت‌نام به paid فقط وقتی که هنوز paid نیست «و»
 *      «کد تلاش» و «مبلغ» هنوز همان مقادیرِ خوانده‌شده در کال‌بک‌اند —
 *      با updateMany شرطی؛ اگر صفر سطر به‌روزرسانی شد یعنی یا این پرداخت
 *      قبلاً ثبت شده (کال‌بک تکراری) یا «در فاصله‌ی بین خواندن و ثبت»،
 *      تلاشِ جدیدی روی همین ثبت‌نام آغاز شده و مقادیر عوض شده‌اند
 *      (کد/مبلغِ قدیمی هرگز نباید تلاشِ تازه را paid کند).
 *   ۲) برای پرداخت اقساطی، نخستین قسطِ پرداخت‌نشده در «همان تراکنش»
 *      علامت paid می‌خورد — دیگر هیچ فاصله‌ای بین «پرداخت ثبت شد» و
 *      «قسط اول علامت خورد» وجود ندارد.
 *
 * خروجی:
 *   { alreadyPaid: true }  → کال‌بک تکراری بود؛ هیچ تغییری اعمال نشد
 *   { alreadyPaid: false } → پرداخت (و در صورت اقساطی بودن، قسط اول)
 *                            همین حالا در یک تراکنش ثبت شد
 *   { staleAttempt: true } → وضعیتِ فعلی ثبت‌نام با «کد تلاش/مبلغِ» این
 *                            نتیجه منطبق نبود؛ «هیچ پرداختی ثبت نشد» و
 *                            وضعیت فعلی (کد/مبلغِ تلاشِ جدیدتر) برگردانده
 *                            می‌شود تا کال‌بک با پیام روشن رد شود.
 */

interface FinalizeOpts {
  /** رکورد ثبت‌نامِ خوانده‌شده در کال‌بک (پیش از تراکنش) */
  enrollment: Pick<
    Enrollment,
    "id" | "paymentMethod" | "paymentAttemptCode" | "paymentAmount"
  >;
  /** کد پیگیری نهایی درگاه (paymentRefId پی‌پینگ / authority زرین‌پال / کد آزمایشی) */
  refId: string;
  /** شماره کارت ماسک‌شده (پی‌پینگ/زرین‌پال) — اختیاری */
  cardPan?: string | null;
  /**
   * «کد تلاشِ» پرداختی که این نتیجه برایش آمده — در «همان تراکنش» دوباره
   * با مقدار فعلیِ رکورد تطبیق می‌شود (تلاشِ جدیدترِ آغازشده در فاصله‌ی
   * بینِ خواندنِ کال‌بک و ثبت، پرداختِ قدیمی را بی‌اثر می‌کند).
   * undefined یعنی این گارد اعمال نشود (دروازه‌های بدون کد تلاش).
   */
  attemptCode?: string | null;
  /**
   * مبلغی که درگاه برای همین تلاش تأیید کرده (تومان) — در «همان تراکنش»
   * دوباره با مقدار فعلیِ رکورد تطبیق می‌شود تا نتیجه‌ی موفقِ تلاشی با
   * «مبلغ متفاوت» هرگز روی تلاشِ تازه ثبت نشود.
   */
  expectedAmount?: number | null;
}

export interface FinalizeResult {
  alreadyPaid: boolean;
  /** نتیجه به تلاشِ فعلیِ ثبت‌نام تعلق نداشت — چیزی ثبت نشد */
  staleAttempt?: boolean;
  /** وضعیت فعلی رکورد (برای پیام ردِ روشن) */
  currentAttemptCode?: string | null;
  currentAmount?: number | null;
}

export async function finalizeSuccessfulPayment(
  opts: FinalizeOpts
): Promise<FinalizeResult> {
  const { enrollment, refId, cardPan, attemptCode, expectedAmount } = opts;

  return db.$transaction(
    async (tx) => {
      // ۱) ثبت پرداخت — فقط اگر هنوز «پرداخت‌شده» نیست «و» کد تلاش و مبلغ
      //    هنوز همان مقادیرِ خوانده‌شده در کال‌بک‌اند.
      //    (بن‌بستِ کال‌بک تکراری و تلاشِ هم‌زمان: رقابت دو کال‌بک/تلاش
      //    همین‌جا تصمیم‌گیری می‌شود — فقط یکی می‌تواند count=1 بگیرد)
      const updated = await tx.enrollment.updateMany({
        where: {
          id: enrollment.id,
          paymentStatus: { not: "paid" },
          ...(attemptCode !== undefined
            ? { paymentAttemptCode: attemptCode ?? null }
            : {}),
          ...(expectedAmount !== undefined && expectedAmount !== null
            ? { paymentAmount: expectedAmount }
            : {}),
        },
        data: {
          paymentStatus: "paid",
          paymentRefId: refId,
          ...(cardPan !== undefined && cardPan !== null
            ? { paymentCardPan: cardPan }
            : {}),
          paidAt: new Date(),
        },
      });

      if (updated.count === 0) {
        // چرا به‌روزرسانی نشد؟ — وضعیتِ فعلی رکورد را ببین
        const fresh = await tx.enrollment.findUnique({
          where: { id: enrollment.id },
          select: {
            paymentStatus: true,
            paymentAttemptCode: true,
            paymentAmount: true,
          },
        });
        if (fresh?.paymentStatus === "paid") {
          // پرداختِ همین ثبت‌نام قبلاً ثبت شده — کال‌بک تکراری، بی‌اثر
          return { alreadyPaid: true };
        }
        // وضعیت/کد/مبلغ از «لحظه‌ی خواندن در کال‌بک» عوض شده — نتیجه‌ی
        // تلاشِ قدیمی روی وضعیتِ تازه ثبت نمی‌شود
        return {
          alreadyPaid: false,
          staleAttempt: true,
          currentAttemptCode: fresh?.paymentAttemptCode ?? null,
          currentAmount: fresh?.paymentAmount ?? null,
        };
      }

      // ۲) پرداخت موفق اقساطی → نخستین قسطِ پرداخت‌نشده در همان تراکنش
      if (enrollment.paymentMethod === "installment") {
        const installment = await tx.installment.findFirst({
          where: { enrollmentId: enrollment.id, status: { not: "paid" } },
          orderBy: { index: "asc" },
        });
        if (installment) {
          await tx.installment.update({
            where: { id: installment.id },
            data: { status: "paid", paidAt: new Date() },
          });
        }
      }

      return { alreadyPaid: false };
    },
    { timeout: 30_000, maxWait: 10_000 }
  );
}
