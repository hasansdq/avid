import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createUserSession,
  verifyOtp,
  withUserCookie,
  type SessionUser,
} from "@/lib/user-auth";
import { requestSecure } from "@/lib/http";

/**
 * POST /api/user/otp/verify — تایید کد پیامکی و ورود به حساب کاربری.
 *
 * body: { phone, code, firstName?, lastName?, nationalId? }
 *
 * با تایید موفق: حساب کاربری ایجاد/به‌روز می‌شود (کد ملی اختیاری —
 * فقط وقتی ارسال شده باشد ثبت/به‌روز می‌شود)، نشست در کوکی
 * ست می‌شود و عبور از مرحله‌ی اول فرم انجام شده است.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const phone =
      typeof body?.phone === "string" ? body.phone.replace(/[\s-]/g, "") : "";
    const code =
      typeof body?.code === "string" ? body.code.replace(/\D/g, "") : "";
    const firstName =
      typeof body?.firstName === "string" ? body.firstName.trim() : "";
    const lastName =
      typeof body?.lastName === "string" ? body.lastName.trim() : "";
    // کد ملی اختیاری — رشته‌ی خالی یعنی «ارسال نشده» (بدون تغییر می‌ماند)
    const nationalIdRaw =
      typeof body?.nationalId === "string" ? body.nationalId.trim() : "";
    const nationalId = nationalIdRaw === "" ? undefined : nationalIdRaw;

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

    const result = await verifyOtp(phone, code, {
      firstName,
      lastName,
      nationalId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    // — کاربر مسدود نمی‌تواند وارد شود (کد در verifyOtp مصرف شده است) —
    const fresh = await db.user.findUnique({
      where: { id: result.user.id },
      select: { status: true },
    });
    if (fresh?.status === "blocked") {
      return NextResponse.json(
        {
          error:
            "حساب شما توسط مدیر مسدود شده است. برای پیگیری با پشتیبانی تماس بگیرید.",
        },
        { status: 403 }
      );
    }

    const user: SessionUser = result.user;
    const session = await createUserSession(user.id);
    return withUserCookie(
      NextResponse.json({ ok: true, user }),
      session.token,
      session.maxAge,
      requestSecure(req)
    );
  } catch (error) {
    console.error("otp verify error:", error);
    return NextResponse.json(
      { error: "خطا در تایید کد. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
