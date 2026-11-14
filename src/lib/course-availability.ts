import { db } from "@/lib/db";
import type { Course } from "@prisma/client";
import {
  aggregateGroupsAvailability,
  computeAvailability,
  computeGroupAvailability,
  type AvailabilityMap,
  type GroupAvailability,
} from "@/lib/availability";

/**
 * ظرفیت دوره‌ها و گروه‌هایشان — منطق مشترک سرور
 *
 * «نفر ثبت‌نام‌شده» = تعداد Enrollmentهای همان دوره/گروه با هر وضعیتی
 * به‌جز archived (بایگانی‌شده‌ها جا اشغال نمی‌کنند).
 *
 * ظرفیت صفر یعنی بدون محدودیت (برای دوره‌های قدیمی/بدون ظرفیت).
 *
 * دوره‌های حضوری/ترکیبیِ دارای گروه: ظرفیت واقعی در سطح گروه اعمال می‌شود؛
 * «ظرفیت دوره» = مجموع ظرفیت گروه‌ها و «تکمیل» یعنی پر بودن همه‌ی گروه‌ها.
 */

/** تعداد ثبت‌نام فعال به تفکیک عنوان دوره */
export async function getEnrolledCounts(): Promise<Map<string, number>> {
  const rows = await db.enrollment.groupBy({
    by: ["course"],
    where: {
      status: { not: "archived" },
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.course, r._count._all]));
}

/** تعداد ثبت‌نام فعال به تفکیک گروه */
export async function getGroupEnrolledCounts(): Promise<Map<string, number>> {
  const rows = await db.enrollment.groupBy({
    by: ["groupId"],
    where: {
      status: { not: "archived" },
      groupId: { not: null },
    },
    _count: { _all: true },
  });
  return new Map(
    rows.filter((r) => r.groupId).map((r) => [r.groupId as string, r._count._all])
  );
}

/** تعداد ثبت‌نام فعال یک دوره‌ی مشخص */
export async function countActiveEnrollments(
  courseTitle: string
): Promise<number> {
  return db.enrollment.count({
    where: {
      course: courseTitle,
      status: { not: "archived" },
    },
  });
}

/** تعداد ثبت‌نام فعال یک گروه مشخص */
export async function countActiveGroupEnrollments(
  groupId: string
): Promise<number> {
  return db.enrollment.count({
    where: {
      groupId,
      status: { not: "archived" },
    },
  });
}

/** آیا دوره‌ی داده‌شده پر شده است؟ (دوره‌ی بدون گروه) */
export function isCourseFull(
  course: Pick<Course, "capacity">,
  enrolledCount: number
): boolean {
  return course.capacity > 0 && enrolledCount >= course.capacity;
}

/** آیا گروه داده‌شده پر شده است؟ */
export function isGroupFull(
  group: { capacity: number },
  enrolledCount: number
): boolean {
  return group.capacity > 0 && enrolledCount >= group.capacity;
}

/**
 * گروه‌های یک دوره به‌همراه وضعیت ظرفیت هر گروه
 * (مرتب بر اساس sortOrder و بعد تاریخ ایجاد)
 */
export async function getGroupsWithAvailability(
  courseId: string,
  groupCounts: Map<string, number>
): Promise<GroupAvailability[]> {
  const groups = await db.courseGroup.findMany({
    where: { courseId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return groups.map((g) =>
    computeGroupAvailability(g, groupCounts.get(g.id) ?? 0)
  );
}

/** نقشه‌ی ظرفیت دوره‌های منتشرشده — برای فرانت سایت */
export async function getPublicAvailability(): Promise<AvailabilityMap> {
  const [courses, counts, groupCounts] = await Promise.all([
    db.course.findMany({
      where: { published: true },
      include: {
        groups: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
    getEnrolledCounts(),
    getGroupEnrolledCounts(),
  ]);

  const map: AvailabilityMap = {};
  for (const c of courses) {
    // — دوره‌ی گروه‌دار (حضوری/ترکیبی): ظرفیت در سطح گروه اعمال می‌شود —
    if (c.type !== "online" && c.groups.length > 0) {
      const groups = c.groups.map((g) =>
        computeGroupAvailability(g, groupCounts.get(g.id) ?? 0)
      );
      map[c.title] = {
        ...aggregateGroupsAvailability(groups),
        groups,
      };
      continue;
    }

    // — بقیه‌ی دوره‌ها (آنلاین یا حضوری/ترکیبی بدون گروه) —
    map[c.title] = computeAvailability(c.capacity, counts.get(c.title) ?? 0);
  }
  return map;
}
