import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";
import {
  getSmsSettings,
  invalidateSmsSettingsCache,
} from "@/lib/sms";

/**
 * GET /api/admin/sms-settings — تنظیمات پنل پیامک (ملی پیامک)
 * PUT /api/admin/sms-settings — ذخیره‌ی بخشی از تنظیمات
 *
 * اعتبارسنجی (با ادغام مقادیر فعلی):
 *  • provider ∈ none | rest | console
 *  • rest    → نام کاربری/رمز یا کلید API الزامی است
 *  • console → کلید API کنسول الزامی است
 *  • خط فرستنده (وقتی سرویس فعال است) باید ۸ تا ۱۵ رقم باشد
 *  • شناسه‌ی پترن OTP فقط رقم یا خالی
 */

const PROVIDERS = new Set(["none", "rest", "console"]);

/** پاک‌سازی رشته‌ی اختیاری: trim + سقف طول */
function clean(v: unknown, max: number): string | undefined {
  return typeof v === "string" ? v.trim().slice(0, max) : undefined;
}

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const settings = await getSmsSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("sms-settings GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت تنظیمات پیامک." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return bad("درخواست نامعتبر است.");

    const current = await getSmsSettings();

    // — نوع اتصال —
    let provider: string | undefined;
    if ("provider" in body) {
      provider = str(body.provider);
      if (!PROVIDERS.has(provider)) {
        return bad("نوع اتصال باید «none»، «rest» یا «console» باشد.");
      }
    }
    const nextProvider = provider ?? current.provider;

    // — رشته‌های اختیاری (trim + سقف) —
    const username = clean(body.username, 100);
    const password = clean(body.password, 100);
    const apiKey = clean(body.apiKey, 100);
    const consoleApiKey = clean(body.consoleApiKey, 100);
    const fromNumber = clean(body.fromNumber, 20);

    // — شناسه‌ی پترن OTP: فقط رقم یا خالی —
    let otpBodyId: string | undefined;
    if ("otpBodyId" in body) {
      otpBodyId = clean(body.otpBodyId, 20) ?? "";
      if (otpBodyId && !/^\d+$/.test(otpBodyId)) {
        return bad("شناسه‌ی پترن OTP باید فقط رقم باشد.");
      }
    }

    // — امضای انتهای پیامک‌ها —
    const signature = clean(body.signature, 60);

    // — اعتبارسنجی مقادیر نهایی (ارسالی + فعلی) —
    const nextUsername = username ?? current.username;
    const nextPassword = password ?? current.password;
    const nextApiKey = apiKey ?? current.apiKey;
    const nextConsoleApiKey = consoleApiKey ?? current.consoleApiKey;
    const nextFromNumber = fromNumber ?? current.fromNumber;

    if (nextProvider === "rest") {
      if (!((nextUsername && nextPassword) || nextApiKey)) {
        return bad(
          "برای وب‌سرویس REST، نام کاربری و رمز عبور یا کلید API الزامی است."
        );
      }
    }
    if (nextProvider === "console") {
      if (!nextConsoleApiKey) {
        return bad("برای کنسول ملی پیامک، کلید API کنسول الزامی است.");
      }
    }
    if (nextProvider !== "none" && !/^\d{8,15}$/.test(nextFromNumber)) {
      return bad("شماره‌ی خط فرستنده باید ۸ تا ۱۵ رقم باشد.");
    }

    const data: {
      provider?: string;
      username?: string;
      password?: string;
      apiKey?: string;
      consoleApiKey?: string;
      fromNumber?: string;
      otpBodyId?: string;
      signature?: string;
    } = {
      ...(provider !== undefined ? { provider } : {}),
      ...(username !== undefined ? { username } : {}),
      ...(password !== undefined ? { password } : {}),
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(consoleApiKey !== undefined ? { consoleApiKey } : {}),
      ...(fromNumber !== undefined ? { fromNumber } : {}),
      ...(otpBodyId !== undefined ? { otpBodyId } : {}),
      ...(signature !== undefined ? { signature } : {}),
    };

    if (Object.keys(data).length === 0) {
      return bad("هیچ فیلد قابل ویرایشی ارسال نشده است.");
    }

    await db.smsSettings.update({ where: { id: "main" }, data });

    // کش ماژول پیامک فوراً تازه شود
    invalidateSmsSettingsCache();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("sms-settings PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ذخیره‌ی تنظیمات پیامک." },
      { status: 500 }
    );
  }
}
