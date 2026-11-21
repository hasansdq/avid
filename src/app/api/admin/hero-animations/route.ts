import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { HERO_ANIMATION_KEYS, type HeroAnimationKey } from "@/lib/hero-animations";

/**
 * «انیمیشن‌های هیرو» — زیرمجموعه‌ی سکشن هیرو در مدیریت صفحه‌ی اول — GET / PUT
 *   GET  → وضعیت روشن/خاموش انیمیشن (ادغام رکورد با پیش‌فرضِ «روشن»)
 *   PUT  → ذخیره‌ی وضعیت (upsert؛ کلید + سه بولین)
 *
 * فقط انیمیشن «اتم ↔ اثر انگشت» (کلید scene) قابل کنترل است؛ نمادهای
 * شناور، آیکون‌ها و متن‌ها تابع این سوئیچ‌ها نیستند و همیشه نمایان‌اند.
 * مخفی‌سازی کل هیرو از سوئیچ‌های خودِ سکشن هیرو
 * (endpoint مربوط به homepage-sections) انجام می‌شود.
 *
 * رکورد فقط وقتی ساخته/بروزرسانی می‌شود که مدیر سوئیچی را تغییر دهد؛
 * نبود رکورد = انیمیشن در هر سه پلتفرم روشن (پیش‌فرض ایمن).
 */

function isAnimationKey(value: unknown): value is HeroAnimationKey {
  return (
    typeof value === "string" &&
    (HERO_ANIMATION_KEYS as readonly string[]).includes(value)
  );
}

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const rows = await db.heroAnimation.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return NextResponse.json({
      animations: HERO_ANIMATION_KEYS.map((key) => {
        const row = byKey.get(key);
        return {
          key,
          mobile: row?.mobile ?? true,
          tablet: row?.tablet ?? true,
          desktop: row?.desktop ?? true,
          updatedAt: row?.updatedAt ?? null,
        };
      }),
    });
  } catch (error) {
    console.error("hero-animations GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت وضعیت انیمیشن‌های هیرو." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = (await req.json().catch(() => null)) as {
      key?: unknown;
      mobile?: unknown;
      tablet?: unknown;
      desktop?: unknown;
    } | null;

    if (!body || !isAnimationKey(body.key)) {
      return NextResponse.json(
        { error: "کلید انیمیشن نامعتبر است." },
        { status: 400 }
      );
    }
    // سه سوئیچ باید صریحاً بولین باشند — نبودشان = خطای درخواست
    for (const field of ["mobile", "tablet", "desktop"] as const) {
      if (typeof body[field] !== "boolean") {
        return NextResponse.json(
          { error: `مقدار «${field}» باید true/false باشد.` },
          { status: 400 }
        );
      }
    }

    const saved = await db.heroAnimation.upsert({
      where: { key: body.key },
      update: {
        mobile: body.mobile as boolean,
        tablet: body.tablet as boolean,
        desktop: body.desktop as boolean,
      },
      create: {
        key: body.key,
        mobile: body.mobile as boolean,
        tablet: body.tablet as boolean,
        desktop: body.desktop as boolean,
      },
    });

    return NextResponse.json({
      key: saved.key,
      mobile: saved.mobile,
      tablet: saved.tablet,
      desktop: saved.desktop,
      updatedAt: saved.updatedAt,
    });
  } catch (error) {
    console.error("hero-animations PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ذخیره‌ی وضعیت انیمیشن. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
