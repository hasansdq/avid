import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

/** سقف کاربران هر درخواستِ افزودن گروهی */
const MAX_ADD_PER_REQUEST = 100;

/** شماره‌ی موبایل معتبر ایران (۱۱ رقم با ۰۹...) */
const PHONE_PATTERN = /^09\d{9}$/;

/**
 * GET /api/admin/classes/[id]/members — لیست اعضای کلاس (جدیدترین عضویت اول).
 *
 * هر ردیف: شناسه‌ی عضویت، تاریخ عضویت و مشخصات کاربر (نام، نام خانوادگی،
 * موبایل، کد ملی) — برای نمایش در دیالوگ اعضای کلاس و حذف عضو.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const classRoom = await db.classRoom.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!classRoom) return bad("کلاسی با این شناسه یافت نشد.", 404);

    const members = await db.classMembership.findMany({
      where: { classId: id },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            nationalId: true,
          },
        },
      },
    });

    return NextResponse.json({
      classTitle: classRoom.title,
      members,
    });
  } catch (error) {
    console.error("class members GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت اعضای کلاس." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/classes/[id]/members — افزودن تکی/گروهی کاربران به کلاس.
 *
 * فقط نقش مدیر (کوکی نشست مدیر) — استاد این اجازه را ندارد (API استاد
 * چنین مسیری ندارد و مسیرِ مدیر با requireAdmin محافظت می‌شود).
 *
 * body (یکی از دو حالت):
 *  • { userId: "<cuid>" }            — افزودن تکی از روی شناسه‌ی کاربر (انتخاب از جست‌وجو)
 *  • { phones: ["09…", "09…"] }      — افزودن گروهی با لیست شماره موبایل
 *
 * عضویت‌های تکراری رد می‌شوند (unique userId+classId) و پاسخ، خلاصه‌ی
 * «افزوده‌شده / ازقبل‌عضو / ناموفق» + لیست تازه‌ی اعضا را برمی‌گرداند.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) return bad("بدنه درخواست نامعتبر است.");

    const classRoom = await db.classRoom.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!classRoom) return bad("کلاسی با این شناسه یافت نشد.", 404);

    // — حالت ۱: افزودن تکی با شناسه‌ی کاربر —
    const rawUserId = str(body.userId);
    if (rawUserId) {
      const user = await db.user.findUnique({
        where: { id: rawUserId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!user) return bad("کاربر یافت نشد.", 404);

      const existing = await db.classMembership.findUnique({
        where: { userId_classId: { userId: user.id, classId: id } },
        select: { id: true },
      });
      if (existing) {
        return bad("این کاربر از قبل عضو کلاس است.", 409);
      }

      const membership = await db.classMembership.create({
        data: { userId: user.id, classId: id },
      });
      return NextResponse.json(
        { added: 1, existing: 0, notFound: [], membership },
        { status: 201 }
      );
    }

    // — حالت ۲: افزودن گروهی با لیست شماره موبایل —
    const rawPhones = body.phones;
    if (!Array.isArray(rawPhones)) {
      return bad("userId یا phones باید ارسال شود.");
    }
    if (rawPhones.length === 0) return bad("لیست شماره‌ها خالی است.");
    if (rawPhones.length > MAX_ADD_PER_REQUEST) {
      return bad(
        `حداکثر ${MAX_ADD_PER_REQUEST} کاربر در هر درخواست می‌توان افزود.`
      );
    }

    // پاک‌سازی و یکتاسازی شماره‌ها (فاصله/خط تیره حذف؛ ارقام فارسی → انگلیسی)
    const faToEn = (s: string) =>
      s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
    const phones = [
      ...new Set(
        rawPhones.map((p) =>
          typeof p === "string" ? faToEn(p.trim()).replace(/[\s-]/g, "") : ""
        )
      ),
    ].filter((p) => p !== "");

    const invalid = phones.filter((p) => !PHONE_PATTERN.test(p));
    if (invalid.length > 0) {
      return bad(
        `شماره(های) نامعتبر: ${invalid.join("، ")} — شماره باید ۱۱ رقمی و با ۰۹ شروع شود.`
      );
    }

    // کاربرانِ این شماره‌ها — هر کاربری با این شماره (فعال یا مسدود) اضافه
    // می‌شود؛ وضعیت حساب در لیست اعضا قابل بررسی و حذف است.
    const users = await db.user.findMany({
      where: { phone: { in: phones } },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    const usersByPhone = new Map(users.map((u) => [u.phone, u]));

    const foundIds = users.map((u) => u.id);
    const existingMemberships = foundIds.length
      ? await db.classMembership.findMany({
          where: { classId: id, userId: { in: foundIds } },
          select: { userId: true },
        })
      : [];
    const existingIds = new Set(existingMemberships.map((m) => m.userId));

    const toAdd = users.filter((u) => !existingIds.has(u.id));
    if (toAdd.length > 0) {
      await db.classMembership.createMany({
        data: toAdd.map((u) => ({ userId: u.id, classId: id })),
      });
    }

    const notFoundPhones = phones.filter((p) => !usersByPhone.has(p));

    return NextResponse.json(
      {
        added: toAdd.length,
        existing: existingIds.size,
        notFound: notFoundPhones,
        addedUsers: toAdd.map((u) => ({
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          phone: u.phone,
        })),
      },
      { status: toAdd.length > 0 ? 201 : 200 }
    );
  } catch (error) {
    console.error("class members POST error:", error);
    return NextResponse.json(
      { error: "خطا در افزودن اعضای کلاس. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
