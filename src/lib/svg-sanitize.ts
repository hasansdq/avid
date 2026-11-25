/**
 * پاکسازی امن SVG — (بند ۸ اصلاحات امنیتی)
 *
 * SVG تصاویر «متن» است و می‌تواند جاوااسکریپت حامل داشته باشد
 * (<script>، هندلرهای رویداد on*، javascript: در href، foreignObject،
 * DOCTYPE/ENTITY برای XXE). نمایش لوگو باید حفظ شود — پس به‌جای ردِ
 * کل SVG، فقط اجزای خطرناک حذف می‌شوند:
 *
 *  حذف: <!DOCTYPE/<!ENTITY (XXE)، <script>، <foreignObject>،
 *  هندلرهای on*، مقادیر javascript:/vbscript:/data:text در href/src،
 *  expression( و @import در CSS داخل فایل.
 *  حفظ: شکل‌ها، مسیرها، گرادیان‌ها، <style> و کلاس‌ها — تا لوگو
 *  و آواتار دقیقاً همان‌طور که بودند رندر شوند.
 *
 * دفاع لایه‌ای: در زمان «سرو» هم SVG ها با CSP سخت‌گیرانه
 * (script-src 'none'; sandbox) ارسال می‌شوند (روت /uploads).
 */

/** حذف تعریف‌های DTD/ENTITY — مسیر کلاسیک XXE */
function stripDeclarations(out: string): string {
  return out
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<!ENTITY[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

/** حذف بلوک‌های اسکریپت (همه‌شکل: با بدنه یا self-closing) */
function stripScripts(out: string): string {
  return out
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "");
}

/** حذف foreignObject (قالب HTML داخل SVG) */
function stripForeign(out: string): string {
  return out
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/<foreignObject\b[^>]*\/?>/gi, "");
}

/** حذف هندلرهای رویداد (هر ویژگی‌ای که با on شروع می‌شود) */
function stripEventHandlers(out: string): string {
  return out.replace(
    /\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    ""
  );
}

/** حذف URLهای خطرناک در href/src (شامل xlink:href؛ با یا بدون گیومه) */
function stripDangerousUrls(out: string): string {
  const bad =
    /^(?:javascript|vbscript|data\s*:\s*text|data\s*:\s*application|data\s*:\s*image\/svg)/i;
  return out.replace(
    /(\s+(?:xlink:href|href|src)\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/gi,
    (whole: string, _prefix: string, rawValue: string) => {
      const value = rawValue.replace(/^['"]|['"]$/g, "").trim();
      if (bad.test(value)) return ""; // کل ویژگی حذف می‌شود
      return whole;
    }
  );
}

/** خنثی‌سازی CSS خطرناک داخل <style> و ویژگی style */
function stripDangerousCss(out: string): string {
  return out
    .replace(/@import/gi, "")
    .replace(/expression\s*\(/gi, "")
    .replace(/url\(\s*(['"]?)\s*(?:javascript|vbscript|data):/gi, "url($1");
}

/** پاکسازی کامل SVG — ورودی خام، خروجی امن */
export function sanitizeSvg(source: string): string {
  if (!source) return "";
  let out = source;
  out = stripDeclarations(out);
  out = stripScripts(out);
  out = stripForeign(out);
  out = stripEventHandlers(out);
  out = stripDangerousUrls(out);
  out = stripDangerousCss(out);
  return out;
}

/** آیا SVG پاکسازی‌شده هنوز عنصر ریشه svg دارد؟ (بعد از پاکسازی) */
export function sanitizedSvgIsUsable(out: string): boolean {
  return /<svg[\s>]/i.test(out);
}
