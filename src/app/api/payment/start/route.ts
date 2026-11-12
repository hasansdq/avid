import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getPaymentSettings,
  isPaymentEnabled,
  payableAmount,
  requestZarinpalPayment,
  requestPaypingPayment,
} from "@/lib/payment";
import {
  countActiveEnrollments,
  countActiveGroupEnrollments,
} from "@/lib/course-availability";
import { forwardedOrigin } from "@/lib/http";

/**
 * POST /api/payment/start — آغاز پرداخت پیش‌ثبت‌نام.
 *
 * body: { enrollmentId: string, method?: "cash" | "installment" }
 *
 * مبلغ از شهریه‌ی اختصاصی دوره‌ی انتخاب‌شده (نقدی/اقساطی) محاسبه،
 * تخفیف ثبت‌شده‌ی ثبت‌نام (در صورت وجود) کسر و مبلغ نهایی ذخیره
 * می‌شود و آدرس درگاه برای ریدایرکت کاربر برگردانده می‌شود.
 * اگر مبلغ پس از تخفیف صفر شود، ثبت‌نام بدون درگاه تسویه می‌شود.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const enrollmentId =
      typeof body?.enrollmentId === "string" ? body.enrollmentId : "";

    if (!enrollmentId) {
      return NextResponse.json(
        { error: "شناسه‌ی ثبت‌نام ارسال نشده است." },
        { status: 400 }
      );
    }

    const enrollment = await db.enrollment.findUnique({
      where: { id: enrollmentId },
    });
    if (!enrollment) {
      return NextResponse.json(
        { error: "ثبت‌نام یافت نشد." },
        { status: 404 }
      );
    }
    if (enrollment.paymentStatus === "paid") {
      return NextResponse.json(
        { error: "این ثبت‌نام قبلاً پرداخت شده است." },
        { status: 400 }
      );
    }

    const saveAttempt = async (data: Prisma.EnrollmentUpdateManyMutationInput) => {
      const { count } = await db.enrollment.updateMany({
        where: {
          id: enrollment.id,
          paymentStatus: enrollment.paymentStatus,
          paymentGateway: enrollment.paymentGateway,
          paymentRefId: enrollment.paymentRefId,
          paymentAttemptCode: enrollment.paymentAttemptCode,
        },
        data,
      });
      return count === 1;
    };
    const staleAttempt = () =>
      NextResponse.json(
        { error: "وضعیت این ثبت‌نام تغییر کرده است. لطفاً دوباره بررسی کنید." },
        { status: 409 }
      );

    const settings = await getPaymentSettings();
    if (!isPaymentEnabled(settings)) {
      return NextResponse.json(
        { error: "پرداخت آنلاین فعال نیست؛ کارشناسان ما با شما تماس می‌گیرند." },
        { status: 400 }
      );
    }

    // دوره‌ی انتخاب‌شده — شهریه از رکورد خود دوره خوانده می‌شود؛
    // قالب اقساط دوره (در صورت وجود) تعداد اقساط را تعیین می‌کند
    const course = await db.course.findFirst({
      where: { title: enrollment.course },
      include: { installmentTemplate: { orderBy: { index: "asc" } } },
    });
    if (!course) {
      return NextResponse.json(
        {
          error:
            "دوره‌ی انتخاب‌شده در سیستم یافت نشد؛ لطفاً با پشتیبانی تماس بگیرید.",
        },
        { status: 404 }
      );
    }

    // — تعداد اقساط مؤثر: قالب اختصاصی دوره یا پیش‌فرض سراسری —
    const effectiveSettings = {
      ...settings,
      installmentCount:
        course.installmentTemplate.length > 0
          ? course.installmentTemplate.length
          : settings.installmentCount,
    };

    // — اعمال ظرفیت: اگر ظرفیت دوره/گروه تکمیل شده باشد، پرداخت انجام نمی‌شود —
    // توجه: خودِ این ثبت‌نام یک صندلی را اشغال کرده است؛ بنابراین فقط وقتی
    // تعداد فعال‌ها از ظرفیت «فراتر» رفته باشد (مثلاً بعد از کاهش ظرفیت توسط
    // مدیر) مسدود می‌کنیم.

 // — گروه انتخابی (دوره‌ی حضوری): ظرفیت گروه معیار است —
    if (enrollment.groupId) {
      const group = await db.courseGroup.findUnique({
        where: { id: enrollment.groupId },
      });
      if (group && group.capacity > 0) {
        const groupActive = await countActiveGroupEnrollments(group.id);
        if (groupActive > group.capacity) {
          return NextResponse.json(
            {
              error:
                "ظرفیت این گروه از دوره در همین لحظه تکمیل شده است؛ پرداخت انجام نمی‌شود. کارشناسان ما با شما تماس می‌گیرند.",
              full: true,
            },
            { status: 409 }
          );
        }
      }
    }

    // — سطح دوره (آنلاین / حضوری بدون گروه) —
    if (course.capacity > 0) {
      const activeCount = await countActiveEnrollments(course.title);
      if (activeCount > course.capacity) {
        return NextResponse.json(
          {
            error:
              "ظرفیت این دوره در همین لحظه تکمیل شده است؛ پرداخت انجام نمی‌شود. کارشناسان ما با شما تماس می‌گیرند.",
            full: true,
          },
          { status: 409 }
        );
      }
    }

    const method =
      body?.method === "installment" ||
      enrollment.paymentMethod === "installment"
        ? "installment"
        : "cash";
    // — تخفیف اعمال‌شده‌ی همین ثبت‌نام (در صورت استفاده از کد) —
    const discountAmount = enrollment.discountAmount ?? 0;
    const amount = payableAmount(
      course,
      effectiveSettings,
      method,
      discountAmount
    );

    // آدرس بازگشت درگاه — مبدا بیرونی درخواست (با احترام به هدرهای پروکسی DirectAdmin)
    const origin = forwardedOrigin(req);
    const callbackUrl = `${origin}/api/payment/callback`;

    // — مبلغ پس از تخفیف صفر است: ثبت‌نام بدون درگاه تسویه می‌شود —
    if (amount <= 0) {
      if (method === "installment" && course.installmentTuition <= 0) {
        return NextResponse.json(
          {
            error:
              "برای این دوره پرداخت اقساطی تعریف نشده است.",
          },
          { status: 400 }
        );
      }
      const saved = await saveAttempt({
        paymentMethod: method,
        paymentAmount: 0,
        paymentGateway: settings.gateway,
        paymentStatus: "paid",
        paidAt: new Date(),
        paymentAttemptCode: null,
        paymentRefId: null,
      });
      if (!saved) return staleAttempt();
      return NextResponse.json({
        redirectUrl: `${origin}/register?payment=success`,
        free: true,
      });
    }
    const description = `پیش‌ثبت‌نام دوره «${enrollment.course}» — ${enrollment.name}`;

    // — حالت آزمایشی: بدون تماس با درگاه، به کال‌بک شبیه‌سازی می‌رویم —
    if (settings.gateway === "test") {
      const simRef = `TEST-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`;
      const saved = await saveAttempt({
        paymentMethod: method,
        paymentAmount: amount,
        paymentGateway: "test",
        paymentRefId: simRef,
        paymentAttemptCode: simRef,
        paymentStatus: "pending",
      });
      if (!saved) return staleAttempt();
      return NextResponse.json({
        redirectUrl: `${callbackUrl}?gateway=test&ref=${encodeURIComponent(
          simRef
        )}&enrollmentId=${enrollment.id}`,
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
        orderId: enrollment.id,
      });
      const saved = await saveAttempt({
        paymentMethod: method,
        paymentAmount: amount,
        paymentGateway: "zarinpal",
        paymentRefId: authority,
        paymentAttemptCode: authority,
        paymentStatus: "pending",
      });
      if (!saved) return staleAttempt();
      return NextResponse.json({ redirectUrl });
    }

    // کد پرداخت پی‌پینگ همراه شناسه ثبت‌نام برای تأیید callback ذخیره می‌شود.
    const { redirectUrl, code } = await requestPaypingPayment({
      settings,
      amountToman: amount,
      callbackUrl,
      description,
      clientRefId: enrollment.id,
      payerIdentity: enrollment.phone,
      payerName: enrollment.name,
    });
    const saved = await saveAttempt({
      paymentMethod: method,
      paymentAmount: amount,
      paymentGateway: "payping",
      paymentRefId: code,
      paymentAttemptCode: code,
      paymentStatus: "pending",
    });
    if (!saved) return staleAttempt();
    return NextResponse.json({ redirectUrl });
  } catch (error) {
    console.error("payment start error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "خطا در آغاز پرداخت. لطفاً دوباره تلاش کنید.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
