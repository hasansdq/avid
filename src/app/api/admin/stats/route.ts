import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const [
      coursesTotal,
      coursesOnline,
      coursesInperson,
      coursesHybrid,
      coursesPublished,
      videosTotal,
      videosPublished,
      testimonialsTotal,
      testimonialsPublished,
      enrollmentsTotal,
      enrollmentsNew,
      recentEnrollments,
    ] = await Promise.all([
      db.course.count(),
      db.course.count({ where: { type: "online" } }),
      db.course.count({ where: { type: "inperson" } }),
      db.course.count({ where: { type: "hybrid" } }),
      db.course.count({ where: { published: true } }),
      db.video.count(),
      db.video.count({ where: { published: true } }),
      db.testimonial.count(),
      db.testimonial.count({ where: { published: true } }),
      db.enrollment.count(),
      db.enrollment.count({ where: { status: "new" } }),
      db.enrollment.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    return NextResponse.json({
      courses: {
        total: coursesTotal,
        online: coursesOnline,
        inperson: coursesInperson,
        hybrid: coursesHybrid,
        published: coursesPublished,
      },
      videos: { total: videosTotal, published: videosPublished },
      testimonials: { total: testimonialsTotal, published: testimonialsPublished },
      enrollments: { total: enrollmentsTotal, new: enrollmentsNew },
      recentEnrollments,
    });
  } catch (error) {
    console.error("stats error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت آمار. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
