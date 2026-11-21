import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/user-auth";
import {
  getPaymentSettings,
  isPaymentEnabled,
  requestZarinpalPayment,
  requestPaypingPayment,
} from "@/lib/payment";
import { forwardedOrigin } from "@/lib/http";

/**
 * POST /api/payment/installment/start — آغاز پرداختِ «یک یا چند قسط» از پنل کاربر.
 *
 * body: { installmentIds: string[] } — شناسه‌ی اقساطِ پرداخت‌نشده‌ی یک ثبت‌نام
 *
 * امنیت: قسط‌ها باید به ثبت‌نامِ «خودِ کاربرِ وارد‌شده» تعلق داشته باشند،
 * همه پرداخت‌نشده باشند و همه به یک ثبت‌نام مربوط باشند.
 *
 * برای هر تلاش رکورد InstallmentPayment با «کد تلاش» یکتا ساخته می‌شود
 * (برای پی‌پینگ همان کد به‌عنوان clientRefId ارسال می‌شود)؛ کال‌بک درگاه
 * فقط برای همان تلاشِ دقیق — با تطبیق کد تلاش و مبلغ — اقساط را paid
 * می‌کند (GET/POST /api/payment/installment/callback).
 */

/** تولید کد یکتای تلاش پرداخت قسط — «INS-» + ۱۶ نویسه‌ی تصادفی hex */
function newInstallmentAttemptCode(): string {
  return `INS-${randomBytes(8).toString("hex").toUpperCase()}`;
}

export async function POST(req: NextRequest) {
  try {
    // — فقط کاربرِ وارد‌شده می‌تواند قسط خود را بپردازد —
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json(
        { error: "برای پرداخت قسط، ابتدا وارد حساب خود شوید." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    // تایپ صریح: بدون آن، استنتاج any → Set<unknown> → unknown[] می‌شود
    const rawIds: unknown[] | null = Array.isArray(body?.installmentIds)
      ? (body.installmentIds as unknown[])
      : null;
    if (!rawIds || rawIds.length === 0) {
      return NextResponse.json(
        { error: "شناسه‌ی قسط ارسال نشده است." },
        { status: 400 }
      );
    }
    if (rawIds.length > 36) {
      return NextResponse.json(
        { error: "حداکثر ۳۶ قسط در یک تلاش قابل پرداخت است." },
        { status: 400 }
      );
    }
    const installmentIds = Array.from(
      new Set(
        rawIds.filter((v): v is string => typeof v === "string" && v.length > 0)
      )
    );
    if (installmentIds.length === 0) {
      return NextResponse.json(
        { error: "شناسه‌ی قسط معتبر ارسال نشده است." },
        { status: 400 }
      );
    }

    // — اقساط همراه ثبت‌نامِ آن‌ها —
    const installments = await db.installment.findMany({
      where: { id: { in: installmentIds } },
      include: { enrollment: true },
    });
    if (installments.length !== installmentIds.length) {
      return NextResponse.json(
        { error: "یک یا چند قسط یافت نشد." },
        { status: 404 }
      );
    }

    // همه به یک ثبت‌نام تعلق دارند
    const enrollmentIds = new Set(installments.map((i) => i.enrollmentId));
    if (enrollmentIds.size !== 1) {
      return NextResponse.json(
        { error: "اقساط انتخابی باید همه به یک دوره تعلق داشته باشند." },
        { status: 400 }
      );
    }
    const enrollment = installments[0].enrollment;

    // قسط‌ها به کاربرِ وارد‌شده تعلق دارند
    if (enrollment.userId !== session.id) {
      return NextResponse.json(
        { error: "این اقساط به حساب شما تعلق ندارد." },
        { status: 403 }
      );
    }

    // همه پرداخت‌نشده‌اند
    const alreadyPaid = installments.filter((i) => i.status === "paid");
    if (alreadyPaid.length > 0) {
      return NextResponse.json(
        {
          error: `قسط انتخابی قبلاً پرداخت شده است.`,
        },
        { status: 400 }
      );
    }

    const amount = installments.reduce((s, i) => s + i.amount, 0);
    if (amount <= 0) {
      return NextResponse.json(
        { error: "مبلغ قابل پرداخت این اقساط صفر است." },
        { status: 400 }
      );
    }

    const settings = await getPaymentSettings();
    if (!isPaymentEnabled(settings)) {
      return NextResponse.json(
        { error: "پرداخت آنلاین فعال نیست؛ کارشناسان ما با شما تماس می‌گیرند." },
        { status: 400 }
      );
    }

    // آدرس بازگشت درگاه — مخصوص چرخه‌ی اقساط (مستقل از کال‌بک پیش‌ثبت‌نام)
    const origin = forwardedOrigin(req);
    const callbackUrl = `${origin}/api/payment/installment/callback`;

    const attemptCode = newInstallmentAttemptCode();
    const payerName =
      `${enrollment.firstName} ${enrollment.lastName}`.trim() ||
      enrollment.name ||
      session.phone;
    const description = `پرداخت ${
      installments.length > 1
        ? `${installments.length} قسط`
        : "قسط"
    } دوره «${enrollment.course}» — ${payerName}`;

    // — رکورد تلاش: pending تا کال‌بکِ همان تلاش آن را نهایی کند —
    const payment = await db.installmentPayment.create({
      data: {
        enrollmentId: enrollment.id,
        installmentIds: JSON.stringify(installmentIds),
        amount,
        status: "pending",
        gateway: settings.gateway,
        attemptCode,
      },
    });

    // — حالت آزمایشی: بدون تماس با درگاه، به کال‌بک شبیه‌سازی می‌رویم —
    if (settings.gateway === "test") {
      const simRef = `TESTINS-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`;
      await db.installmentPayment.update({
        where: { id: payment.id },
        data: { refId: simRef },
      });
      return NextResponse.json({
        redirectUrl: `${callbackUrl}?gateway=test&ref=${encodeURIComponent(
          simRef
        )}&paymentId=${payment.id}&attempt=${encodeURIComponent(attemptCode)}`,
      });
    }

    // — زرین‌پال —
    if (settings.gateway === "zarinpal") {
      const { redirectUrl, authority } = await requestZarinpalPayment({
        settings,
        amountToman: amount,
        callbackUrl,
        description,
        mobile: enrollment.phone,
        orderId: payment.id,
      });
      await db.installmentPayment.update({
        where: { id: payment.id },
        data: { refId: authority },
      });
      return NextResponse.json({ redirectUrl });
    }

    // — پی‌پینگ (نسخه‌ی ۳) — clientRefId = کد تلاش؛ کد پرداخت درگاه
    // در آغاز ذخیره می‌شود تا کال‌بک فقط برای همان تلاش معتبر باشد.
    const { redirectUrl, code } = await requestPaypingPayment({
      settings,
      amountToman: amount,
      callbackUrl,
      description,
      clientRefId: attemptCode,
    });
    await db.installmentPayment.update({
      where: { id: payment.id },
      data: { refId: code },
    });
    return NextResponse.json({ redirectUrl });
  } catch (error) {
    console.error("installment payment start error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "خطا در آغاز پرداخت قسط. لطفاً دوباره تلاش کنید.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
