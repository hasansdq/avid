import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";

/**
 * PUT /api/admin/account/2fa — تنظیم تایید دومرحله‌ای پیامکی ورود مدیر.
 *
 * body: { phone?: string, twoFactorEnabled?: boolean }
 *  • فعال‌سازی (twoFactorEnabled=true) نیازمند شماره‌ی موبایل معتبر است
 *    (۰۹xxxxxxxxx)؛ شماره همراه همان درخواست ذخیره می‌شود.
 *  • غیرفعال‌سازی همیشه ممکن است — پس از آن ورود فقط با نام کاربری
 *    و رمز عبور انجام می‌شود (پیش‌فرض).
 */
export async function PUT(req: NextRequest) {
  const { admin, denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => ({}));

    // — شماره موبایل (در صورت ارسال) —
    let phone: string | undefined;
    if (body.phone !== undefined) {
      phone = str(String(body.phone));
      if (phone !== "" && !/^09\d{9}$/.test(phone)) {
        return bad("شماره موبایل مدیر معتبر نیست (مثال: 09123456789).");
      }
    }

    // — کلید فعال‌سازی (در صورت ارسال) —
    let twoFactorEnabled: boolean | undefined;
    if (body.twoFactorEnabled !== undefined) {
      twoFactorEnabled = body.twoFactorEnabled === true;
    }

    if (twoFactorEnabled === undefined && phone === undefined) {
      return bad("چیزی برای ذخیره ارسال نشده است.");
    }

    // فعال‌سازی نیازمند شماره (رای ارسال کد) است — جدید یا از قبل ذخیره‌شده
    const effectivePhone = phone !== undefined ? phone : admin.phone;
    if (twoFactorEnabled && !/^09\d{9}$/.test(effectivePhone)) {
      return bad(
        "برای فعال‌سازی تایید دومرحله‌ای ابتدا شماره موبایل مدیر را وارد کنید."
      );
    }

    const updated = await db.adminUser.update({
      where: { id: admin.id },
      data: {
        ...(phone !== undefined ? { phone } : {}),
        ...(twoFactorEnabled !== undefined ? { twoFactorEnabled } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      phone: updated.phone,
      twoFactorEnabled: updated.twoFactorEnabled,
    });
  } catch (error) {
    console.error("admin account 2fa error:", error);
    return NextResponse.json(
      { error: "خطا در ذخیره‌ی تنظیمات تایید دومرحله‌ای." },
      { status: 500 }
    );
  }
}
