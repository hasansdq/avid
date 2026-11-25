import sanitizeHtml from "sanitize-html";

/**
 * اعتبارسنجی/پاکسازی HTML قابل تنظیم (کدهای نماد اعتماد — بند ۹) —
 *
 * کدهای اینماد/زرین‌پال که مدیر در تنظیمات سایت می‌گذارد، در فوتر با
 * dangerouslySetInnerHTML رندر می‌شوند؛ پیش از ذخیره:
 *
 *  ۱) فقط تَگ‌ها/ویژگی‌های لیست‌سفید مجازند (a، img، span، div، جدول،
 *     تیترها و …) — <iframe> و on* و javascript: و طرح‌های
 *     غیرHTTPS حذف می‌شوند.
 *  ۲) اسکریپتِ «رسمی» اینماد/زرین‌پال (بدنه‌خالی با src HTTPS از دامنه‌های
 *     رسمی این سرویس‌ها) «بازسازی» می‌شود: تگ ورودی عیناً برنمی‌گردد؛
 *     فقط ویژگی‌های تأییدشده (src/type/async/defer) با مقادیر فرار-داده‌شده
 *     بازنویسی می‌شوند و هر ویژگی دیگر (onerror، onload، id و…) حذف می‌شود —
 *     تزریق ویژگی رویدادی از طریق کد ذخیره‌شده ممکن نیست. اسکریپت رسمی
 *     موردنیاز نماد اعتماد (مثل logo.js اینماد) حفظ می‌شود. CSP صفحه هم
 *     فقط همین دامنه‌ها را در script-src مجاز می‌داند (دفاع لایه‌ای).
 *  ۳) همین پاکسازی روی مسیر «بازیابی بکاپ» (restore) هم اجرا می‌شود
 *     تا رکورد Settings تزریق‌شده از فایل بکاپ از کنار آن رد نشود.
 */

/** دامنه‌های رسمی سرویس‌های نماد اعتماد (اسکریپت‌هایشان مجاز است) */
function trustHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "enamad.ir" ||
    h.endsWith(".enamad.ir") ||
    h === "zarinpal.com" ||
    h.endsWith(".zarinpal.com")
  );
}

/** فرار مقدار ویژگی هنگام بازسازی تگ اسکریپت */
function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** مقدار type مجاز برای اسکریپت رسمی (javascript/ecmascript) */
const SCRIPT_TYPE_OK =
  /^(text|application)\/(x-)?(javascript|ecmascript)$/i;

interface ParsedScriptAttrs {
  src?: string;
  type?: string;
  async?: boolean;
  defer?: boolean;
}

/**
 * تفسیر ویژگی‌های تگ اسکریپت — فقط نام‌های سفید (src/type/async/defer)
 * نگه داشته می‌شوند؛ «هر» ویژگی دیگر (onerror، onload، style، id و…)
 * عمداً دور ریخته می‌شود. مقادیر نقل‌قولی/خالی پشتیبانی می‌شوند.
 */
function parseScriptAttrs(attrs: string): ParsedScriptAttrs {
  const out: ParsedScriptAttrs = {};
  const re =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    if (name === "src") out.src = value;
    else if (name === "type") out.type = value;
    else if (name === "async") out.async = true;
    else if (name === "defer") out.defer = true;
  }
  return out;
}

/** بازسازی تگ اسکریپت مطمون با «فقط» ویژگی‌های تأییدشده */
function rebuildTrustedScript(src: string, attrs: string): string {
  const parsed = parseScriptAttrs(attrs);
  const parts = [`src="${escapeAttrValue(src)}"`];
  if (parsed.type && SCRIPT_TYPE_OK.test(parsed.type)) {
    parts.push(`type="${escapeAttrValue(parsed.type)}"`);
  }
  if (parsed.async) parts.push("async");
  if (parsed.defer) parts.push("defer");
  return `<script ${parts.join(" ")}></script>`;
}

/**
 * استخراج اسکریپت‌های رسمی (بدنه‌خالی + src HTTPS از دامنه‌ی مجاز).
 * تگِ خروجی «بازسازی‌شده» است (rebuildTrustedScript) — تگ ورودی عیناً
 * به خروجی راه پیدا نمی‌کند؛ ویژگی‌های ناشناخته حذف می‌شوند.
 */
function extractTrustedScripts(
  html: string
): { trusted: string[]; rest: string } {
  const trusted: string[] = [];
  const rest = html.replace(
    /<script\b([^>]*)>\s*<\/script\s*>/gi,
    (whole: string, attrs: string) => {
      void whole;
      const srcMatch =
        /src\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs) ?? null;
      const url = srcMatch
        ? srcMatch[2] ?? srcMatch[3] ?? ""
        : "";
      if (/^https:\/\//i.test(url)) {
        try {
          if (trustHost(new URL(url).hostname)) {
            trusted.push(rebuildTrustedScript(url, attrs));
            return ""; // از باقی HTML حذف تا فقط نسخه‌ی بازسازی‌شده بماند
          }
        } catch {
          /* URL خراب — کنار گذاشته می‌شود */
        }
      }
      return "";
    }
  );
  return { trusted, rest };
}

const ALLOWED_TAGS = [
  "a", "img", "span", "div", "p", "br", "b", "i", "em", "strong", "u",
  "s", "small", "center", "h1", "h2", "h3", "h4", "h5", "h6", "ul",
  "ol", "li", "blockquote", "table", "thead", "tbody", "tfoot", "tr",
  "td", "th", "font", "noscript",
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "title", "target", "rel"],
  img: ["src", "alt", "border", "width", "height", "style", "referrerpolicy"],
  table: ["border", "width", "cellpadding", "cellspacing", "style"],
  td: ["align", "valign", "colspan", "rowspan", "width", "style"],
  th: ["align", "valign", "colspan", "rowspan", "width", "style"],
  font: ["color", "size", "face"],
  span: ["style"],
  div: ["style"],
  "*": ["dir", "lang"],
};

/**
 * پاکسازی HTML نماد اعتماد — خروجی امن برای رندر در فوتر سایت.
 * اسکریپت‌های رسمی اینماد/زرین‌پال (src از دامنه رسمی) «بازسازی‌شده»
 * (با فقط src/type/async/defer) حفظ می‌شوند.
 */
export function sanitizeTrustHtml(html: string | null | undefined): string {
  if (!html) return "";
  const { trusted, rest } = extractTrustedScripts(String(html));
  const cleaned = sanitizeHtml(rest, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer nofollow",
      }),
    },
  });
  return [...trusted, cleaned].filter(Boolean).join("\n");
}

/** آیا مقدار پاکسازی‌شده هنوز به دامنه‌ی مورد انتظار اشاره دارد؟ */
export function htmlReferencesDomain(
  sanitized: string,
  domainRe: RegExp
): boolean {
  return domainRe.test(sanitized);
}

/**
 * اعتبارسنجی آدرس لوگو/تصویر ذخیره‌شده در تنظیمات — فقط مسیر محلی،
 * http(s) یا data:image مجاز است (javascript: و مانند آن رد می‌شود).
 */
export function isSafePublicAssetUrl(value: string): boolean {
  const t = value.trim();
  if (!t) return true; // خالی = پیش‌فرض
  if (t.startsWith("/")) return true; // مسیر محلی سایت (/uploads/…، /images/…)
  if (/^https?:\/\//i.test(t)) return true; // CDN بیرونی
  if (/^data:image\//i.test(t)) return true;
  return false;
}
