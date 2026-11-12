import { NextRequest, NextResponse } from "next/server";
import {
  createUserSession,
  verifyOtpLogin,
  withUserCookie,
} from "@/lib/user-auth";
import { requestSecure } from "@/lib/http";

/**
 * POST /api/panel/otp/verify — تایید کد و ورود به پنل کاربر.
 *
 * body: { phone, code }
 *
 * حساب باید از قبل وجود داشته باشد (ایجاد حساب فقط از مسیر ثبت‌نام
 * دوره انجام می‌شود). کاربر مسدود پس از مصرف کد، ۴۰۳ می‌گیرد.
 * با موفقیت، نشست در کوکی avid_user ست می‌شود (مثل مسیر ثبت‌نام).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const phone =
      typeof body?.phone === "string" ? body.phone.replace(/[\s-]/g, "") : "";
    const code =
      typeof body?.code === "string" ? body.code.replace(/\D/g, "") : "";

    if (!/^09\d{9}$/.test(phone)) {
      return NextResponse.json(
        { error: "شماره موبایل معتبر نیست." },
        { status: 400 }
      );
    }
    if (code.length !== 6) {
      return NextResponse.json(
        { error: "کد تایید ۶ رقمی را کامل وارد کنید." },
        { status: 400 }
      );
    }

    const result = await verifyOtpLogin(phone, code);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    // — کاربر مسدود پس از مصرف کد وارد نمی‌شود —
    if (result.user.status === "blocked") {
      return NextResponse.json(
        {
          error:
            "حساب شما توسط مدیر مسدود شده است. برای پیگیری با پشتیبانی تماس بگیرید.",
        },
        { status: 403 }
      );
    }

    const user = result.user;
    const session = await createUserSession(user.id);
    return withUserCookie(
      NextResponse.json({
        ok: true,
        user: {
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
        },
      }),
      session.token,
      session.maxAge,
      requestSecure(req)
    );
  } catch (error) {
    console.error("panel otp verify error:", error);
    return NextResponse.json(
      { error: "خطا در تایید کد. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
