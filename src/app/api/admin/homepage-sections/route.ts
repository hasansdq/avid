import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import {
  HOMEPAGE_SECTION_KEYS,
  type HomepageSectionKey,
} from "@/lib/homepage-sections";

/**
 * مدیریت سکشن‌های صفحه‌ی اول سایت — GET / PUT
 *   GET  → وضعیت نمایش ۸ سکشن (ادغام رکوردها با پیش‌فرضِ «نمایان»)
 *   PUT  → ذخیره‌ی وضعیت یک سکشن (upsert؛ کلید + سه بولین)
 *
 * رکورد فقط وقتی ساخته/بروزرسانی می‌شود که مدیر سوئیچی را تغییر دهد؛
 * نبود رکورد = سکشن در هر سه پلتفرم نمایان (پیش‌فرض ایمن).
 */

function isSectionKey(value: unknown): value is HomepageSectionKey {
  return (
    typeof value === "string" &&
    (HOMEPAGE_SECTION_KEYS as readonly string[]).includes(value)
  );
}

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const rows = await db.homepageSection.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return NextResponse.json({
      sections: HOMEPAGE_SECTION_KEYS.map((key) => {
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
    console.error("homepage-sections GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت وضعیت سکشن‌های صفحه‌ی اول." },
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

    if (!body || !isSectionKey(body.key)) {
      return NextResponse.json(
        { error: "کلید سکشن نامعتبر است." },
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

    const saved = await db.homepageSection.upsert({
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
    console.error("homepage-sections PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ذخیره‌ی وضعیت سکشن. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
