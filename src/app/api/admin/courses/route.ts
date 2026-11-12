import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseCourse, bad } from "@/lib/api-helpers";
import {
  getEnrolledCounts,
  getGroupEnrolledCounts,
} from "@/lib/course-availability";

/**
 * لیست کامل دوره‌ها (برای پنل مدیریت) — همراه با تعداد ثبت‌نام فعال
 * هر دوره و گروه‌های زمان‌بندی دوره‌های حضوری (با تعداد ثبت‌نام هر گروه).
 */
export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const [courses, counts, groupCounts] = await Promise.all([
      db.course.findMany({
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
    console.error("courses GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت دوره‌ها." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    const data = parseCourse(body);
    if (typeof data === "string") return bad(data);

    // گروه‌ها و قالب اقساط از داده‌های اسکالر جدا می‌شوند (nested create برای Prisma)
    const { groups, installments, ...courseData } = data;

    const course = await db.course.create({
      data: {
        ...courseData,
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
    });
    return NextResponse.json(course, { status: 201 });
  } catch (error) {
    console.error("courses POST error:", error);
    return NextResponse.json(
      { error: "خطا در ایجاد دوره. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
