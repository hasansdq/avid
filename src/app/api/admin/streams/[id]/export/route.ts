import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { STREAM_STATUS_LABELS } from "@/lib/streams";

type Params = { params: Promise<{ id: string }> };

/** تاریخ و ساعت شمسی با ارقام فارسی — برای ستون‌های ورود/خروج */
function faDateTime(date: Date): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/**
 * GET /api/admin/streams/[id]/export — خروجی اکسل شرکت‌کنندگان کلاس آنلاین.
 *
 * فقط مدیر؛ برگه‌ی راست‌به‌چپ (RTL) با ستون‌های مشخصات، لحظه‌ی ورود/خروج،
 * مدت حضور (دقیقه) و وضعیت (در کلاس / اخراج‌شده / خارج‌شده).
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    // requireAdmin داخل try — خطای لایه‌ی احراز هم JSON مشخص برمی‌گرداند
    const { denial } = await requireAdmin(req);
    if (denial) return denial;

    const { id } = await params;
    const stream = await db.liveStream.findUnique({
      where: { id },
      include: {
        invitations: {
          include: {
            course: { select: { title: true } },
            classRoom: { select: { title: true } },
          },
        },
        participants: {
          orderBy: { joinedAt: "asc" },
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
                nationalId: true,
              },
            },
          },
        },
      },
    });
    if (!stream) {
      return NextResponse.json(
        { error: "کلاس آنلاین پیدا نشد." },
        { status: 404 }
      );
    }

    // دلیل دعوت هر شرکت‌کننده: عنوان دوره/کلاس‌های دعوت‌شده (تلاقی با حضور نداریم —
    // کلیه‌ی دعوت‌های کلاس چاپ می‌شود چون گزارش مدیریتی است)
    const invitationLabels = stream.invitations
      .map((inv) => {
        if (inv.classId) return `کلاس «${inv.classRoom?.title ?? ""}»`;
        return `دوره‌ی «${inv.courseTitle || inv.course?.title || ""}»`;
      })
      .filter((s) => s.length > 4)
      .join(" ، ");

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Z.ai";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("شرکت‌کنندگان", {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 3 }],
    });

    // — سربرگ گزارش —
    sheet.columns = [
      { header: "", width: 6 },
      { header: "", width: 18 },
      { header: "", width: 22 },
      { header: "", width: 16 },
      { header: "", width: 16 },
      { header: "", width: 34 },
      { header: "", width: 18 },
      { header: "", width: 18 },
      { header: "", width: 12 },
      { header: "", width: 14 },
    ];

    const titleRow = sheet.getRow(1);
    titleRow.getCell(1).value = `گزارش شرکت‌کنندگان کلاس آنلاین «${stream.title}»`;
    titleRow.getCell(1).font = { bold: true, size: 14 };
    titleRow.height = 24;

    const metaRow = sheet.getRow(2);
    metaRow.getCell(1).value =
      `وضعیت جلسه: ${STREAM_STATUS_LABELS[stream.status] ?? stream.status}` +
      (stream.startedAt
        ? ` — شروع: ${faDateTime(stream.startedAt)}`
        : "") +
      (stream.endedAt ? ` — پایان: ${faDateTime(stream.endedAt)}` : "") +
      (invitationLabels ? ` — دعوت‌ها: ${invitationLabels}` : "") +
      ` — تعداد شرکت‌کننده: ${stream.participants.length}`;
    metaRow.getCell(1).font = { size: 10, italic: true };

    // — ردیف عنوان ستون‌ها —
    const headerRow = sheet.getRow(3);
    const headers = [
      "ردیف",
      "نام",
      "نام خانوادگی",
      "شماره موبایل",
      "کد ملی",
      "دوره/کلاس (دعوت)",
      "لحظه‌ی ورود",
      "لحظه‌ی خروج",
      "مدت حضور (دقیقه)",
      "وضعیت",
    ];
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 10 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0F766E" },
      };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
    headerRow.height = 26;

    const now = Date.now();
    stream.participants.forEach((p, idx) => {
      const row = sheet.getRow(idx + 4);
      const leftAt = p.leftAt ? new Date(p.leftAt) : null;
      const endMs = leftAt ? leftAt.getTime() : now;
      const minutes = Math.max(
        0,
        Math.round((endMs - new Date(p.joinedAt).getTime()) / 60000)
      );
      const status = p.kicked
        ? "اخراج‌شده"
        : leftAt
          ? "خارج‌شده"
          : "در کلاس";

      row.getCell(1).value = idx + 1;
      row.getCell(2).value = p.user.firstName;
      row.getCell(3).value = p.user.lastName;
      row.getCell(4).value = p.user.phone;
      row.getCell(5).value = p.user.nationalId ?? "";
      row.getCell(6).value = invitationLabels || "—";
      row.getCell(7).value = faDateTime(new Date(p.joinedAt));
      row.getCell(8).value = leftAt ? faDateTime(leftAt) : "—";
      row.getCell(9).value = minutes;
      row.getCell(10).value = status;
      row.getCell(1).alignment = { horizontal: "center" };
      row.getCell(9).alignment = { horizontal: "center" };
      row.getCell(10).alignment = { horizontal: "center" };
      if (idx % 2 === 1) {
        for (let c = 1; c <= headers.length; c++) {
          row.getCell(c).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF0FDFA" },
          };
        }
      }
    });

    // فیلتر خودکار روی جدول شرکت‌کنندگان
    if (stream.participants.length > 0) {
      sheet.autoFilter = {
        from: { row: 3, column: 1 },
        to: { row: 3 + stream.participants.length, column: headers.length },
      };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const asciiName = `stream-${stream.id.slice(0, 10)}-participants.xlsx`;
    const persianName = encodeURIComponent(
      `شرکت‌کنندگان-کلاس-آنلاین-${stream.title.slice(0, 30)}.xlsx`
    );

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${persianName}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("admin stream export error:", error);
    return NextResponse.json(
      { error: "خطا در ساخت خروجی اکسل کلاس." },
      { status: 500 }
    );
  }
}
