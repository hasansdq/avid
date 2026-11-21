import { db } from "@/lib/db";

/**
 * ثبت اتمیکِ پرداخت موفقِ «یک یا چند قسط» از پنل کاربر.
 *
 * همان الگوی نسخه‌ی ۳ چرخه‌ی پرداخت (src/lib/payment-finalize.ts) اما برای
 * تلاش‌های پرداختِ قسط (InstallmentPayment):
 *   ۱) رکورد تلاش فقط وقتی «در انتظار» است و «کد تلاش» و «مبلغ» هنوز
 *      همان مقادیرِ خوانده‌شده در کال‌بک‌اند به paid می‌رسد (updateMany
 *      شرطی؛ صفر سطر = کال‌بک تکراری یا تلاشِ جدیدترِ در جریان)؛
 *   ۲) در همان تراکنش، همه‌ی اقساطِ تحت پوششِ همین تلاش — فقط آن‌هایی که
 *      هنوز پرداخت‌نشده‌اند — علامت paid می‌خورند (یادداشت کد پیگیری درگاه).
 *
 * خروجی:
 *   { alreadyPaid: true }  → کال‌بک تکراری بود؛ هیچ تغییری اعمال نشد
 *   { alreadyPaid: false } → تلاش و اقساطِ تحت پوششش همین حالا ثبت شدند
 *   { staleAttempt: true } → رکورد با کد/مبلغِ این نتیجه منطبق نبود؛
 *                            «هیچ پرداختی ثبت نشد»
 */
interface InstallmentFinalizeOpts {
  /** رکورد تلاشِ خوانده‌شده در کال‌بک (پیش از تراکنش) */
  payment: {
    id: string;
    attemptCode: string;
    amount: number;
  };
  /** کد پیگیری نهایی درگاه (paymentRefId پی‌پینگ / authority زرین‌پال / کد آزمایشی) */
  refId: string;
  /** شماره کارت ماسک‌شده — اختیاری */
  cardPan?: string | null;
  /** مبلغی که درگاه برای همین تلاش تأیید کرده (تومان) — گارد تطبیق */
  expectedAmount?: number | null;
}

export interface InstallmentFinalizeResult {
  alreadyPaid: boolean;
  staleAttempt?: boolean;
}

export async function finalizeInstallmentPayment(
  opts: InstallmentFinalizeOpts
): Promise<InstallmentFinalizeResult> {
  const { payment, refId, cardPan, expectedAmount } = opts;

  return db.$transaction(
    async (tx) => {
      // ۱) ثبت موفقیتِ خودِ تلاش — با گاردِ «کد تلاش + مبلغ» در همان تراکنش
      const updated = await tx.installmentPayment.updateMany({
        where: {
          id: payment.id,
          status: { not: "paid" },
          attemptCode: payment.attemptCode,
          ...(expectedAmount !== undefined && expectedAmount !== null
            ? { amount: expectedAmount }
            : {}),
        },
        data: {
          status: "paid",
          refId,
          ...(cardPan !== undefined && cardPan !== null
            ? { cardPan }
            : {}),
          paidAt: new Date(),
        },
      });

      if (updated.count === 0) {
        const fresh = await tx.installmentPayment.findUnique({
          where: { id: payment.id },
          select: { status: true, attemptCode: true, amount: true },
        });
        if (fresh?.status === "paid") {
          // این تلاش قبلاً نهایی شده — کال‌بک تکراری، بی‌اثر
          return { alreadyPaid: true };
        }
        return { alreadyPaid: false, staleAttempt: true };
      }

      // ۲) اقساطِ تحت پوشش — فقط پرداخت‌نشده‌ها؛ کال‌بک تکراری و تغییر
      //    هم‌زمانِ وضعیتِ قسط توسط مدیر، دوباره‌ثباری ندارد
      let installmentIds: string[] = [];
      try {
        const parsed: unknown = JSON.parse(
          (
            await tx.installmentPayment.findUnique({
              where: { id: payment.id },
              select: { installmentIds: true },
            })
          )?.installmentIds ?? "[]"
        );
        if (Array.isArray(parsed)) {
          installmentIds = parsed.filter(
            (v): v is string => typeof v === "string" && v.length > 0
          );
        }
      } catch {
        installmentIds = [];
      }
      if (installmentIds.length > 0) {
        await tx.installment.updateMany({
          where: { id: { in: installmentIds }, status: { not: "paid" } },
          data: {
            status: "paid",
            paidAt: new Date(),
            note: `پرداخت آنلاین از پنل کاربر — کد پیگیری ${refId}`,
          },
        });
      }

      return { alreadyPaid: false };
    },
    { timeout: 30_000, maxWait: 10_000 }
  );
}

/**
 * علامت‌گذاریِ «همان تلاش» به‌عنوان ناموفق — فقط وقتی کد تلاش، کد پرداخت
 * و مبلغِ اعلامی درگاه با رکورد مطابق باشند (تلاشِ جدیدتر دست‌نخورده می‌ماند).
 */
export async function markInstallmentAttemptFailed(
  payment: {
    id: string;
    attemptCode: string;
    refId: string | null;
    amount: number;
  },
  announcedAmount?: number
): Promise<boolean> {
  if (announcedAmount !== undefined && announcedAmount !== payment.amount) {
    return false; // مبلغِ اعلامی به این تلاش تعلق ندارد — دست نزن
  }
  const { count } = await db.installmentPayment.updateMany({
    where: {
      id: payment.id,
      attemptCode: payment.attemptCode,
      refId: payment.refId,
      status: { in: ["pending", "failed"] },
    },
    data: { status: "failed" },
  });
  return count > 0;
}
