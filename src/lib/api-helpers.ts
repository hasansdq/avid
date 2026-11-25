import { NextResponse } from "next/server";
import {
  isDiscountPaymentType,
  isDiscountValueType,
  isValidDiscountCodeFormat,
  normalizeDiscountCode,
} from "@/lib/discount";
import {
  sanitizeTrustHtml,
  isSafePublicAssetUrl,
} from "@/lib/html-sanitize";

/* ---------------- ابزارهای تبدیل و اعتبارسنجی ---------------- */

export function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v.trim() : fallback;
}

export function int(v: unknown, fallback = 0): number {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? parseInt(v, 10)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(Math.round(n), 100_000_000));
}

export function float(v: unknown, fallback = 0): number {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? parseFloat(v)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(n, 100_000_000));
}

export function bool(v: unknown, fallback = true): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

export function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

/* ---------------- دوره ---------------- */

const COURSE_TYPE_SET = new Set(["online", "inperson", "hybrid"]);

export interface CourseGroupInput {
  /** شناسه‌ی گروه موجود (فقط هنگام ویرایش — برای به‌روزرسانی درجا) */
  id?: string | null;
  title: string;
  schedule: string;
  capacity: number;
  sortOrder: number;
}

export interface CourseInstallmentInput {
  index: number; // شماره‌ی قسط (۱ تا N)
  dueDate: string; // تاریخ سررسید (YYYY-MM-DD یا ISO)
}

export interface CourseInput {
  title: string;
  description: string;
  category: string;
  type: string;
  level: string;
  hours: number;
  sessions: number;
  instructor: string;
  price: number;
  cashTuition: number;
  installmentTuition: number;
  capacity: number;
  schedule: string;
  students: number;
  icon: string;
  /** تصویر شاخص دوره (آپلودشده یا آدرس خارجی) — خالی یعنی نمایش آیکون */
  imageUrl: string;
  theme: string;
  tag: string | null;
  sortOrder: number;
  published: boolean;
  /** گروه‌های زمان‌بندی — فقط برای دوره‌های حضوری */
  groups: CourseGroupInput[];
  /** قالب اقساط — تعداد و تاریخ سررسید هر قسط (وقتی شهریه‌ی اقساطی مثبت است) */
  installments: CourseInstallmentInput[];
}

/**
 * اعتبارسنجی گروه‌های زمان‌بندی دوره‌ی حضوری —
 * هر گروه: عنوان (۱ تا ۶۰ نویسه)، زمان‌بندی (≤۱۲۰) و ظرفیت جداگانه.
 */
function parseGroups(
  body: Record<string, unknown> | null,
  type: string
): CourseGroupInput[] | string {
  if (type === "online") return []; // آنلاین گروه ندارد؛ حضوری و ترکیبی (hybrid) گروه‌دار می‌شوند
  const raw = body?.groups;
  if (!Array.isArray(raw)) return []; // حضوری بدون گروه هم مجاز است (سازگاری)
  if (raw.length > 20) return "حداکثر ۲۰ گروه برای هر دوره می‌توان تعریف کرد.";

  const groups: CourseGroupInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const g = raw[i];
    if (typeof g !== "object" || g === null) return "ساختار گروه‌های دوره نامعتبر است.";
    const title = str((g as Record<string, unknown>).title);
    const schedule = str((g as Record<string, unknown>).schedule);
    const capacity = int((g as Record<string, unknown>).capacity, 0);
    const id =
      typeof (g as Record<string, unknown>).id === "string"
        ? ((g as Record<string, unknown>).id as string)
        : null;
    if (title.length < 1 || title.length > 60)
      return `عنوان گروه ${faGroupNo(i)} باید ۱ تا ۶۰ نویسه باشد.`;
    groups.push({
      ...(id ? { id } : {}),
      title,
      schedule: schedule.slice(0, 120),
      capacity,
      sortOrder: i,
    });
  }
  return groups;
}

/**
 * اعتبارسنجی قالب اقساط دوره — تاریخ سررسید هر قسط.
 * فقط وقتی معنا دارد که شهریه‌ی اقساطی دوره مثبت باشد؛ در غیر این صورت نادیده گرفته می‌شود.
 */
function parseInstallments(
  body: Record<string, unknown> | null,
  installmentTuition: number
): CourseInstallmentInput[] | string {
  if (installmentTuition <= 0) return []; // بدون گزینه اقساطی → بدون قالب
  const raw = body?.installments;
  if (!Array.isArray(raw)) return []; // قالب تعریف نشده → پیش‌فرض سراسری
  if (raw.length < 1) return "حداقل یک قسط برای طرح اقساطی دوره لازم است.";
  if (raw.length > 36) return "حداکثر ۳۶ قسط برای هر دوره می‌توان تعریف کرد.";

  const rows: CourseInstallmentInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item !== "object" || item === null) {
      return "ساختار قالب اقساط دوره نامعتبر است.";
    }
    const dueDateRaw = (item as Record<string, unknown>).dueDate;
    if (typeof dueDateRaw !== "string" || !dueDateRaw.trim()) {
      return `تاریخ سررسید قسط ${faGroupNo(i)} را مشخص کنید.`;
    }
    const due = new Date(dueDateRaw.trim());
    if (Number.isNaN(due.getTime())) {
      return `تاریخ سررسید قسط ${faGroupNo(i)} معتبر نیست.`;
    }
    rows.push({ index: i + 1, dueDate: dueDateRaw.trim() });
  }
  return rows;
}

function faGroupNo(i: number): string {
  return String(i + 1);
}

export function parseCourse(body: Record<string, unknown> | null): CourseInput | string {
  if (!body) return "بدنه درخواست نامعتبر است.";
  const title = str(body.title);
  const description = str(body.description);
  const type = str(body.type, "online");

  if (title.length < 2 || title.length > 120) return "عنوان دوره باید بین ۲ تا ۱۲۰ نویسه باشد.";
  if (description.length < 5 || description.length > 600)
    return "توضیحات دوره باید بین ۵ تا ۶۰۰ نویسه باشد.";
  if (!COURSE_TYPE_SET.has(type))
    return "نوع دوره باید یکی از مقادیر «online»، «inperson» یا «hybrid» باشد.";

  const tag = str(body.tag);

  // — شهریه اختصاصی دوره —
  const cashTuition = int(body.cashTuition, 10_000_000);
  const installmentTuition = int(body.installmentTuition, 12_000_000);
  // صفر = بدون گزینه اقساطی؛ مقدار مثبت نمی‌تواند کمتر از نقدی باشد
  if (installmentTuition > 0 && installmentTuition < cashTuition) {
    return "مبلغ کل اقساطی دوره نمی‌تواند کمتر از شهریه‌ی نقدی باشد.";
  }

  // — گروه‌های زمان‌بندی (حضوری) —
  const groups = parseGroups(body, type);
  if (typeof groups === "string") return groups;

  // — قالب اقساط (تعداد و سررسید هر قسط) —
  const installments = parseInstallments(body, installmentTuition);
  if (typeof installments === "string") return installments;

  // ظرفیت دوره: برای دوره‌های گروه‌دارِ حضوری/ترکیبی = مجموع ظرفیت گروه‌ها
  const capacity =
    type !== "online" && groups.length > 0
      ? groups.reduce((sum, g) => sum + g.capacity, 0)
      : int(body.capacity, 0);

  return {
    title,
    description,
    category: str(body.category, "عمومی") || "عمومی",
    type,
    level: str(body.level, "مقدماتی") || "مقدماتی",
    hours: int(body.hours, 0),
    sessions: int(body.sessions, 0),
    instructor: str(body.instructor),
    price: int(body.price, 0),
    cashTuition,
    installmentTuition,
    capacity,
    schedule: str(body.schedule),
    students: int(body.students, 0),
    icon: str(body.icon, "Sparkles") || "Sparkles",
    imageUrl: str(body.imageUrl).slice(0, 500),
    theme: str(body.theme, "teal") || "teal",
    tag: tag ? tag.slice(0, 40) : null,
    sortOrder: int(body.sortOrder, 0),
    published: bool(body.published, true),
    groups,
    installments,
  };
}

/* ---------------- کدهای تخفیف ---------------- */

const DISCOUNT_MAX_VALUE = 500_000_000; // سقف مبلغ ثابت (تومان)
const DISCOUNT_MAX_USES = 100_000;

export interface DiscountCodeInput {
  code?: string;
  paymentType?: string;
  valueType?: string;
  value?: number;
  maxUses?: number;
  expiresAt?: Date | null;
  active?: boolean;
  note?: string | null;
  usedCount?: number;
}

/** تبدیل تاریخ انقضای ورودی (YYYY-MM-DD یا ISO) به Date — خالی = null */
function parseExpiresAt(v: unknown): Date | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return "invalid";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "invalid";
  return d;
}

/** اعتبارسنجی مشترک فیلدهای کد تخفیف (ایجاد/ویرایش) */
export function parseDiscountFields(
  body: Record<string, unknown> | null
): DiscountCodeInput | string {
  if (!body) return "بدنه درخواست نامعتبر است.";

  const data: DiscountCodeInput = {};

  // — متن کد (ایجاد/ویرایش) —
  if ("code" in body) {
    const code = normalizeDiscountCode(str(body.code));
    if (!isValidDiscountCodeFormat(code)) {
      return "کد تخفیف باید ۳ تا ۳۲ نویسه از حروف و ارقام انگلیسی باشد.";
    }
    data.code = code;
  }

  // — نوع پرداخت —
  if ("paymentType" in body) {
    const paymentType = str(body.paymentType, "both") || "both";
    if (!isDiscountPaymentType(paymentType)) {
      return "نوع پرداخت کد تخفیف معتبر نیست.";
    }
    data.paymentType = paymentType;
  }

  // — نوع مقدار و مقدار —
  if ("valueType" in body) {
    const valueType = str(body.valueType, "percent") || "percent";
    if (!isDiscountValueType(valueType)) {
      return "نوع مقدار تخفیف معتبر نیست.";
    }
    data.valueType = valueType;
  }

  if ("value" in body) {
    const n =
      typeof body.value === "number"
        ? body.value
        : parseInt(String(body.value), 10);
    if (!Number.isFinite(n) || n <= 0) {
      return "مقدار تخفیف باید عددی مثبت باشد.";
    }
    if (data.valueType === "percent" || body.valueType === "percent") {
      if (n > 100) return "درصد تخفیف نمی‌تواند بیش از ۱۰۰ باشد.";
    } else if (n > DISCOUNT_MAX_VALUE) {
      return "مبلغ تخفیف بیش از حد مجاز است.";
    }
    data.value = Math.round(n);
  }

  // — سقف استفاده —
  if ("maxUses" in body) {
    const n =
      typeof body.maxUses === "number"
        ? body.maxUses
        : parseInt(String(body.maxUses), 10);
    if (!Number.isFinite(n) || n < 0 || n > DISCOUNT_MAX_USES) {
      return "حداکثر استفاده باید عددی بین ۰ تا ۱۰۰٫۰۰۰ باشد.";
    }
    data.maxUses = Math.round(n);
  }

  // — تاریخ انقضا —
  if ("expiresAt" in body || "expires" in body) {
    const expires = parseExpiresAt(
      "expiresAt" in body ? body.expiresAt : body.expires
    );
    if (expires === "invalid") {
      return "تاریخ انقضا معتبر نیست.";
    }
    data.expiresAt = expires;
  }

  // — فعال/غیرفعال —
  if ("active" in body) {
    data.active = body.active === true || body.active === "true";
  }

  // — یادداشت —
  if ("note" in body) {
    const note = str(body.note);
    if (note.length > 200) return "یادداشت حداکثر ۲۰۰ نویسه است.";
    data.note = note || null;
  }

  // — بازنشانی شمارنده‌ی استفاده (اختیاری مدیر) —
  if ("usedCount" in body) {
    const n =
      typeof body.usedCount === "number"
        ? body.usedCount
        : parseInt(String(body.usedCount), 10);
    if (!Number.isFinite(n) || n < 0 || n > DISCOUNT_MAX_USES) {
      return "شمارنده‌ی استفاده معتبر نیست.";
    }
    data.usedCount = Math.round(n);
  }

  if (Object.keys(data).length === 0) {
    return "هیچ فیلد قابل ویرایشی ارسال نشده است.";
  }
  return data;
}

/* ---------------- ویدئو ---------------- */

export interface VideoInput {
  title: string;
  description: string;
  url: string;
  thumbnail: string;
  duration: string;
  views: number;
  level: string;
  sortOrder: number;
  published: boolean;
  /** شناسه‌ی لیست پخش (اختیاری) — null یعنی بدون لیست */
  playlistId: string | null;
}

export function parseVideo(body: Record<string, unknown> | null): VideoInput | string {
  if (!body) return "بدنه درخواست نامعتبر است.";
  const title = str(body.title);
  if (title.length < 2 || title.length > 160) return "عنوان ویدئو باید بین ۲ تا ۱۶۰ نویسه باشد.";

  // لیست پخش: رشته‌ی خالی یا null → بدون لیست؛ در غیر این صورت باید cuid معتبر باشد
  const rawPlaylist = body.playlistId;
  let playlistId: string | null = null;
  if (typeof rawPlaylist === "string" && rawPlaylist.trim()) {
    playlistId = rawPlaylist.trim().slice(0, 40);
  }

  return {
    title,
    description: str(body.description).slice(0, 600),
    url: str(body.url).slice(0, 500),
    thumbnail: str(body.thumbnail).slice(0, 500),
    duration: str(body.duration).slice(0, 20),
    views: int(body.views, 0),
    level: str(body.level, "مقدماتی") || "مقدماتی",
    sortOrder: int(body.sortOrder, 0),
    published: bool(body.published, true),
    playlistId,
  };
}

/* ---------------- نظر کاربر ---------------- */

export interface TestimonialInput {
  name: string;
  role: string;
  course: string;
  text: string;
  rating: number;
  theme: string;
  sortOrder: number;
  published: boolean;
}

export function parseTestimonial(body: Record<string, unknown> | null): TestimonialInput | string {
  if (!body) return "بدنه درخواست نامعتبر است.";
  const name = str(body.name);
  const text = str(body.text);
  if (name.length < 2 || name.length > 80) return "نام کاربر باید بین ۲ تا ۸۰ نویسه باشد.";
  if (text.length < 10 || text.length > 600) return "متن نظر باید بین ۱۰ تا ۶۰۰ نویسه باشد.";

  return {
    name,
    role: str(body.role).slice(0, 80),
    course: str(body.course).slice(0, 120),
    text,
    rating: Math.max(1, Math.min(int(body.rating, 5), 5)),
    theme: str(body.theme, "teal") || "teal",
    sortOrder: int(body.sortOrder, 0),
    published: bool(body.published, true),
  };
}

/* ---------------- تنظیمات سایت ---------------- */

/** فیلدهای فونت — مقدار باید کلید معتبر رجیستری src/lib/fonts.ts باشد */
const SETTING_FONT_FIELDS = [
  "sloganFont",
  "headerFont",
  "footerFont",
] as const;

const SETTING_STRING_FIELDS = [
  "siteName",
  "tagline",
  "slogan",
  "heroDescription",
  "logoUrl",
  "contactPhone",
  "contactEmail",
  "address",
  "supportHours",
  "instagramUrl",
  "telegramUrl",
  "youtubeUrl",
  "linkedinUrl",
  "footerDescription",
  // کد نماد اعتماد الکترونیکی (اینماد) — عیناً از پنل enamad.ir؛ در فوتر سایت رندر می‌شود
  "enamadCode",
  // کد نماد اعتماد زرین‌پال (لوگو تایید درگاه پرداخت، طبق مستندات رسمی زرین‌پال) — در فوتر، سمت راست اینماد
  "zarinpalCode",
  ...SETTING_FONT_FIELDS,
] as const;

const SETTING_NUMBER_FIELDS = [
  "studentsCount",
  "completedCoursesCount",
] as const;

/** فیلدهای بولی تنظیمات — فعال/غیرفعال‌سازی ماژول‌ها */
const SETTING_BOOL_FIELDS = ["pencilEditorEnabled"] as const;

export function parseSettings(
  body: Record<string, unknown> | null,
  /** کلیدهای فونت مجاز (از جدول InstalledFont) — در صورت عدم ارائه، فیلد فونت رد می‌شود */
  validFontKeys?: Set<string>
): Record<string, string | number | boolean | undefined> | string {
  if (!body) return "بدنه درخواست نامعتبر است.";

  const data: Record<string, string | number | boolean | undefined> = {};

  for (const field of SETTING_STRING_FIELDS) {
    if (field in body) {
      // سقف کدهای نماد اعتماد بلندتر است (کد HTML کامل + لینک رسمی)
      const value = str(body[field]).slice(
        0,
        field === "enamadCode" || field === "zarinpalCode" ? 2000 : 600
      );
      if (field === "siteName" && value.length < 2) return "نام سایت باید حداقل ۲ نویسه باشد.";
      // فونت‌ها باید کلید فونت نصب‌شده باشند
      if ((SETTING_FONT_FIELDS as readonly string[]).includes(field)) {
        if (!validFontKeys || !validFontKeys.has(value)) {
          return "کلید فونت انتخاب‌شده معتبر نیست یا فونت نصب نشده است.";
        }
      }
      // لوگو/تصویر آدرس — فقط مسیر محلی، http(s) یا data:image (بند ۹)
      if (field === "logoUrl" && !isSafePublicAssetUrl(value)) {
        return "آدرس لوگو معتبر نیست — باید مسیر محلی یا http(s) باشد.";
      }
      // کد نمادهای اعتماد: پاکسازی لیست‌سفید (بند ۹) — تَگ/ویژگی غیرمجاز،
      // on*، javascript: و طرح‌های غیرHTTPS حذف می‌شوند؛ اسکریپت «رسمی» اینماد/
      // زرین‌پال (src HTTPS از دامنه‌ی رسمی همان سرویس) حفظ می‌شود تا نماد
      // اعتماد همچنان کار کند. سپس ارجاع به دامنه‌ی رسمی لازم است (قاعده‌ی
      // پیشین حفظ شده — کد بی‌ارجاع رد می‌شود).
      if ((field === "enamadCode" || field === "zarinpalCode") && value) {
        const sanitized = sanitizeTrustHtml(value);
        if (field === "enamadCode" && !/enamad\.ir/i.test(sanitized)) {
          return "کد اینماد معتبر نیست — باید به trustseal.enamad.ir اشاره کند.";
        }
        if (field === "zarinpalCode" && !/zarinpal/i.test(sanitized)) {
          return "کد زرین‌پال معتبر نیست — باید به zarinpal.com اشاره کند.";
        }
        data[field] = sanitized;
        continue;
      }
      data[field] = value;
    }
  }

  for (const field of SETTING_NUMBER_FIELDS) {
    if (field in body) data[field] = int(body[field], 0);
  }

  for (const field of SETTING_BOOL_FIELDS) {
    if (field in body) data[field] = bool(body[field], true);
  }

  if ("rating" in body) data.rating = float(body.rating, 0) || 0;

  if (Object.keys(data).length === 0) return "هیچ فیلد قابل ویرایشی ارسال نشده است.";
  return data;
}
