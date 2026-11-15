import { db } from "@/lib/db";
import { getPaymentSettings } from "@/lib/payment";

/**
 * طرح اقساط ثبت‌نام‌ها
 *
 * برای هر ثبت‌نامِ «پرداخت اقساطی» یک طرح اقساط ساخته می‌شود:
 *  • مبلغ کل = شهریه‌ی اقساطی همان دوره (Course.installmentTuition)
 *    منهای تخفیف کد تخفیف (در صورت استفاده)
 *  • تعداد اقساط = تعداد ردیف‌های «قالب اقساط دوره» (CourseInstallment)
 *    و اگر قالبی تعریف نشده باشد = PaymentSettings.installmentCount (پیش‌فرض ۳)
 *  • سررسیدها = تاریخ‌های قالب اختصاصی دوره؛ در نبود قالب:
 *    قسط k = تاریخ ثبت‌نام + ۳۰×(k-1) روز
 *  • قسط ۱ = سقف تقسیم (ceil) — همان مبلغ قابل پرداخت در درگاه
 *  • اقساط ۲ تا N-۱ = تقسیم پایه‌ی باقیمانده (floor)
 *  • قسط آخر = جبران باقیمانده تا جمع کل دقیقاً برابر مبلغ کل شود
 *
 * هر دو تابع throw-safe هستند؛ خطاها فقط ثبت می‌شوند.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ساخت/تضمین طرح اقساط برای یک ثبت‌نام اقساطی.
 * اگر طرح از قبل وجود داشته باشد، دوره یافت نشود یا مبلغ کل
 * صفر باشد، چیزی ساخته نمی‌شود.
 *
 * @param totalOverride مبلغ کل طرح پس از کسر تخفیف (تومان) —
 *        در صورت عدم ارائه، شهریه‌ی اقساطی خود دوره ملاک است.
 * @returns تعداد اقساط ساخته‌شده (۰ = چیزی ساخته نشد)
 */
export async function ensureInstallmentPlan(
  enrollmentId: string,
  totalOverride?: number
): Promise<number> {
  try {
    const enrollment = await db.enrollment.findUnique({
      where: { id: enrollmentId },
    });
    if (!enrollment) return 0;

    // طرح از قبل وجود دارد — دوباره‌سازی ممنوع
    const existing = await db.installment.findFirst({
      where: { enrollmentId },
      select: { id: true },
    });
    if (existing) return 0;

    // مبلغ کل طرح = شهریه‌ی اقساطی همان دوره (بر اساس عنوان ذخیره‌شده)
    // منهای تخفیف اعمال‌شده (totalOverride)
    const course = await db.course.findFirst({
      where: { title: enrollment.course },
      include: {
        installmentTemplate: { orderBy: { index: "asc" } },
      },
    });
    if (!course) return 0;
    const total = Math.max(
      0,
      totalOverride ?? course.installmentTuition
    );
    if (total <= 0) return 0;

    const settings = await getPaymentSettings();

    // — قالب اختصاصی دوره: تعداد و تاریخ سررسید هر قسط —
    const template = course.installmentTemplate;
    const count =
      template.length > 0
        ? template.length
        : Math.max(1, settings.installmentCount || 3);

    // — توزیع مبالغ: جمع اقساط دقیقاً برابر total —
    const first = Math.ceil(total / count); // قسط اول (پرداخت درگاه)
    const remaining = total - first; // باقیمانده برای اقساط ۲..count
    const base = Math.floor(remaining / (count - 1)); // تقسیم پایه (وقتی count > 1)
    // آخرین قسط باقیمانده‌ی تقسیم را جذب می‌کند
    const last = count > 1 ? remaining - base * (count - 2) : 0;

    const createdAt = enrollment.createdAt;
    const rows: {
      enrollmentId: string;
      index: number;
      amount: number;
      dueDate: Date;
      status: string;
    }[] = [];
    for (let k = 1; k <= count; k++) {
      const amount =
        k === 1 ? first : k === count ? last : base;
      if (amount <= 0) continue; // محافظ آزمایشی برای حالت‌های خاص
      // سررسید: از قالب دوره؛ در نبود قالب، فاصله‌ی ۳۰ روزه از ثبت‌نام
      const dueDate =
        template.length > 0 && template[k - 1]
          ? new Date(template[k - 1].dueDate)
          : new Date(createdAt.getTime() + 30 * (k - 1) * DAY_MS);
      if (Number.isNaN(dueDate.getTime())) continue;
      rows.push({
        enrollmentId,
        index: k,
        amount,
        dueDate,
        status: "pending",
      });
    }
    if (rows.length === 0) return 0;

    await db.installment.createMany({ data: rows });
    return rows.length;
  } catch (error) {
    console.error("ensureInstallmentPlan error:", error);
    return 0;
  }
}

/**
 * پرداخت موفق → نخستین قسط پرداخت‌نشده (کوچک‌ترین index) علامت
 * «پرداخت‌شده» می‌خورد. اگر قسطی باقی نمانده باشد کاری نمی‌کند.
 */
export async function markFirstInstallmentPaid(
  enrollmentId: string
): Promise<void> {
  try {
    const installment = await db.installment.findFirst({
      where: { enrollmentId, status: { not: "paid" } },
      orderBy: { index: "asc" },
    });
    if (!installment) return;

    await db.installment.update({
      where: { id: installment.id },
      data: { status: "paid", paidAt: new Date() },
    });
  } catch (error) {
    console.error("markFirstInstallmentPaid error:", error);
  }
}
