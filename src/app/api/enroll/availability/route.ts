import { NextResponse } from "next/server";
import { getPublicAvailability } from "@/lib/course-availability";
import { toPublicAvailability } from "@/lib/availability";

/**
 * GET /api/enroll/availability — وضعیت ظرفیت دوره‌های منتشرشده.
 *
 * پاسخ: { "عنوان دوره": { capacity, full, groups? }, ... }
 * «باقیمانده» و «ثبت‌نام‌شده» عمداً ارسال نمی‌شوند — ظرفیت باقیمانده
 * به کاربر نمایش داده نمی‌شود؛ فرانت فقط با پرچمِ «تکمیل» رابط را قفل
 * می‌کند و اعمال نهایی همیشه سمت سرور است.
 * ظرفیت صفر یعنی «بدون محدودیت» (full همیشه false است).
 */
export async function GET() {
  try {
    const availability = await getPublicAvailability();
    // بدون کش سخت — وضعیت ظرفیت باید تازه باشد
    return NextResponse.json(toPublicAvailability(availability), {
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
