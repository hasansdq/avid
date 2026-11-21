import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, str } from "@/lib/api-helpers";
import {
  isValidNationalId,
  normalizeNationalId,
} from "@/lib/national-id";

/**
 * GET/PUT/DELETE /api/admin/users/[id] — مدیریت یک کاربر.
 *
 * GET    → { user, enrollments, classes } (ثبت‌نام‌ها همراه اقساط + کلاس‌های کاربر)
 * PUT    → { firstName?, lastName?, phone?, status?, note?, role? }
 *          مسدودسازی → نشست‌های کاربر بلافاصله باطل می‌شوند
 * DELETE → حذف کاربر (نشست‌ها خودکار حذف؛ ثبت‌نام‌ها باقی می‌مانند)
 */

type Params = { params: Promise<{ id: string }> };

const USER_STATUSES = new Set(["active", "blocked"]);

/** نقش‌های مجاز حساب کاربر — student | teacher */
const USER_ROLES = new Set(["student", "teacher"]);

export async function GET(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const user = await db.user.findUnique({ where: { id } });
    if (!user) return bad("کاربری با این شناسه یافت نشد.", 404);

    const enrollments = await db.enrollment.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      include: { installments: { orderBy: { index: "asc" } } },
    });

    // کلاس‌هایی که کاربر عضو آنهاست (فقط مدیر می‌بیند؛ پنل کاربر نمایش نمی‌دهد)
    const classes = await db.classMembership.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      include: { classRoom: { select: { id: true, title: true } } },
    });

    return NextResponse.json({ user, enrollments, classes });
  } catch (error) {
    console.error("admin user GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت اطلاعات کاربر." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body) return bad("بدنه درخواست نامعتبر است.");

    const user = await db.user.findUnique({ where: { id } });
    if (!user) return bad("کاربری با این شناسه یافت نشد.", 404);

    const data: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      nationalId?: string | null;
      status?: string;
      note?: string | null;
      role?: string;
    } = {};

    // — نام و نام خانوادگی (۲ تا ۴۰ نویسه) —
    if ("firstName" in body) {
      const firstName = str(body.firstName);
      if (firstName.length < 2 || firstName.length > 40) {
        return bad("نام باید ۲ تا ۴۰ نویسه باشد.");
      }
      data.firstName = firstName;
    }
    if ("lastName" in body) {
      const lastName = str(body.lastName);
      if (lastName.length < 2 || lastName.length > 40) {
        return bad("نام خانوادگی باید ۲ تا ۴۰ نویسه باشد.");
      }
      data.lastName = lastName;
    }

    // — شماره موبایل: قالب ۰۹… و یکتا بین بقیه‌ی کاربران —
    if ("phone" in body) {
      const phone = str(body.phone).replace(/[\s-]/g, "");
      if (!/^09\d{9}$/.test(phone)) {
        return bad("شماره موبایل معتبر نیست (مثال: 09123456789).");
      }
      if (phone !== user.phone) {
        const clash = await db.user.findUnique({ where: { phone } });
        if (clash && clash.id !== user.id) {
          return bad("این شماره موبایل به کاربر دیگری تعلق دارد.", 409);
        }
      }
      data.phone = phone;
    }

    // — کد ملی (اختیاری): خالی = حذف؛ مقدار باید معتبر و یکتا باشد —
    if ("nationalId" in body) {
      const clean =
        body.nationalId === null || body.nationalId === undefined
          ? ""
          : normalizeNationalId(String(body.nationalId));
      if (clean !== "") {
        if (!isValidNationalId(clean)) {
          return bad(
            "کد ملی ۱۰ رقمی معتبر وارد کنید یا این فیلد را خالی بگذارید."
          );
        }
        if (clean !== user.nationalId) {
          const owner = await db.user.findUnique({
            where: { nationalId: clean },
          });
          if (owner && owner.id !== user.id) {
            return bad("این کد ملی به کاربر دیگری تعلق دارد.", 409);
          }
        }
        data.nationalId = clean;
      } else {
        data.nationalId = null;
      }
    }

    // — وضعیت (active | blocked) —
    let blocking = false;
    if ("status" in body) {
      const status = str(body.status);
      if (!USER_STATUSES.has(status)) {
        return bad("وضعیت کاربر باید «active» یا «blocked» باشد.");
      }
      data.status = status;
      blocking = status === "blocked" && user.status !== "blocked";
    }

    // — نقش حساب (student | teacher) —
    // سلب نقش استاد (teacher → student) هیچ دارایی‌ای را حذف نمی‌کند:
    // دوره‌ها، کلاس‌ها و استریم‌های ساخته‌شده‌ی او روی نامش می‌مانند و فقط
    // امکاناتِ استادِ او (پنل استاد، میزبانی استریم و…) تا ارتقای مجدد بسته می‌شود.
    if ("role" in body) {
      const role = str(body.role);
      if (!USER_ROLES.has(role)) {
        return bad("نقش نامعتبر است.");
      }
      data.role = role;
    }

    // — یادداشت مدیر (حداکثر ۵۰۰ نویسه؛ رشته‌ی خالی = حذف یادداشت) —
    if ("note" in body) {
      const rawNote = body.note;
      const note =
        rawNote === null || rawNote === undefined ? "" : str(String(rawNote));
      if (note.length > 500) {
        return bad("یادداشت نمی‌تواند بیش از ۵۰۰ نویسه باشد.");
      }
      data.note = note === "" ? null : note;
    }

    if (Object.keys(data).length === 0) {
      return bad("هیچ فیلد قابل ویرایشی ارسال نشده است.");
    }

    await db.user.update({ where: { id }, data });

    // — مسدودسازی: نشست‌های فعال کاربر بلافاصله باطل می‌شوند —
    if (blocking) {
      await db.userSession.deleteMany({ where: { userId: id } });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("admin user PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ویرایش کاربر." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const { id } = await params;
    const user = await db.user
      .delete({ where: { id } })
      .catch(() => null);
    if (!user) return bad("کاربری با این شناسه یافت نشد.", 404);

    // نشست‌ها با Cascade حذف می‌شوند؛ ثبت‌نام‌ها با SetNull بدون کاربر می‌مانند
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("admin user DELETE error:", error);
    return NextResponse.json(
      { error: "خطا در حذف کاربر." },
      { status: 500 }
    );
  }
}
