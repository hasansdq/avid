import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad } from "@/lib/api-helpers";
import { ensureNavLinksSeeded } from "@/lib/nav-links";
import { parseNavLink } from "@/lib/nav-link-input";

export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    await ensureNavLinksSeeded();
    const links = await db.navLink.findMany({
      orderBy: [{ section: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(links);
  } catch (error) {
    console.error("nav-links GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت لینک‌های هدر و فوتر." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);
    const data = parseNavLink(body);
    if (typeof data === "string") return bad(data);

    const link = await db.navLink.create({ data });
    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    console.error("nav-links POST error:", error);
    return NextResponse.json(
      { error: "خطا در ایجاد لینک. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
