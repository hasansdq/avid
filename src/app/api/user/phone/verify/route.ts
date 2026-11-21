import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createUserSession,
  verifyPhone,
  withUserCookie,
  type SessionUser,
} from "@/lib/user-auth";
import { requestSecure } from "@/lib/http";

/**
 * POST /api/user/phone/verify — مرحله‌ی تایید شماره موبایل فرم یکپارچه‌ی
 * «ورود/ثبت‌نام» (و فرم ۵-مرحله‌ای پیش‌ثبت‌نام دوره‌ها).
 *
 * body: { phone, code }
 *
 * با تایید موفق (کد مصرف می‌شود):
 *  • شماره از قبل ثبت شده → ورود مستقیم: نشست ست و کاربر برگردانده می‌شود
 *    { ok, isNew: false, user }
 *  • شماره ثبت نشده → توکن «ثبت‌نام نیمه‌کاره» صادر می‌شود تا مرحله‌ی
 *    ثبت‌نام (نام، نام خانوادگی، کد ملی اختیاری) بدون کد دوباره تکمیل شود
 *    { ok, isNew: true, pendingToken }
 *
 * مشخصات (firstName/lastName/nationalId) اختیاری‌اند؛ اگر کامل ارسال شوند
 * حساب بلافاصله ساخته می‌شود ( سازگار با فراخوانی مستقیم).
 * کاربر مسدود پس از مصرف کد، ۴۰۳ می‌گیرد.
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

    const result = await verifyPhone(phone, code, {
      // مشخصات فقط وقتی ارسال شده‌اند به ساخت حساب مستقیم می‌انجامند
      ...(firstName || lastName
        ? { firstName, lastName, ...(nationalId ? { nationalId } : {}) }
        : {}),
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    // — شماره ثبت‌نشده و بدون مشخصات → توکن نیمه‌کاره؛ نشست هنوز نه —
    if ("pendingToken" in result) {
      return NextResponse.json(
        {
          ok: true,
          isNew: true,
          pendingToken: result.pendingToken,
          phone,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // — کاربر مسدود نمی‌تواند وارد شود (کد در verifyPhone مصرف شده است) —
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
      NextResponse.json(
        { ok: true, isNew: result.isNew, user },
        { headers: { "Cache-Control": "no-store" } }
      ),
      session.token,
      session.maxAge,
      requestSecure(req)
    );
  } catch (error) {
    console.error("phone verify error:", error);
    return NextResponse.json(
      { error: "خطا در تایید کد. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
