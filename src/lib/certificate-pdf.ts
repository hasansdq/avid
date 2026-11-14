/**
 * ساخت فایل PDF گواهی‌نامه روی دستگاه کاربر (کلاینت‌ساید).
 *
 * برگه‌ی HTML با html-to-image عکس گرفته می‌شود و در قالب A4 افقی با
 * jsPDF ذخیره می‌شود. چون رندر از طریق SVG foreignObject توسط خود مرورگر
 * انجام می‌شود، حروف‌چینی فارسی (اتصال حروف، نیم‌فاصله و ترتیب راست‌به‌چپ)
 * و رنگ‌های مدرن CSS کاملاً سالم می‌مانند.
 *
 * نکته: دو بار عکس گرفته می‌شود و خروجی دومی استفاده می‌شود — ترفند رسمی
 * html-to-image برای اطمینان از جاسازی کامل فونت‌ها و تصاویر در فراخوانی اول.
 */
export async function downloadCertificatePdf(
  sheetEl: HTMLElement,
  fileName: string
): Promise<void> {
  const { toPng } = await import("html-to-image");
  const { jsPDF } = await import("jspdf");

  // فونت‌های صفحه (وزیرمتن) حتماً آماده باشند
  try {
    await document.fonts?.ready;
  } catch {
    // نادیده‌گرفتن بی‌خطر
  }

  // دو فریم رندر برای پایدار شدن چیدمان برگه‌ی تازه‌سوار‌شده
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );

  const options = {
    pixelRatio: 2,
    width: 1123,
    height: 794,
    backgroundColor: "#FDFBF5",
  } as const;

  // — فراخوانی اول: جاسازی فونت/تصویر در حافظه‌ی داخلی کتابخانه —
  await toPng(sheetEl, options).catch(() => undefined);
  // — فراخوانی دوم: خروجی نهایی با فونت‌ها و لوگوی کامل —
  const dataUrl = await toPng(sheetEl, options);

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, 297, 210, undefined, "FAST");
  pdf.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}
