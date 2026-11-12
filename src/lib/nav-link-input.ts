import { str, int, bool } from "@/lib/api-helpers";

/**
 * اعتبارسنجی ورودی لینک‌های هدر/فوتر (ماژول «ویرایش هدر و فوتر») —
 * الگوی آن با parseVideo/parseCourse در api-helpers یکسان است؛ چون فایل
 * api-helpers قابل ویرایش نیست، پارسر اختصاصی NavLink در این فایل نگهداری می‌شود.
 */

const SECTION_SET = new Set(["header", "footer"]);
const KIND_SET = new Set(["internal", "external"]);
const TARGET_SET = new Set(["same", "blank"]);

export interface NavLinkInput {
  label: string;
  section: string;
  url: string;
  kind: string;
  target: string;
  isButton: boolean;
  sortOrder: number;
  published: boolean;
}

/** فیلدهای فعلی یک رکورد NavLink که برای اعتبارسنجی وصله لازم است */
export interface NavLinkCore {
  label: string;
  section: string;
  url: string;
  kind: string;
  target: string;
  isButton: boolean;
  sortOrder: number;
  published: boolean;
}

/** اعتبارسنجی آدرس بر اساس نوع لینک */
function validateUrl(url: string, kind: string): string | null {
  if (kind === "external") {
    if (!/^https?:\/\//i.test(url)) {
      return "آدرس خارجی باید با http یا https شروع شود.";
    }
    if (url.length > 500) {
      return "آدرس خارجی حداکثر می‌تواند ۵۰۰ نویسه باشد.";
    }
    return null;
  }
  if (!url.startsWith("/") && !url.startsWith("#")) {
    return "آدرس داخلی باید با «/» یا «#» شروع شود.";
  }
  if (url.length > 300) {
    return "آدرس داخلی حداکثر می‌تواند ۳۰۰ نویسه باشد.";
  }
  return null;
}

/** اعتبارسنجی کامل بدنه‌ی ایجاد لینک (POST) */
export function parseNavLink(
  body: Record<string, unknown> | null
): NavLinkInput | string {
  if (!body) return "بدنه درخواست نامعتبر است.";

  const label = str(body.label);
  if (label.length < 2 || label.length > 60) {
    return "برچسب لینک باید بین ۲ تا ۶۰ نویسه باشد.";
  }

  const section = str(body.section, "header");
  if (!SECTION_SET.has(section)) {
    return "بخش لینک باید «header» یا «footer» باشد.";
  }

  const kind = str(body.kind, "internal");
  if (!KIND_SET.has(kind)) {
    return "نوع لینک باید «internal» یا «external» باشد.";
  }

  const target = str(body.target, "same");
  if (!TARGET_SET.has(target)) {
    return "هدف باز شدن لینک باید «same» یا «blank» باشد.";
  }

  const url = str(body.url);
  const urlError = validateUrl(url, kind);
  if (urlError) return urlError;

  return {
    label,
    section,
    url,
    kind,
    target,
    isButton: bool(body.isButton, false),
    sortOrder: int(body.sortOrder, 0),
    published: bool(body.published, true),
  };
}

/**
 * اعتبارسنجی به‌روزرسانی جزئی (PUT) — فقط فیلدهای ارسال‌شده در بدنه اعمال
 * می‌شوند؛ اعتبارسنجی فیلدهای وابسته (مثل url و kind) روی مقدارِ ترکیب‌شده با
 * رکورد فعلی انجام می‌شود تا وصله‌های کوچک (مثلاً فقط published) مجاز بمانند.
 */
export function parseNavLinkPatch(
  body: Record<string, unknown> | null,
  current: NavLinkCore
): { data: Partial<NavLinkInput> } | string {
  if (!body) return "بدنه درخواست نامعتبر است.";

  const data: Partial<NavLinkInput> = {};

  const label = "label" in body ? str(body.label) : current.label;
  if (label.length < 2 || label.length > 60) {
    return "برچسب لینک باید بین ۲ تا ۶۰ نویسه باشد.";
  }
  if ("label" in body) data.label = label;

  const section = "section" in body ? str(body.section) : current.section;
  if (!SECTION_SET.has(section)) {
    return "بخش لینک باید «header» یا «footer» باشد.";
  }
  if ("section" in body) data.section = section;

  const kind = "kind" in body ? str(body.kind) : current.kind;
  if (!KIND_SET.has(kind)) {
    return "نوع لینک باید «internal» یا «external» باشد.";
  }
  if ("kind" in body) data.kind = kind;

  const target = "target" in body ? str(body.target) : current.target;
  if (!TARGET_SET.has(target)) {
    return "هدف باز شدن لینک باید «same» یا «blank» باشد.";
  }
  if ("target" in body) data.target = target;

  const url = "url" in body ? str(body.url) : current.url;
  const urlError = validateUrl(url, kind);
  if (urlError) return urlError;
  if ("url" in body) data.url = url;

  if ("isButton" in body) data.isButton = bool(body.isButton, current.isButton);
  if ("sortOrder" in body) data.sortOrder = int(body.sortOrder, current.sortOrder);
  if ("published" in body) data.published = bool(body.published, current.published);

  if (Object.keys(data).length === 0) {
    return "هیچ فیلد قابل ویرایشی ارسال نشده است.";
  }

  return { data };
}
