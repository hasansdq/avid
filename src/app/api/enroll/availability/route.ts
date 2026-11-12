import { NextResponse } from "next/server";
import { getPublicAvailability } from "@/lib/course-availability";

/**
 * GET /api/enroll/availability — وضعیت ظرفیت دوره‌های منتشرشده.
 *
 * پاسخ: { "عنوان دوره": { capacity, enrolled, remaining, full }, ... }
 * ظرفیت صفر یعنی «بدون محدودیت» (full همیشه false است).
 * فرانت سایت با همین نقشه، دوره‌های تکمیل‌شده را غیرقابل انتخاب می‌کند.
 */
export async function GET() {
  try {
    const availability = await getPublicAvailability();
    // بدون کش سخت — وضعیت ظرفیت باید تازه باشد
    return NextResponse.json(availability, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("availability GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت وضعیت ظرفیت دوره‌ها." },
      { status: 500 }
    );
  }
}
