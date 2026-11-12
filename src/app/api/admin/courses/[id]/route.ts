import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import {
  parseCourse,
  bad,
  type CourseGroupInput,
  type CourseInstallmentInput,
} from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

/**
 * همگام‌سازی گروه‌های زمان‌بندی دوره —
 *  • گروه‌های دارای id → به‌روزرسانی درجا (جای ثبت‌نام‌ها حفظ می‌شود)
 *  • گروه‌های بدون id → ایجاد جدید
 *  • گروه‌های حذف‌شده از فرم → فقط در صورت نداشتن ثبت‌نام فعال حذف می‌شوند
 */
async function syncGroups(courseId: string, incoming: CourseGroupInput[]) {
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
async function syncInstallmentTemplate(
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

export async function PUT(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const data = parseCourse(body);
    if (typeof data === "string") return bad(data);

    const { groups, installments, ...courseData } = data;

    const exists = await db.course.findUnique({ where: { id } });
    if (!exists) return bad("دوره‌ای با این شناسه یافت نشد.", 404);

    const course = await db.course.update({
      where: { id },
      data: courseData,
    });

    // — همگام‌سازی گروه‌ها (فقط حضوری؛ برای آنلاین همه‌ی گروه‌ها حذف می‌شوند) —
    const blocked = await syncGroups(id, groups);
    if (blocked) return blocked;

    // — همگام‌سازی قالب اقساط (تعداد و سررسیدها) —
    await syncInstallmentTemplate(id, installments);

    return NextResponse.json(course);
  } catch (error) {
    console.error("course PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ویرایش دوره. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    // گروه‌های دوره با Cascade حذف می‌شوند؛ ثبت‌نام‌ها باقی می‌مانند
    // (پیوندشان SetNull می‌شود و عنوان دوره/گروه به‌صورت متن باقی می‌ماند)
    const course = await db.course
      .delete({ where: { id } })
      .catch(() => null);

    if (!course) return bad("دوره‌ای با این شناسه یافت نشد.", 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("course DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف دوره. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
