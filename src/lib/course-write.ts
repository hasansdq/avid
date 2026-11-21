import { db } from "@/lib/db";
import {
  bad,
  type CourseGroupInput,
  type CourseInstallmentInput,
} from "@/lib/api-helpers";

/**
 * عملیات نوشتنِ دوره — منطق مشترک API مدیر و API استاد.
 *
 * syncGroups و syncInstallmentTemplate عیناً از مسیر مدیر دوره‌ها
 * (src/app/api/admin/courses/[id]/route.ts) استخراج شده‌اند تا رفتار ویرایش
 * دوره از هر دو پنل یکسان بماند؛ پیام‌های فارسی و محافظِ ثبت‌نام فعال
 * (۴۰۹ هنگام حذف گروه دارای پیش‌ثبت‌نام) حفظ شده است.
 */

/**
 * همگام‌سازی گروه‌های زمان‌بندی دوره —
 *  • گروه‌های دارای id → به‌روزرسانی درجا (جای ثبت‌نام‌ها حفظ می‌شود)
 *  • گروه‌های بدون id → ایجاد جدید
 *  • گروه‌های حذف‌شده از فرم → فقط در صورت نداشتن ثبت‌نام فعال حذف می‌شوند
 *
 * خروجی: در صورت مسدودشدن حذفِ گروهِ دارای ثبت‌نام فعال، پاسخ ۴۰۹ برمی‌گردد؛
 * در غیر این صورت null.
 */
export async function syncGroups(courseId: string, incoming: CourseGroupInput[]) {
  const existing = await db.courseGroup.findMany({
    where: { courseId },
  });

  const incomingIds = new Set(
    incoming.map((g) => g.id).filter((id): id is string => !!id)
  );
  const existingIds = new Set(existing.map((g) => g.id));

  // — حذف گروه‌های حذف‌شده (با محافظِ ثبت‌نام فعال) —
  for (const group of existing) {
    if (incomingIds.has(group.id)) continue;
    const active = await db.enrollment.count({
      where: { groupId: group.id, status: { not: "archived" } },
    });
    if (active > 0) {
      return bad(
        `گروه «${group.title}» دارای ${active} پیش‌ثبت‌نام فعال است و حذف نمی‌شود؛ ابتدا وضعیت آن‌ها را «بایگانی» کنید یا گروه را نگه دارید.`,
        409
      );
    }
    await db.courseGroup.delete({ where: { id: group.id } });
  }

  // — به‌روزرسانی گروه‌های موجود —
  for (const g of incoming) {
    if (!g.id || !existingIds.has(g.id)) continue;
    await db.courseGroup.update({
      where: { id: g.id },
      data: {
        title: g.title,
        schedule: g.schedule,
        capacity: g.capacity,
        sortOrder: g.sortOrder,
      },
    });
  }

  // — ایجاد گروه‌های جدید (رابطه‌ای — سازگار با محیط اجرا) —
  const toCreate = incoming.filter((g) => !g.id || !existingIds.has(g.id));
  for (const g of toCreate) {
    await db.courseGroup.create({
      data: {
        course: { connect: { id: courseId } },
        title: g.title,
        schedule: g.schedule,
        capacity: g.capacity,
        sortOrder: g.sortOrder,
      },
    });
  }
  return null;
}

/**
 * همگام‌سازی قالب اقساط دوره — قالب فقط «تعریف» است و ثبت‌نام‌های
 * موجود به ردیف‌های واقعی Installment ارجاع نمی‌دهند؛ بنابراین جایگزینی
 * کامل (حذف + ایجاد مجدد) بی‌خطر است و طرح ثبت‌نام‌های قبلی دست‌نخورده می‌ماند.
 */
export async function syncInstallmentTemplate(
  courseId: string,
  incoming: CourseInstallmentInput[]
) {
  await db.courseInstallment.deleteMany({ where: { courseId } });
  if (incoming.length > 0) {
    await db.courseInstallment.createMany({
      data: incoming.map((row) => ({
        courseId,
        index: row.index,
        dueDate: new Date(row.dueDate),
      })),
    });
  }
}
