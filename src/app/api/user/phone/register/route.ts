import { NextRequest, NextResponse } from "next/server";
import {
  completeRegistration,
  createUserSession,
  withUserCookie,
} from "@/lib/user-auth";
import { requestSecure } from "@/lib/http";

/**
 * POST /api/user/phone/register — مرحله‌ی ثبت‌نام فرم یکپارچه:
 * تکمیل مشخصات (نام، نام خانوادگی، کد ملی اختیاری) با توکن نیمه‌کاره‌ی
 * صادرشده پس از تایید شماره موبایل.
 *
 * body: { pendingToken, firstName, lastName, nationalId? }
 *
 * با موفقیت حساب ساخته/بازیابی می‌شود، نشست در کوکی avid_user ست می‌شود
 * و کاربر وارد حساب خود می‌شود:
 *   { ok: true, isNew: true|false, user }
 *
 * isNew=false یعنی حسابِ همان شماره در فاصله‌ی دو مرحله ساخته شده بود
 * و کاربر با همان حساب وارد می‌شود (رفع رقابت نادر).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const pendingToken =
      typeof body?.pendingToken === "string" ? body.pendingToken.trim() : "";
    const firstName =
      typeof body?.firstName === "string" ? body.firstName.trim() : "";
    const lastName =
      typeof body?.lastName === "string" ? body.lastName.trim() : "";
    const nationalIdRaw =
      typeof body?.nationalId === "string" ? body.nationalId.trim() : "";
    // کد ملی اختیاری — رشته‌ی خالی یعنی «ارسال نشده»
    const nationalId = nationalIdRaw === "" ? undefined : nationalIdRaw;

    if (!pendingToken) {
      return NextResponse.json(
        {
          error:
            "ثبت‌نام نیمه‌کاره‌ای برای تکمیل وجود ندارد؛ دوباره کد تایید دریافت کنید.",
        },
        { status: 400 }
      );
    }

    const result = await completeRegistration(pendingToken, {
      firstName,
      lastName,
      ...(nationalId !== undefined ? { nationalId } : {}),
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    const session = await createUserSession(result.user.id);
    return withUserCookie(
      NextResponse.json(
        { ok: true, isNew: result.isNew, user: result.user },
        { headers: { "Cache-Control": "no-store" } }
      ),
      session.token,
      session.maxAge,
      requestSecure(req)
    );
  } catch (error) {
    console.error("phone register error:", error);
    return NextResponse.json(
      { error: "خطا در تکمیل ثبت‌نام. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
