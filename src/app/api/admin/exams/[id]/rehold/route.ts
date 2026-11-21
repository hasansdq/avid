import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/exams/[id]/rehold — برگزاری دوباره‌ی آزمون از بانک آزمون‌ها.
 *
 * آزمون اصلی بانک (و سوالات آن) دست‌نخورده می‌ماند و یک «برگزاری تازه» از
 * همان سوالات ساخته می‌شود: ردیف آزمون جدید (isBankCopy=true) + کپی کامل
 * سوالات — با پاسخ‌برگه‌های خالی، یعنی شرکت‌کنندگان می‌توانند از نو شروع کنند.
 *
 * body: { classId?: string } — کلاس هدف برگزاری (همان کلاس یا کلاس دیگر)؛
 * خالی/دسته‌نشده یعنی برگزاری برای همه‌ی کاربران (آزمون آزاد).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const origin = await db.exam
      .findUnique({
        where: { id },
        include: { questions: { orderBy: { order: "asc" } } },
      })
      .catch(() => null);
    if (!origin) return bad("آزمونی با این شناسه در بانک یافت نشد.", 404);

    const body = (await req.json().catch(() => null)) as {
      classId?: unknown;
    } | null;
    const classId = str(body?.classId).trim();

    // هدف کلاس باید واقعی باشد؛ خالی = برگزاری آزاد برای همه‌ی کاربران
    let targetClassId: string | null = null;
    if (classId) {
      const classRoom = await db.classRoom
        .findUnique({ where: { id: classId }, select: { id: true } })
        .catch(() => null);
      if (!classRoom) return bad("کلاس انتخاب‌شده یافت نشد.", 404);
      targetClassId = classId;
    }

    // — ساخت برگزاری تازه + کپی سوالات در یک تراکنش —
    const copy = await db.$transaction(async (tx) => {
      const created = await tx.exam.create({
        data: {
          title: origin.title,
          description: origin.description,
          accessType: targetClassId ? "class" : "open",
          classId: targetClassId,
          password: "",
          durationMinutes: origin.durationMinutes,
          allowBack: origin.allowBack,
          published: true, // برگزاری تازه آماده‌ی شرکت است
          sortOrder: origin.sortOrder,
          isBankCopy: true,
          bankOriginId: origin.id,
        },
      });

      for (const q of origin.questions) {
        await tx.examQuestion.create({
          data: {
            examId: created.id,
            type: q.type,
            text: q.text,
            image: q.image,
            video: q.video,
            points: q.points,
            options: q.options,
            answer: q.answer,
            order: q.order,
          },
        });
      }

      return tx.exam.findUnique({
        where: { id: created.id },
        include: {
          course: { select: { title: true } },
          class: { select: { title: true } },
          _count: { select: { questions: true, attempts: true } },
        },
      });
    });

    return NextResponse.json(copy, { status: 201 });
  } catch (error) {
    console.error("exam rehold POST error:", error);
    return NextResponse.json(
      { error: "خطا در برگزاری دوباره‌ی آزمون. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
