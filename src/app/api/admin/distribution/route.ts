import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { forwardedOrigin, officialOrigin } from "@/lib/http";
import QRCode from "qrcode";

/**
 * توزیع اپلیکیشن سایت — GET /api/admin/distribution?platform=...
 * (بخش «توزیع اپلیکیشن» ماژول بکاپ و بازیابی پنل مدیر)
 *
 *  • platform=windows → «فایل نصبی ویندوز» (‎.cmd): روی سیستم کاربر
 *    اجرا می‌شود، میان‌بر دسکتاپ + منوی Start می‌سازد و سایت را در پنجره‌ی
 *    اپ مستقل (Edge/Chrome app-mode) باز می‌کند — تجربه‌ی اپ نصب‌شده.
 *  • platform=android → «کارت نصب اندروید» (SVG): QR آدرس سایت + مراحل
 *    نصب PWA در کروم — کروم اپ را با آیکون لانچر و پنجره‌ی مستقل نصب
 *    می‌کند (WebAPK).
 *  • platform=ios → «کارت نصب iOS» (SVG): QR + مراحل «Add to Home Screen»
 *    در Safari — وب‌اپ تمام‌صفحه.
 *  • platform=info → JSON آدرس فعال و نام سایت (نمایش در پنل).
 *
 * آدرس سایت: SITE_URL رسمی، وگرنه همان مبدای درخواست (رفتار پیشینِ
 * آدرس بازگشت پرداخت). &display=inline برای نمایش درون‌پنلی (بدون
 * Content-Disposition دانلودی). همه‌ی پاسخ‌ها no-store‌اند.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** escape متن داخل SVG/XML */
function xmlEsc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** escape رشته برای داخل فایل CMD (نویسه‌های خاص batch حذف می‌شوند) */
function cmdSafe(s: string): string {
  return s.replace(/["%&|<>^]/g, "");
}

/* ---------- کارت نصب QR (SVG) ---------- */

/** QR خالص و خوانا برای نمایش درون‌پنلی (نه کل کارت) */
async function qrOnlySvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    margin: 2,
    width: 240,
    errorCorrectionLevel: "M",
    color: { dark: "#052e28", light: "#ffffff" },
  });
}

/** QR را به‌صورت گروه SVG با جای‌گذاری در (x,y) برمی‌گرداند */
async function qrGroup(
  url: string,
  x: number,
  y: number,
  size: number
): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 0,
    width: size,
    errorCorrectionLevel: "M",
  });
  // برداشتن پوشش بیرونی <svg …> و </svg> برای جاسازی در کارت
  const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return `<g transform="translate(${x},${y})">${inner}</g>`;
}

/**
 * کارت نصب چاپی/قابل‌اسکن — SVG مستقل
 * عنوان و نام سایت بالای QR، مراحل نصب زیر آن و URL پایین کارت.
 */
async function installCardSvg(
  siteUrl: string,
  siteName: string,
  title: string,
  steps: string[]
): Promise<string> {
  const W = 440;
  const H = 620;
  const name = xmlEsc(siteName);
  const titleEsc = xmlEsc(title);
  const urlEsc = xmlEsc(siteUrl.replace(/^https?:\/\//, ""));
  const stepsEsc = steps.map((s) => xmlEsc(s));

  const stepLines = stepsEsc
    .map(
      (s, i) =>
        `<text x="${W / 2}" y="${418 + i * 34}" text-anchor="middle" font-size="17" fill="#12312c" font-weight="700">${s}</text>`
    )
    .join("");

  const qr = await qrGroup(siteUrl, (W - 250) / 2, 128, 250);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Vazirmatn, Tahoma, 'Segoe UI', sans-serif">
  <rect width="${W}" height="${H}" rx="18" fill="#ffffff"/>
  <rect width="${W}" height="96" rx="18" fill="#052e28"/>
  <rect y="78" width="${W}" height="18" fill="#052e28"/>
  <text x="${W / 2}" y="40" text-anchor="middle" font-size="21" fill="#ffffff" font-weight="900">${titleEsc}</text>
  <text x="${W / 2}" y="72" text-anchor="middle" font-size="15" fill="#7fe3d2" font-weight="700">${name} — آکادمی آنلاین</text>

  <rect x="${(W - 270) / 2}" y="118" width="270" height="270" rx="14" fill="#ffffff" stroke="#052e28" stroke-width="3"/>
  ${qr}

  ${stepLines}

  <text x="${W / 2}" y="${H - 58}" text-anchor="middle" font-size="13" fill="#5f6f6c" font-weight="700" direction="ltr">${urlEsc}</text>
  <text x="${W / 2}" y="${H - 30}" text-anchor="middle" font-size="12" fill="#8a9a96">این کارت را چاپ یا به کاربران ارسال کنید — اسکن با دوربین گوشی</text>
</svg>`;
}

/* ---------- فایل نصبی ویندوز (.cmd) ---------- */

function windowsInstaller(siteUrl: string, siteName: string): string {
  const safeName = cmdSafe(siteName).slice(0, 40) || "Avid";
  return `@echo off
chcp 65001 >nul
title نصب اپلیکیشن ${safeName} روی ویندوز
echo.
echo   در حال نصب اپلیکیشن «${safeName}» روی ویندوز...
echo   (میان‌بر روی دسکتاپ و منوی Start ساخته می‌شود)
echo.

set "SITE=${siteUrl}"

rem — پیدا کردن مرورگر Edge یا Chrome (پنجره‌ی اپ مستقل با هرکدام ساخته می‌شود) —
set "BROWSER="
if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"
if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"
if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"
if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"

if not defined BROWSER (
  echo   x مرورگر Microsoft Edge یا Google Chrome پیدا نشد.
  echo     لطفا ابتدا یکی از این دو مرورگر را نصب کنید و این فایل را دوباره اجرا کنید.
  pause
  exit /b 1
)

rem — ساخت میان‌بر در دسکتاپ و منوی Start (پنجره‌ی اپ مستقل، بدون نوار آدرس) —
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; foreach($base in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))){ $lnk=$ws.CreateShortcut((Join-Path $base '${safeName}.lnk')); $lnk.TargetPath='%BROWSER%'; $lnk.Arguments='--app=%SITE%'; $lnk.IconLocation='%BROWSER%,0'; $lnk.Description='${safeName} - آکادمی آنلاین'; $lnk.Save() }"

rem — اجرای فوری اپ در پنجره‌ی مستقل —
start "" "%BROWSER%" --app=%SITE%

echo.
echo   نصب انجام شد! آیکون «${safeName}» روی دسکتاپ و منوی Start ساخته شد
echo   و اپ همین حالا در پنجره‌ی مستقل باز می‌شود.
echo.
echo   برای اجرا بعدی: در منوی Start نام «${safeName}» را جست‌وجو کنید.
echo.
pause
`;
}

/* ---------- handler ---------- */

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(req: NextRequest): Promise<Response> {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  const platform = req.nextUrl.searchParams.get("platform") ?? "info";
  const inline = req.nextUrl.searchParams.get("display") === "inline";

  const settings = await db.siteSettings
    .findUnique({ where: { id: "main" } })
    .catch(() => null);
  const siteName = settings?.siteName?.trim() || "آوید";
  // آدرس رسمی (SITE_URL) اولویت دارد؛ وگرنه مبدای همین درخواست (پنل)
  const siteUrl = officialOrigin() ?? forwardedOrigin(req);

  if (platform === "info") {
    return noStore(
      NextResponse.json({
        siteUrl,
        siteName,
        pwaManifest: "/manifest.webmanifest",
      })
    );
  }

  if (platform === "windows") {
    const body = windowsInstaller(siteUrl, siteName);
    const res = new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
    if (!inline) {
      res.headers.set(
        "Content-Disposition",
        'attachment; filename="avid-windows-install.cmd"'
      );
    }
    return noStore(res);
  }

  if (platform === "android" || platform === "ios") {
    // نمایش درون‌پنلی: QR خالصِ خوانا؛ دانلود: کارت کامل نصب
    if (inline) {
      const svg = await qrOnlySvg(siteUrl);
      return noStore(
        new NextResponse(svg, {
          status: 200,
          headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy":
              "default-src 'none'; style-src 'unsafe-inline'; script-src 'none'",
          },
        })
      );
    }

    const isAndroid = platform === "android";
    const svg = await installCardSvg(
      siteUrl,
      siteName,
      isAndroid ? "نصب اپلیکیشن اندروید" : "نصب وب‌اپ iOS",
      isAndroid
        ? [
            "۱. کد را با دوربین گوشی اسکن کنید تا سایت در کروم باز شود",
            "۲. در کروم منوی ⋮ را باز کنید",
            "۳. «نصب اپلیکیشن» / Install app را بزنید",
            "→ آیکون اپ در لانچر ساخته می‌شود و اپ در پنجره‌ی مستقل باز می‌شود",
          ]
        : [
            "۱. کد را با دوربین iPhone اسکن کنید تا سایت در Safari باز شود",
            "۲. دکمه‌ی اشتراک‌گذاری (Share) را بزنید",
            "۳. «Add to Home Screen» را انتخاب کنید",
            "→ وب‌اپ تمام‌صفحه با آیکون روی صفحه‌ی اصلی ساخته می‌شود",
          ]
    );
    const res = new NextResponse(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        // کارت ساده‌ی تولیدی خودمان است — سیستمی بدون-اسکریپت کافی و امن
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'none'",
      },
    });
    if (!inline) {
      res.headers.set(
        "Content-Disposition",
        `attachment; filename="avid-${platform}-install.svg"`
      );
    }
    return noStore(res);
  }

  return NextResponse.json(
    { error: "پلتفرم نامعتبر است (windows | android | ios | info)." },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  );
}
