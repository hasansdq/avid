import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/user-auth";
import { isGroupFull } from "@/lib/course-availability";
import { ensureInstallmentPlan } from "@/lib/installments";
import { checkDiscountCode, findDiscountCode } from "@/lib/payment";

/**
 * POST /api/enroll — مرحله‌ی دوم فرم پیش‌ثبت‌نام:
 * انتخاب دوره (+ گروه برای دوره‌های حضوری)، روش پرداخت و کد تخفیف.
 *
 * body: {
 *   course: string,
 *   groupId?: string,
 *   paymentMethod?: "cash" | "installment",
 *   discountCode?: string, // کد تخفیف (اختیاری)
 * }
 *
 * • عبور از مرحله‌ی اول (ثبت‌نام و تایید پیامکی) الزامی است —
 *   نشست کاربر باید وجود داشته باشد؛ نام و شماره از حساب خوانده می‌شود.
 * • ظرفیت دوره/گروه در سرور اعمال می‌شود: دوره‌ی حضوریِ گروه‌دار در
 *   سطح گروه محدود است؛ بقیه‌ی دوره‌ها با ظرفیت خود دوره.
 * • کد تخفیف در سرور دوباره اعتبارسنجی می‌شود؛ در صورت معتبر بودن
 *   مبلغ تخفیف روی ثبت‌نام ذخیره و شمارنده‌ی استفاده‌ی کد افزایش می‌یابد.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json(
        {
          error:
            "ابتدا مرحله‌ی ثبت‌نام و تایید شماره موبایل را کامل کنید؛ سپس دوره انتخاب شود.",
          needLogin: true,
        },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    const course =
      typeof body?.course === "string" ? body.course.trim() : "";
    const groupId = typeof body?.groupId === "string" ? body.groupId : "";
    const paymentMethod =
      body?.paymentMethod === "installment" ? "installment" : "cash";
    const discountCodeRaw =
      typeof body?.discountCode === "string" ? body.discountCode.trim() : "";

    if (course.length < 3 || course.length > 120) {
      return NextResponse.json(
        { error: "دوره انتخاب‌شده معتبر نیست." },
        { status: 400 }
      );
    }

    // — دوره‌ی منتشرشده با این عنوان —
    const courseRecord = await db.course.findFirst({
      where: { title: course, published: true },
      include: {
        groups: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!courseRecord) {
      return NextResponse.json(
        { error: "دوره‌ی انتخاب‌شده در سیستم یافت نشد." },
        { status: 404 }
      );
    }

    let selectedGroup: {
      id: string;
      title: string;
      capacity: number;
    } | null = null;

    // — دوره‌ی حضوریِ دارای گروه: انتخاب گروه و اعمال ظرفیت گروه —
    if (courseRecord.type === "inperson" && courseRecord.groups.length > 0) {
      const group = courseRecord.groups.find((g) => g.id === groupId);
      if (!group) {
        return NextResponse.json(
          {
            error:
              "برای این دوره‌ی حضوری، گروه زمانی مورد نظر خود را انتخاب کنید.",
          },
          { status: 400 }
        );
      }
      const groupEnrolled = await db.enrollment.count({
        where: { groupId: group.id, status: { not: "archived" } },
      });
      if (isGroupFull(group, groupEnrolled)) {
        return NextResponse.json(
          {
            error: `ظرفیت «${group.title}» از دوره «${course}» تکمیل شده است؛ لطفاً گروه یا دوره‌ی دیگری انتخاب کنید.`,
            full: true,
          },
          { status: 409 }
        );
      }
      selectedGroup = {
        id: group.id,
        title: group.title,
        capacity: group.capacity,
      };
    } else {
      // — ظرفیت کل دوره (آنلاین یا حضوری بدون گروه) —
      const enrolledCount = await db.enrollment.count({
        where: { course, status: { not: "archived" } },
      });
      if (
        courseRecord.capacity > 0 &&
        enrolledCount >= courseRecord.capacity
      ) {
        return NextResponse.json(
          {
            error: `ظرفیت دوره «${course}» تکمیل شده است؛ امکان پیش‌ثبت‌نام و پرداخت برای این دوره وجود ندارد.`,
            full: true,
          },
          { status: 409 }
        );
      }
    }

    const fullName = `${user.firstName} ${user.lastName}`.trim();

    // — کد تخفیف (اختیاری): اعتبارسنجی سروری بر اساس شهریه‌ی همین دوره —
    let discountAmount = 0;
    let appliedDiscountCode: string | null = null;
    if (discountCodeRaw) {
      const base =
        paymentMethod === "installment"
          ? courseRecord.installmentTuition
          : courseRecord.cashTuition;
      const record = await findDiscountCode(discountCodeRaw);
      if (!record) {
        return NextResponse.json(
          { error: "کد تخفیف یافت نشد." },
          { status: 400 }
        );
      }
      const check = checkDiscountCode(record, paymentMethod, base);
      if (!check.ok) {
        return NextResponse.json(
          { error: check.reason },
          { status: 400 }
        );
      }
      discountAmount = check.discountAmount;
      appliedDiscountCode = record.code;
      // مصرف کد — هر ثبت‌نام یک استفاده
      await db.discountCode.update({
        where: { id: record.id },
        data: { usedCount: { increment: 1 } },
      });
    }

    const enrollment = await db.enrollment.create({
      data: {
        name: fullName,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        course,
        paymentMethod,
        ...(appliedDiscountCode
          ? {
              discountCode: appliedDiscountCode,
              discountAmount:
                discountAmount > 0 ? discountAmount : null,
            }
          : {}),
        ...(selectedGroup
          ? {
              group: { connect: { id: selectedGroup.id } },
              groupTitle: selectedGroup.title,
            }
          : {}),
        user: { connect: { id: user.id } },
      },
    });

    // — پرداخت اقساطی: طرح اقساط همین‌جا ساخته می‌شود —
    // (مبلغ کل = شهریه‌ی اقساطی دوره منهای تخفیف)
    if (paymentMethod === "installment") {
      await ensureInstallmentPlan(
        enrollment.id,
        courseRecord.installmentTuition > 0
          ? Math.max(
              0,
              courseRecord.installmentTuition - discountAmount
            )
          : undefined
      );
    }

    return NextResponse.json({ ok: true, id: enrollment.id }, { status: 201 });
  } catch (error) {
    console.error("enroll error:", error);
    return NextResponse.json(
      { error: "خطای داخلی سرور. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
