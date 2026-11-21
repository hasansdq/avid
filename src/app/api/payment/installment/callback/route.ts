import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getPaymentSettings,
  verifyZarinpalPayment,
  verifyPaypingPayment,
} from "@/lib/payment";
import {
  finalizeInstallmentPayment,
  markInstallmentAttemptFailed,
} from "@/lib/installment-payment";
import { forwardedOrigin } from "@/lib/http";

/**
 * نقطه‌ی بازگشت از درگاه برای پرداختِ اقساط (چرخه‌ی مستقل از پیش‌ثبت‌نام).
 *
 * POST /api/payment/installment/callback — پی‌پینگ v3 (فرم x-www-form-urlencoded):
 *   status=1|0  errorCode=…  data={clientRefId, paymentCode, paymentRefId,
 *   amount, cardNumber, …} (data = رشته‌ی JSON) — همان گاردهای کال‌بکِ
 *   پیش‌ثبت‌نام: تطبیق «کد تلاش» (clientRefId)، «کد پرداخت» (paymentCode)
 *   و «مبلغ» با رکورد InstallmentPayment؛ سپس تأیید v3/pay/verify.
 *
 * GET — درگاه‌های رشته‌ی کوئری:
 *   • آزمایشی: ?gateway=test&ref=...&paymentId=...&attempt=...
 *     (فقط وقتی درگاه آزمایشی سمت سرور فعال و تراکنش در انتظار باشد)
 *   • زرین‌پال: ?Authority=...&Status=OK|NOK
 *
 * پس از تأیید، همه‌ی اقساطِ تحت پوششِ همان تلاش در «یک تراکنش واحد» paid
 * می‌شوند (کال‌بک تکراری بی‌اثر است) و کاربر به /panel?payment=success
 * هدایت می‌شود — همان پاپ‌آپ نتیجه‌ی پرداخت.
 */

/** تحملِ مقادیر مبلغِ برگشتی درگاه — تومان یا معادل ریالی ×۱۰ */
function matchesCommandAmount(
  returned: number,
  expectedToman: number
): boolean {
  return returned === expectedToman || returned === expectedToman * 10;
}

/** داده‌ی JSON فرم کال‌بک v3 پی‌پینگ */
interface PaypingCallbackData {
  clientRefId?: string;
  paymentCode?: string;
  paymentRefId?: number | string;
  amount?: number;
  cardNumber?: string;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const origin = forwardedOrigin(req);
  const fail = (reason: string) =>
    NextResponse.redirect(
      `${origin}/panel?payment=failed&reason=${encodeURIComponent(reason)}`,
      303
    );
  const success = () =>
    NextResponse.redirect(`${origin}/panel?payment=success`, 303);

  try {
    const settings = await getPaymentSettings();

    /* — حالت آزمایشی: فقط با فعال‌سازی سمت سرور — */
    if (params.get("gateway") === "test") {
      if (settings.gateway !== "test") return fail("test-mode-disabled");

      const ref = params.get("ref") ?? "";
      const paymentId = params.get("paymentId") ?? "";
      if (!ref || !paymentId) return fail("invalid-test");

      const payment = await db.installmentPayment.findUnique({
        where: { id: paymentId },
      });
      if (
        !payment ||
        payment.gateway !== "test" ||
        payment.refId !== ref
      ) {
        return fail("not-found");
      }
      // کال‌بک تکراری برای پرداختِ قبلاً موفق → خنثی و بی‌اثر
      if (payment.status === "paid") return success();
      if (payment.status !== "pending") return fail("not-pending");

      const attemptParam = params.get("attempt") ?? "";
      if (attemptParam && payment.attemptCode !== attemptParam) {
        return fail("stale-attempt");
      }

      const result = await finalizeInstallmentPayment({
        payment: {
          id: payment.id,
          attemptCode: payment.attemptCode,
          amount: payment.amount,
        },
        refId: payment.refId ?? ref,
        cardPan: "TEST-**** 1234",
        expectedAmount: payment.amount,
      });
      if (result.staleAttempt) return fail("stale-attempt");
      return success();
    }

    /* — زرین‌پال — */
    const authority = params.get("Authority") ?? params.get("authority");
    const status = params.get("Status") ?? params.get("status");
    if (authority) {
      if (status !== "OK") return fail("canceled");

      const payment = await db.installmentPayment.findFirst({
        where: { refId: authority, gateway: "zarinpal" },
      });
      if (!payment || !payment.amount) return fail("not-found");

      if (payment.status === "paid") return success();
      if (payment.status !== "pending" && payment.status !== "failed") {
        return fail("not-pending");
      }

      const result = await verifyZarinpalPayment({
        settings,
        amountToman: payment.amount,
        authority,
      });
      if (!result.ok) {
        return fail(
          (await markInstallmentAttemptFailed(payment))
            ? "verify-failed"
            : "stale-attempt"
        );
      }

      const final = await finalizeInstallmentPayment({
        payment: {
          id: payment.id,
          attemptCode: payment.attemptCode,
          amount: payment.amount,
        },
        refId: result.refId ?? authority,
        cardPan: result.cardPan,
        expectedAmount: payment.amount,
      });
      if (final.staleAttempt) return fail("stale-attempt");
      return success();
    }

    return fail("unknown-gateway");
  } catch (error) {
    console.error("installment payment callback (GET) error:", error);
    return fail("server-error");
  }
}

/* ————— پی‌پینگ v3 — بازگشتِ POST فرم (مسیر اصلیِ نسخه‌ی ۳) ————— */

export async function POST(req: NextRequest) {
  const origin = forwardedOrigin(req);
  const fail = (reason: string) =>
    NextResponse.redirect(
      `${origin}/panel?payment=failed&reason=${encodeURIComponent(reason)}`,
      303
    );
  const success = () =>
    NextResponse.redirect(`${origin}/panel?payment=success`, 303);

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
          failed می‌شود؛ کاربر می‌تواند دوباره تلاش کند. — */
    if (status !== "1") {
      if (clientRefId && paymentCode && typeof amount === "number") {
        const payment = await db.installmentPayment.findFirst({
          where: {
            attemptCode: clientRefId,
            gateway: "payping",
            refId: paymentCode,
          },
        });
        if (payment) {
          await markInstallmentAttemptFailed(payment, amount);
        }
      }
      return fail(
        errorCode ? `gateway-declined-${errorCode}` : "gateway-declined"
      );
    }

    /* — پرداخت موفق درگاه — سه گاردِ پیش از تأیید:
          ۱) کد تلاش (clientRefId) باید دقیقاً همان تلاشِ ثبت‌شده باشد؛
          ۲) کد پرداخت (paymentCode) باید با مقدارِ ذخیره‌شده در آغاز پرداخت
             یکی باشد؛
          ۳) مبلغ (amount) باید با مبلغِ همین تلاش منطبق باشد. — */
    if (!clientRefId || !paymentRefId) return fail("invalid-callback");

    const payment = await db.installmentPayment.findFirst({
      where: {
        attemptCode: clientRefId,
        gateway: "payping",
      },
    });
    if (!payment || !payment.amount) return fail("not-found");

    // کال‌بک تکراری برای پرداختِ قبلاً موفق → خنثی و بی‌اثر
    if (payment.status === "paid") return success();
    // فقط تراکنشِ «در انتظار» قابل تایید است (failed = تلاش مجدد پس از خطا)
    if (payment.status !== "pending" && payment.status !== "failed") {
      return fail("not-pending");
    }

    // گارد ۲ — کد پرداخت
    if (payment.refId !== paymentCode) {
      return fail("payment-code-mismatch");
    }
    // گارد ۳ — مبلغ
    if (
      typeof amount !== "number" ||
      !matchesCommandAmount(amount, payment.amount)
    ) {
      return fail("amount-mismatch");
    }

    // تأیید نهایی درگاه — POST /v3/pay/verify
    const result = await verifyPaypingPayment({
      settings: await getPaymentSettings(),
      amountToman: payment.amount,
      paymentRefId,
      paymentCode,
    });

    // 202/502 — تأیید هنوز در حال پردازش است؛ کال‌بکِ بعدی نهایی می‌کند
    if (result.processing) {
      return NextResponse.redirect(
        `${origin}/panel?payment=pending`,
        303
      );
    }

    if (!result.ok) {
      return fail(
        (await markInstallmentAttemptFailed(payment))
          ? "verify-failed"
          : "stale-attempt"
      );
    }

    // مبلغ تأییدشده‌ی درگاه هم باید با مبلغِ همین تلاش منطبق باشد
    if (
      typeof result.amount !== "number" ||
      !matchesCommandAmount(result.amount, payment.amount)
    ) {
      return fail("amount-mismatch");
    }
    // اگر درگاه «شناسه‌ی ارجاع» برگرداند، باید همان کد تلاش باشد
    if (result.clientRefId && result.clientRefId !== clientRefId) {
      return fail("attempt-mismatch");
    }

    // ثبت اتمیک: تلاش paid + همه‌ی اقساطِ تحت پوشش paid در یک تراکنش
    const final = await finalizeInstallmentPayment({
      payment: {
        id: payment.id,
        attemptCode: payment.attemptCode,
        amount: payment.amount,
      },
      refId: String(paymentRefId),
      cardPan: cardNumber ?? null,
      expectedAmount: payment.amount,
    });
    if (final.staleAttempt) return fail("stale-attempt");
    return success();
  } catch (error) {
    console.error("installment payment callback (POST) error:", error);
    return fail("server-error");
  }
}
