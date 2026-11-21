import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/teacher";
import { parseCourse, bad } from "@/lib/api-helpers";
import {
  getEnrolledCounts,
  getGroupEnrolledCounts,
} from "@/lib/course-availability";

/**
 * GET /api/teacher/courses — دوره‌های خودِ استاد (فقط دوره‌هایی که خودش
 * ساخته است) با گروه‌های زمان‌بندی، قالب اقساط و تعداد ثبت‌نام فعال هر
 * دوره/گروه. POST /api/teacher/courses — ایجاد دوره‌ی جدید به نام استاد
 * با همان فرم و اعتبارسنجی دوره‌ی پنل مدیریت.
 */
export async function GET(req: NextRequest) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  // غیرقابل‌رسید در عمل — فقط برای تنگ‌کردن نوع در TypeScript
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const [courses, counts, groupCounts] = await Promise.all([
      db.course.findMany({
        where: { teacherId: teacher.id },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        include: {
          groups: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
          installmentTemplate: { orderBy: { index: "asc" } },
        },
      }),
      getEnrolledCounts(),
      getGroupEnrolledCounts(),
    ]);
    return NextResponse.json(
      courses.map((c) => ({
        ...c,
        enrolledCount: counts.get(c.title) ?? 0,
        groups: c.groups.map((g) => ({
          ...g,
          enrolledCount: groupCounts.get(g.id) ?? 0,
        })),
      }))
    );
  } catch (error) {
    console.error("دوره‌های استاد — GET:", error);
    return NextResponse.json(
      { error: "خطا در دریافت دوره‌ها." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { teacher, denial } = await requireTeacher(req);
  if (denial) return denial;
  // غیرقابل‌رسید در عمل — فقط برای تنگ‌کردن نوع در TypeScript
  if (!teacher) return bad("حساب استاد یافت نشد؛ دوباره وارد شوید.", 401);

  try {
    const body = await req.json().catch(() => null);
    const data = parseCourse(body);
    if (typeof data === "string") return bad(data);

    // گروه‌ها و قالب اقساط از داده‌های اسکالر جدا می‌شوند (nested create برای Prisma)
    const { groups, installments, ...courseData } = data;

    // دوره با مالکیت استاد ایجاد می‌شود (teacherId)
    const course = await db.course.create({
      data: {
        ...courseData,
        teacherId: teacher.id,
        ...(groups.length > 0
          ? {
              groups: {
                create: groups.map((g) => ({
                  title: g.title,
                  schedule: g.schedule,
                  capacity: g.capacity,
                  sortOrder: g.sortOrder,
                })),
              },
            }
          : {}),
        ...(installments.length > 0
          ? {
              installmentTemplate: {
                create: installments.map((row) => ({
                  index: row.index,
                  dueDate: new Date(row.dueDate),
                })),
              },
            }
          : {}),
      },
      include: {
        groups: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        installmentTemplate: { orderBy: { index: "asc" } },
      },
    });
    return NextResponse.json(course, { status: 201 });
  } catch (error) {
    console.error("دوره‌های استاد — POST:", error);
    return NextResponse.json(
      { error: "خطا در ایجاد دوره. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
