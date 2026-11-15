import type { Enrollment } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getPaymentSettings,
  verifyZarinpalPayment,
  verifyPaypingPayment,
  verifyPaypingLegacyV2Payment,
} from "@/lib/payment";
import { finalizeSuccessfulPayment } from "@/lib/payment-finalize";
import { forwardedOrigin } from "@/lib/http";

async function markAttemptFailed(
  attempt: Pick<Enrollment, "id" | "paymentGateway" | "paymentAttemptCode" | "paymentAmount" | "paymentRefId">
) {
  const { count } = await db.enrollment.updateMany({
    where: {
      id: attempt.id,
      paymentGateway: attempt.paymentGateway,
      paymentAttemptCode: attempt.paymentAttemptCode,
      paymentAmount: attempt.paymentAmount,
      paymentRefId: attempt.paymentRefId,
      paymentStatus: { in: ["pending", "failed"] },
    },
    data: { paymentStatus: "failed" },
  });
  return count > 0;
}

/**
 * نقطه‌ی بازگشت از درگاه پرداخت (چرخه‌ی پرداخت نسخه‌ی ۳).
 *
 * POST /api/payment/callback — پی‌پینگ v3 (مسیر اصلی):
 *   پی‌پینگ v3 نتیجه را «فرم x-www-form-urlencoded» می‌فرستد:
 *     status=1|0  errorCode=…  data={clientRefId, paymentCode,
 *     paymentRefId, amount, cardNumber, …} (data = رشته‌ی JSON)
 *   طبق مستند رسمی، پذیرنده باید «clientRefId» را در پایگاه داده بیابد و
 *   «paymentCode و amount» را با مقادیر ثبت‌شده مقایسه کند؛ مغایرت =
 *   ادامه‌ی تراکنش ممنوع. تأیید نهایی فقط با POST /v3/pay/verify
 *   {paymentRefId, paymentCode, amount} انجام می‌شود و سپس نتیجه در
 *   «یک تراکنش واحد» ثبت می‌شود.
 *
 * GET /api/payment/callback — درگاه‌های رشته‌ی کوئری:
 *   • زرین‌پال: ?Authority=...&Status=OK|NOK
 *   • پی‌پینگ v2 (فقط پرداخت‌های آغازشده «پیش از ارتقای v3» که هنوز
 *     در جریان‌اند): ?refid=...&clientrefid=... (clientrefid = کد تلاش،
 *     یا برای تلاش‌های قدیمی‌تر = شناسه‌ی ثبت‌نام)
 *   • آزمایشی:  ?gateway=test&ref=...&enrollmentId=...
 *     — فقط وقتی «درگاه آزمایشی» از پنل مدیریت (سمت سرور) فعال باشد و
 *     تراکنشِ آزمایشیِ «در انتظار» باشد تأیید می‌شود؛ پارامتر URL به‌تنهایی
 *     هیچ پرداختی را موفق ثبت نمی‌کند.
 *
 * «تطبیق دوباره‌ی کد تلاش و مبلغ هنگام ثبت نتیجه» (در هر سه مسیر):
 *   ۱) جست‌وجوی رکورد فقط با «کد تلاشِ» همان پرداخت (نه آخرین سفارشِ
 *      در انتظار)؛
 *   ۲) مبلغ درگاه (data.amount / پاسخ verify) باید با مبلغِ ثبت‌شده‌ی
 *      همین تلاش یکی باشد؛
 *   ۳) در داخلِ تراکنشِ ثبت نهایی، «کد تلاش و مبلغ» دوباره با مقادیر
 *      فعلیِ رکورد تطبیق می‌شوند (src/lib/payment-finalize.ts) — نتیجه‌ی
 *      موفقِ تلاشِ قبلی هرگز نمی‌تواند تلاشِ جدید با مبلغ متفاوت را paid
 *      کند و کال‌بک تکراری هیچ‌چیز را دوباره ثبت نمی‌کند (idempotent).
 *
 * پس از تأیید، کاربر به /register?payment=success|failed هدایت می‌شود
 * (پاسخ ۳۰۳ تا مرورگرِ فرمِ POST هم با GET ادامه دهد).
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  // مبدا بیرونی — پشت پروکسی DirectAdmin هدرهای Host/Forwarded لحاظ می‌شوند
  const origin = forwardedOrigin(req);
  const fail = (reason: string) =>
    NextResponse.redirect(
      `${origin}/register?payment=failed&reason=${encodeURIComponent(reason)}`,
      303
    );
  const success = () =>
    NextResponse.redirect(`${origin}/register?payment=success`, 303);

  try {
    const settings = await getPaymentSettings();

    /* — حالت آزمایشی: فقط با فعال‌سازی سمت سرور (درگاه = آزمایشی) —
          پارامتر gateway=test در URL به‌تنهایی هیچ تراکنشی را تأیید
          نمی‌کند؛ تراکنش واقعی فقط پس از تأییدِ درگاه ثبت می‌شود. — */
    if (params.get("gateway") === "test") {
      // فعال‌سازی سمت سرور: درگاه آزمایشی باید از پنل مدیریت فعال باشد
      if (settings.gateway !== "test") return fail("test-mode-disabled");

      const ref = params.get("ref") ?? "";
      const enrollmentId = params.get("enrollmentId") ?? "";
      if (!ref || !enrollmentId) return fail("invalid-test");

      const enrollment = await db.enrollment.findUnique({
        where: { id: enrollmentId },
      });
      if (
        !enrollment ||
        // فقط تراکنشِ آزمایشی (که از مسیر آزمایشیِ /api/payment/start آمده)
        enrollment.paymentGateway !== "test" ||
        enrollment.paymentRefId !== ref
      ) {
        return fail("not-found");
      }
      // کال‌بک تکراری برای پرداختِ قبلاً موفق → خنثی و بی‌اثر
      if (enrollment.paymentStatus === "paid") return success();
      if (enrollment.paymentStatus !== "pending") return fail("not-pending");

      // «کد تلاش» در URL آزمایشی (تلاش‌های تازه): نتیجه فقط برای همان تلاش
      // ثبت می‌شود — نتیجه‌ی موفقِ تلاشِ قدیمی هرگز تلاشِ جدید با مبلغِ
      // متفاوت را paid نمی‌کند (تلاش‌های پیش از ارتقا فاقد پارامتر‌اند و
      // همان تطبیقِ ref آن‌ها را می‌بندد)
      const attemptParam = params.get("attempt") ?? "";
      if (attemptParam && enrollment.paymentAttemptCode !== attemptParam) {
        return fail("stale-attempt");
      }

      // ثبت اتمیک: paid (اگر هنوز نیست) + قسط اول در یک تراکنش —
      // با تطبیق دوباره‌ی «کد تلاش و مبلغ» داخل همان تراکنش
      const result = await finalizeSuccessfulPayment({
        enrollment,
        refId: enrollment.paymentRefId ?? ref,
        cardPan: enrollment.paymentCardPan ?? "TEST-**** 1234",
        attemptCode: attemptParam || enrollment.paymentAttemptCode,
        expectedAmount: enrollment.paymentAmount,
      });
      if (result.staleAttempt) return fail("stale-attempt");
      return success();
    }

    /* — زرین‌پال — */
    const authority = params.get("Authority") ?? params.get("authority");
    const status = params.get("Status") ?? params.get("status");
    if (authority) {
      if (status !== "OK") return fail("canceled");

      const enrollment = await db.enrollment.findFirst({
        where: { paymentRefId: authority, paymentGateway: "zarinpal" },
      });
      if (!enrollment || !enrollment.paymentAmount) return fail("not-found");

      // کال‌بک تکراری برای پرداختِ قبلاً موفق → خنثی و بی‌اثر (ثبت دوباره نمی‌شود)
      if (enrollment.paymentStatus === "paid") return success();

      // تأیید درگاه — مبلغ ثبت‌شده‌ی همین سفارش ارسال می‌شود و درگاه فقط
      // در صورت تطابق کامل، تراکنش را تأیید می‌کند (کد ۱۰۰/۱۰۱)
      const result = await verifyZarinpalPayment({
        settings,
        amountToman: enrollment.paymentAmount,
        authority,
      });

      if (!result.ok) {
        return fail((await markAttemptFailed(enrollment)) ? "verify-failed" : "stale-attempt");
      }

      // ثبت اتمیک: paid (اگر هنوز نیست) + قسط اول در یک تراکنش —
      // با تطبیق دوباره‌ی «کد تلاش و مبلغ» (تلاشِ جدیدترِ آغازشده در
      // فاصله‌ی بین خواندن و ثبت، پرداختِ قدیمی را بی‌اثر می‌کند)
      const final = await finalizeSuccessfulPayment({
        enrollment,
        refId: result.refId ?? authority,
        cardPan: result.cardPan,
        attemptCode: enrollment.paymentAttemptCode,
        expectedAmount: enrollment.paymentAmount,
      });
      if (final.staleAttempt) return fail("stale-attempt");
      return success();
    }

    /* — پی‌پینگ v2 (قدیمی): فقط پرداخت‌های آغازشده پیش از ارتقای v3 —
          پی‌پینگ v3 نتیجه را POST می‌کند (بالا)؛ این مسیر GET فقط برای
          تراکنش‌های در جریانِ نسخه‌های پیشین است. — */
    const refid = params.get("refid") ?? params.get("refId");
    if (refid) {
      // پی‌پینگ «کد تلاش پرداخت» (clientRefId) را به‌عنوان پارامتر
      // clientrefid برمی‌گرداند — تراکنش فقط برای «همان تلاشِ ثبت‌شده در
      // آغاز پرداخت» تایید می‌شود؛ هیچ «آخرین سفارش در انتظار»ای انتخاب
      // نمی‌شود و بدون شناسه‌ی تلاش، کال‌بک رد می‌شود.
      const clientrefid =
        params.get("clientrefid") ?? params.get("clientRefId") ?? "";
      if (!clientrefid) return fail("order-not-found");

      // ۱) تطبیق «کد تلاش پرداخت» — جست‌وجوی دقیقِ همان تلاش
      let enrollment = await db.enrollment.findFirst({
        where: {
          paymentAttemptCode: clientrefid,
          paymentGateway: "payping",
        },
      });

      // ۲) تلاش‌های «در جریان» از نسخه‌های پیشین (بدون کد تلاش):
      //    clientrefid = شناسه‌ی ثبت‌نام بود — همان مسیر قدیمی، فقط برای
      //    پرداخت‌های آغازشده پیش از ارتقا (paymentAttemptCode تهی)
      if (!enrollment) {
        enrollment = await db.enrollment.findFirst({
          where: {
            id: clientrefid,
            paymentGateway: "payping",
            paymentAttemptCode: null,
          },
        });
      }
      if (!enrollment || !enrollment.paymentAmount) return fail("not-found");

      // کال‌بک تکراری برای پرداختِ قبلاً موفق → خنثی و بی‌اثر (ثبت دوباره نمی‌شود)
      if (enrollment.paymentStatus === "paid") return success();
      // فقط تراکنشِ «در انتظار» قابل تایید است (وضعیت failed فقط برای
      // تلاش مجدد پس از خطای گذرای درگاه پذیرفته می‌شود)
      if (
        enrollment.paymentStatus !== "pending" &&
        enrollment.paymentStatus !== "failed"
      ) {
        return fail("not-pending");
      }

      // تأیید درگاه + تطبیق مبلغ با همان مبلغِ ثبت‌شده‌ی این تلاش
      // (دوسویه: مبلغ سفارش در verify ارسال می‌شود و مبلغ پاسخ هم باید
      // دقیقاً همان باشد — تومان یا معادل ریالی ×۱۰)
      const result = await verifyPaypingLegacyV2Payment({
        settings,
        amountToman: enrollment.paymentAmount,
        refId: refid,
      });

      if (!result.ok) {
        return fail((await markAttemptFailed(enrollment)) ? "verify-failed" : "stale-attempt");
      }

      // ثبت اتمیک: paid (اگر هنوز نیست) + قسط اول در یک تراکنش —
      // با تطبیق دوباره‌ی «کد تلاش و مبلغ»؛ کال‌بک تکراری حتی در صورت
      // رقابت هم‌زمان، دوباره ثبت نمی‌کند
      const final = await finalizeSuccessfulPayment({
        enrollment,
        refId: refid,
        attemptCode: enrollment.paymentAttemptCode,
        expectedAmount: enrollment.paymentAmount,
      });
      if (final.staleAttempt) return fail("stale-attempt");
      return success();
    }

    return fail("unknown-gateway");
  } catch (error) {
    console.error("payment callback error:", error);
    return fail("server-error");
  }
}

/* ------------------------------------------------------------------ */
/* پی‌پینگ v3 — بازگشتِ POST فرم (مسیر اصلیِ نسخه‌ی ۳)                    */
/* ------------------------------------------------------------------ */

/** داده‌ی JSON فرم کال‌بک v3 — data(JSON): clientRefId, paymentCode, … */
interface PaypingCallbackData {
  clientRefId?: string;
  paymentCode?: string;
  paymentRefId?: number | string;
  amount?: number;
  gatewayAmount?: number;
  cardNumber?: string;
  cardHashPan?: string;
}

/** تحملِ مقادیر مبلغِ برگشتی درگاه — تومان (روزی رسمی) یا معادل ریالی ×۱۰ */
function matchesCommandAmount(
  returned: number,
  expectedToman: number
): boolean {
  return returned === expectedToman || returned === expectedToman * 10;
}

export async function POST(req: NextRequest) {
  // مبدا بیرونی — پشت پروکسی DirectAdmin هدرهای Host/Forwarded لحاظ می‌شوند
  const origin = forwardedOrigin(req);
  const fail = (reason: string) =>
    NextResponse.redirect(
      `${origin}/register?payment=failed&reason=${encodeURIComponent(reason)}`,
      303
    );
  const success = () =>
    NextResponse.redirect(`${origin}/register?payment=success`, 303);

  try {
    // پی‌پینگ v3 فرم x-www-form-urlencoded می‌فرستد: status/errorCode/data
    const form = await req.formData().catch(() => null);
    if (!form) return fail("invalid-callback");

    const statusRaw = form.get("status");
    const status = typeof statusRaw === "string" ? statusRaw.trim() : "";
    const errorCodeRaw = form.get("errorCode");
    const errorCode =
      typeof errorCodeRaw === "string" && errorCodeRaw.trim() !== ""
        ? errorCodeRaw.trim()
        : "";
    const dataRaw = form.get("data");
    const data: PaypingCallbackData =
      typeof dataRaw === "string" && dataRaw.trim() !== ""
        ? (() => {
            try {
              return JSON.parse(dataRaw) as PaypingCallbackData;
            } catch {
              return {};
            }
          })()
        : {};

    const clientRefId =
      typeof data.clientRefId === "string" ? data.clientRefId.trim() : "";
    const paymentCode =
      typeof data.paymentCode === "string" ? data.paymentCode.trim() : "";
    const paymentRefId = data.paymentRefId;
    const amount =
      typeof data.amount === "number" ? data.amount : undefined;
    const cardNumber =
      typeof data.cardNumber === "string" ? data.cardNumber : undefined;

    /* — پرداخت در درگاه انجام نشد (status=0) — فقط وضعیتِ «همان تلاش»
          failed می‌شود (بدون بازنویسی کد پرداخت؛ کاربر می‌تواند دوباره
          تلاش کند و درگاه ممکن است همین POST را دوباره بفرستد). — */
    if (status !== "1") {
      if (clientRefId && paymentCode && typeof amount === "number") {
        const enrollment = await db.enrollment.findFirst({
          where: {
            paymentAttemptCode: clientRefId,
            paymentGateway: "payping",
            paymentRefId: paymentCode,
          },
        });
        if (
          enrollment?.paymentAmount != null &&
          matchesCommandAmount(amount, enrollment.paymentAmount)
        ) {
          await markAttemptFailed(enrollment);
        }
      }
      return fail(errorCode ? `gateway-declined-${errorCode}` : "gateway-declined");
    }

    /* — پرداخت موفق درگاه — سه گاردِ پیش از تأیید:
          ۱) کد تلاش (clientRefId) باید «دقیقاً» همان تلاشِ ثبت‌شده باشد؛
          ۲) کد پرداخت (paymentCode) باید با مقدارِ ذخیره‌شده در آغاز
             پرداخت یکی باشد (توصیه‌ی مستند رسمی v3)؛
          ۳) مبلغ (amount) باید با مبلغِ همین تلاش منطبق باشد. — */
    if (!clientRefId || !paymentRefId) return fail("invalid-callback");

    const enrollment = await db.enrollment.findFirst({
      where: {
        paymentAttemptCode: clientRefId,
        paymentGateway: "payping",
      },
    });
    if (!enrollment || !enrollment.paymentAmount) return fail("not-found");

    // کال‌بک تکراری برای پرداختِ قبلاً موفق → خنثی و بی‌اثر
    if (enrollment.paymentStatus === "paid") return success();
    // فقط تراکنشِ «در انتظار» قابل تایید است (وضعیت failed فقط برای
    // تلاش مجدد پس از خطای گذرای درگاه پذیرفته می‌شود)
    if (
      enrollment.paymentStatus !== "pending" &&
      enrollment.paymentStatus !== "failed"
    ) {
      return fail("not-pending");
    }

    // گارد ۲ — کد پرداخت: همان paymentCode که در آغازِ همین تلاش ذخیره شد
    if (enrollment.paymentRefId !== paymentCode) {
      return fail("payment-code-mismatch");
    }
    // گارد ۳ — مبلغ: «مبلغ دستور پرداخت» اعلام‌شده در فرم باید با مبلغِ
    // ثبت‌شده‌ی همین تلاش منطبق باشد (تومان؛ معادل ریالی ×۱۰ هم تحمل می‌شود)
    if (
      typeof amount !== "number" ||
      !matchesCommandAmount(amount, enrollment.paymentAmount)
    ) {
      return fail("amount-mismatch");
    }

    // تأیید نهایی درگاه — POST /v3/pay/verify با «همان» کد رهگیری، کد
    // پرداخت و مبلغِ این تلاش؛ درگاه فقط در صورت تطابق کامل تأیید می‌کند
    const result = await verifyPaypingPayment({
      settings: await getPaymentSettings(),
      amountToman: enrollment.paymentAmount,
      paymentRefId,
      paymentCode,
    });

    // 202/502 — تأیید هنوز در حال پردازش است (مستند: تلاشِ مجددِ پرداخت
    // ممنوع؛ Verify دوباره فراخوانی شود) — وضعیت failed ثبت نمی‌شود تا
    // کال‌بکِ بعدی/تلاش مجدد بتواند همان تراکنش را نهایی کند
    if (result.processing) {
      return NextResponse.redirect(`${origin}/register?payment=pending`, 303);
    }

    if (!result.ok) {
      // تأیید قطعی ناموفق — فقط وضعیت failed (کد پرداخت دست‌نخورده
      // می‌ماند تا Verify بعدی با همان کد ممکن باشد)
      return fail((await markAttemptFailed(enrollment)) ? "verify-failed" : "stale-attempt");
    }

    // مبلغ تأییدشده‌ی درگاه (پاسخ Verify یا پیامِ 409/110) هم باید با
    // مبلغِ همین تلاش منطبق باشد — تطبیق دوسویه با خودِ درگاه
    if (
      typeof result.amount !== "number" ||
      !matchesCommandAmount(result.amount, enrollment.paymentAmount)
    ) {
      return fail("amount-mismatch");
    }
    // اگر درگاه «شناسه‌ی ارجاع» برگرداند، باید همان کد تلاش باشد
    if (result.clientRefId && result.clientRefId !== clientRefId) {
      return fail("attempt-mismatch");
    }

    // ثبت اتمیک: paid (اگر هنوز نیست) + قسط اول در یک تراکنش — با
    // «تطبیق دوباره‌ی کد تلاش و مبلغ» داخل همان تراکنش؛ نتیجه‌ی موفقِ
    // تلاشِ قبلی هرگز تلاشِ جدید با مبلغ متفاوت را paid نمی‌کند
    const final = await finalizeSuccessfulPayment({
      enrollment,
      refId: String(paymentRefId),
      cardPan: cardNumber ?? null,
      attemptCode: clientRefId,
      expectedAmount: enrollment.paymentAmount,
    });
    if (final.staleAttempt) return fail("stale-attempt");
    return success();
  } catch (error) {
    console.error("payment callback (v3 POST) error:", error);
    return fail("server-error");
  }
}
