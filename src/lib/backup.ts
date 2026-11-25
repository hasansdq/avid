import { db } from "@/lib/db";
import { faDigits } from "@/lib/fa";
import {
  sanitizeTrustHtml,
  isSafePublicAssetUrl,
} from "@/lib/html-sanitize";

/**
 * بکاپ و بازیابی داده‌های «آوید» — لایه‌ی منطقی (بدون فایل).
 *
 * ساختار فایل بکاپ (JSON):
 *  {
 *    format: "avid-backup",
 *    version: 3,
 *    exportedAt: "<ISO>",
 *    section: "courses" | "videos" | ... | "full"   (اختیاری — نسخه‌ی ۳)
 *    tables: { users: [...], courses: [...], ... }
 *  }
 *
 * دامنه:
 *  • شامل همه‌ی داده‌های محتوایی سایت است: تنظیمات، متن‌های ویرایشگر
 *    ظاهری مدادی (SiteText — متن/رنگ/فونت/اندازه/مخفی‌بودن جایگاه‌ها)،
 *    دوره‌ها و گروه‌ها و قالب اقساط، ویدئوها و لیست‌های پخش، آزمون‌ها و
 *    سؤال‌ها و پاسخ‌های کاربران، نمونه‌سؤال‌ها (دسته‌ها و فایل‌ها)،
 *    گواهی‌نامه‌ها، کاربران و ثبت‌نام‌ها و اقساط و حضور و غیاب، کدهای
 *    تخفیف، فونت‌ها، لینک‌های هدر/فوتر، نظرات، تنظیمات پیامک/پرداخت/چت،
 *    گزارش پیامک‌ها و گفتگوهای چت — و همچینین کلاس‌های حضوری و اعضایشان،
 *    کلاس‌های آنلاین (استریم) با دعوت‌ها و حضور شرکت‌کنندگان،
 *    واریزی‌های درآمد استادها (TeacherPayout — همراه شماره شبا روی رکورد
 *    کاربر استاد)، و تنظیمات نمایش صفحه‌ی اول (HomepageSection) و
 *    انیمیشن‌های هیرو (HeroAnimation).
 *  • «بخش‌ها» (نسخه‌ی ۳): بکاپ/بازیابی می‌تواند فقط یک بخش باشد —
 *    دوره‌ها، ویدئوها، کاربران، نمونه‌سؤال‌ها، گواهی‌نامه‌ها، صفحات و
 *    ظاهر سایت، یا کل سایت. فایل‌های قدیمیِ بدون نشانگر بخش همچنان
 *    معتبرند (بخش = هرچه در فایل هست).
 *  • خارج از بکاپ (عمداً): حساب‌ها و نشست‌های مدیر (AdminUser/AdminSession)،
 *    نشست‌های کاربران (UserSession) و کدهای یک‌بارمصرف (OtpCode).
 *    نتیجه: مدیرِ در حال بازیابی از پنل خارج نمی‌شود و رمز عبور مدیر
 *    به فایل بکاپ راه پیدا نمی‌کند.
 *  • فایل‌های آپلودی (تصویر/ویدئو/فونت) در ZIP بکاپ کامل قرار می‌گیرند —
 *    این لایه فقط رکوردهای دیتابیس را مدیریت می‌کند (مسیر فایل‌ها در
 *    روت API انجام می‌شود).
 *
 * بازیابی، داده‌های فعلیِ «جدول‌های موجود در فایل» را «جایگزین» می‌کند —
 * داخل یک تراکنش واحد: یا همه‌چیز برمی‌گردد یا هیچ‌چیز تغییر نمی‌کند.
 * جدول‌هایی که در فایل بکاپ «نباشند» دست‌نخورده می‌مانند (بکاپ‌های قدیمیِ
 * فاقد بخش آزمون‌ها/نمونه‌سؤال‌ها/گواهی‌نامه‌ها، داده‌ی فعلی این بخش‌ها را
 * پاک نمی‌کنند) — مگر آنکه «حذف رکوردهای والد» به‌صورت آبشاری آن‌ها را
 * تهدید کند؛ آن حالت پیش از هر تغییری بررسی و بدون تأیید صریح رد می‌شود.
 *
 * پیش از هر تغییری دو بررسی انجام می‌شود:
 *  ۱) اعتبارسنجی کلیدهای خارجی رکوردهای فایل (به والد‌های «در فایل» یا
 *     «در سایت فعلی») — خطای BackupForeignKeyError بدون امکان دور زدن.
 *  ۲) بستار آبشاری روی گراف روابط اسکیما — جداولی که جایگزین نمی‌شوند
 *     ولی با حذف والد‌ها یا پاک می‌شوند (cascade) یا پیوندشان قطع می‌شود
 *     (setnull)؛ با تأیید صریح (force) قابل عبور است.
 */

export const BACKUP_FORMAT = "avid-backup";
export const BACKUP_VERSION = 3;

/** کلیدهای prisma-ی جدول‌های بکاپ */
export type BackupTableKey =
  | "siteSettings"
  | "siteText"
  | "chatSettings"
  | "smsSettings"
  | "paymentSettings"
  | "installedFont"
  | "navLink"
  | "testimonial"
  | "discountCode"
  | "course"
  | "courseGroup"
  | "courseInstallment"
  | "playlist"
  | "video"
  | "exam"
  | "examQuestion"
  | "sampleQuestionCategory"
  | "sampleQuestion"
  | "user"
  | "teacherPayout"
  | "classRoom"
  | "classMembership"
  | "liveStream"
  | "streamInvitation"
  | "streamParticipant"
  | "examAttempt"
  | "certificate"
  | "enrollment"
  | "installment"
  | "installmentPayment"
  | "attendanceSession"
  | "attendanceRecord"
  | "smsLog"
  | "chatConversation"
  | "chatMessage"
  | "chatWelcomeLog"
  | "uploadedFile"
  | "homepageSection"
  | "heroAnimation";

interface TableSpec {
  key: BackupTableKey;
  /** برچسب فارسی برای نمایش در پنل و گزارش بازیابی */
  label: string;
}

/**
 * ترتیب «ایجاد» (والد → فرزند) — ترتیب حذف دقیقاً معکوس همین است
 * (فرزند → والد) تا قیدهای کلید خارجی هرگز نقض نشوند.
 */
const CREATE_ORDER: TableSpec[] = [
  { key: "siteSettings", label: "تنظیمات سایت" },
  { key: "siteText", label: "متن‌های ویرایشگر مدادی" },
  { key: "chatSettings", label: "تنظیمات چت" },
  { key: "smsSettings", label: "تنظیمات پیامک" },
  { key: "paymentSettings", label: "تنظیمات پرداخت" },
  { key: "installedFont", label: "فونت‌ها" },
  { key: "navLink", label: "لینک‌های هدر و فوتر" },
  { key: "testimonial", label: "نظرات کاربران" },
  { key: "discountCode", label: "کدهای تخفیف" },
  // کاربران — والدِ مشترکِ چند جدول پایین‌دستی: دوره‌های استاد
  // (Course.teacherId)، واریزی‌های درآمد استاد، کلاس‌ها/عضویت‌ها، آزمون‌ها
  // و پاسخ‌ها و گواهی‌نامه‌ها و… ؛ بنابراین باید پیش از همه‌ی آن‌ها درج
  // شود (در غیر این صورت درج دوره‌ای با استاد، پیش از درج خودِ استاد به
  // خطای کلید خارجی می‌خورد).
  { key: "user", label: "کاربران" },
  // واریزی‌های درآمد استاد (پرداختی مدیر به استاد) — فرزندِ کاربرِ استاد
  // با حذف آبشاری (Cascade)؛ بعد از کاربر و پیش از دوره‌ها. جایگزینی
  // «کاربران» بدون این جدول (بکاپ قدیمی) واریزی‌ها را آبشاری پاک می‌کند —
  // پیش از حذف کاربران به‌عنوان «خطر از دست رفتن داده» شناسایی و گزارش
  // می‌شود.
  { key: "teacherPayout", label: "واریزی‌های درآمد استاد" },
  // دوره — ممکن است استاد داشته (teacherId → User که بالاتر درج شد)
  { key: "course", label: "دوره‌ها" },
  { key: "courseGroup", label: "گروه‌های دوره" },
  { key: "courseInstallment", label: "قالب اقساط دوره" },
  { key: "playlist", label: "لیست‌های پخش" },
  { key: "video", label: "ویدئوها" },
  { key: "sampleQuestionCategory", label: "دسته‌های نمونه‌سؤال" },
  { key: "sampleQuestion", label: "نمونه‌سؤال‌ها" },
  // کلاس حضوری — استادِ کلاس (teacherId) والدش کاربر است؛ آزمون و
  // دعوت استریم والدش همین جدول‌اند → حتماً قبل از آن‌ها.
  { key: "classRoom", label: "کلاس‌های حضوری" },
  // عضویت کلاس — فرزندِ کاربر و کلاس
  { key: "classMembership", label: "اعضای کلاس‌ها" },
  // آزمون — والد: Course (بالاتر) و ClassRoom (این‌جا بالاتر) → بعد از هر دو
  { key: "exam", label: "آزمون‌ها" },
  { key: "examQuestion", label: "سؤال‌های آزمون" },
  // پاسخ‌های آزمون: والد = Exam و User — بعد از هر دو
  { key: "examAttempt", label: "پاسخ‌های کاربران به آزمون‌ها" },
  // گواهی‌نامه: والد = User و Course — بعد از هر دو
  { key: "certificate", label: "گواهی‌نامه‌ها" },
  // کلاس آنلاین (استریم) — میزبان (hostId) والدش کاربر است
  { key: "liveStream", label: "کلاس‌های آنلاین (استریم)" },
  // دعوت استریم — فرزندِ استریم/دوره/کلاس؛ بعد از هر سه
  { key: "streamInvitation", label: "دعوت‌های کلاس آنلاین" },
  // حضور شرکت‌کنندگان استریم — فرزندِ استریم و کاربر
  { key: "streamParticipant", label: "حضور شرکت‌کنندگان استریم" },
  { key: "enrollment", label: "ثبت‌نام‌ها" },
  { key: "installment", label: "اقساط" },
  // تلاش‌های پرداخت آنلاینِ اقساط از پنل کاربر — فرزند ثبت‌نام؛ بعد از اقساط
  { key: "installmentPayment", label: "تلاش‌های پرداخت اقساط" },
  { key: "attendanceSession", label: "جلسات حضور و غیاب" },
  { key: "attendanceRecord", label: "ردیف‌های حضور و غیاب" },
  { key: "smsLog", label: "گزارش پیامک‌ها" },
  { key: "chatConversation", label: "گفتگوهای چت" },
  { key: "chatMessage", label: "پیام‌های چت" },
  { key: "chatWelcomeLog", label: "لاگ خوش‌آمدگویی چت" },
  { key: "uploadedFile", label: "گالری فایل‌ها" },
  // نمایش/مخفی‌سازی سکشن‌های صفحه‌ی اول و انیمیشن‌های هیرو — بدون والد
  { key: "homepageSection", label: "نمایش سکشن‌های صفحه‌ی اول" },
  { key: "heroAnimation", label: "انیمیشن‌های هیرو" },
];

/** کلید اصلی هر جدول — id؛ SiteText/HomepageSection/HeroAnimation با key و ChatWelcomeLog با ip */
const PRIMARY_KEYS: Record<BackupTableKey, string> = {
  siteText: "key",
  homepageSection: "key",
  heroAnimation: "key",
  chatWelcomeLog: "ip",
} as Record<BackupTableKey, string>;
function primaryKeyOf(key: BackupTableKey): string {
  return PRIMARY_KEYS[key] ?? "id";
}

/** برچسب فارسی جدول (از CREATE_ORDER) */
function labelOf(key: BackupTableKey): string {
  return CREATE_ORDER.find((t) => t.key === key)?.label ?? key;
}

/** ترتیب حذف = معکوس ترتیب ایجاد + پاک‌سازی نشست کاربران/کدهای OTP */
const DELETE_ORDER: string[] = [
  ...CREATE_ORDER.map((t) => t.key).reverse(),
  "userSession",
  "otpCode",
];

/* ------------------------------------------------------------------ */
/*                              بخش‌های بکاپ                            */
/* ------------------------------------------------------------------ */

/** کلید بخش‌های بکاپ — «full» یعنی کل سایت */
export type BackupSectionKey =
  | "courses"
  | "videos"
  | "users"
  | "sampleQuestions"
  | "certificates"
  | "pages"
  | "full";

export interface BackupSectionSpec {
  key: BackupSectionKey;
  /** برچسب فارسی بخش برای نمایش و پیام‌ها */
  label: string;
  /** جدول‌های این بخش — هر بخش «خودکفا» است (والدهای خارج از بخش ندارد) */
  tables: BackupTableKey[];
}

/**
 * رجیستری بخش‌های بکاپ — هر بخش فقط جدول‌هایی را می‌گیرد که کلید خارجی‌شان
 * داخل همان بخش حل می‌شود؛ جداولی مثل ثبت‌نام/اقساط/حضور و غیاب/چت که به
 * چند بخش گره خورده‌اند فقط در «کل سایت» می‌آیند.
 */
export const BACKUP_SECTIONS: BackupSectionSpec[] = [
  {
    key: "courses",
    label: "دوره‌ها",
    tables: ["course", "courseGroup", "courseInstallment", "exam", "examQuestion"],
  },
  {
    key: "videos",
    label: "ویدئوها",
    tables: ["playlist", "video"],
  },
  {
    key: "users",
    label: "کاربران",
    // واریزی‌های درآمد استاد هم فرزندِ کاربرند — با خودِ کاربران
    // بکاپ/بازیابی می‌شوند تا این بخش خودکفا بماند (بازیابی «فقط
    // کاربران» از بکاپ کامل، واریزی‌ها را هم برمی‌گرداند و پاک نمی‌کند).
    tables: ["user", "teacherPayout"],
  },
  {
    key: "sampleQuestions",
    label: "نمونه‌سؤال‌ها",
    tables: ["sampleQuestionCategory", "sampleQuestion"],
  },
  {
    key: "certificates",
    label: "گواهی‌نامه‌ها",
    tables: ["certificate"],
  },
  {
    key: "pages",
    label: "صفحات و ظاهر سایت",
    tables: [
      "siteSettings",
      "siteText",
      "navLink",
      "installedFont",
      "testimonial",
      "homepageSection",
      "heroAnimation",
    ],
  },
  {
    key: "full",
    label: "کل سایت",
    tables: CREATE_ORDER.map((t) => t.key),
  },
];

/** مجموعه‌ی کلیدهای معتبر بخش — برای اعتبارسنجی سریع ورودی‌های API */
export const BACKUP_SECTION_KEYS: ReadonlySet<string> = new Set(
  BACKUP_SECTIONS.map((s) => s.key)
);

/** یافتن تعریف بخش با کلید — خطای فارسی اگر ناشناخته باشد */
export function getBackupSection(key: string): BackupSectionSpec {
  const spec = BACKUP_SECTIONS.find((s) => s.key === key);
  if (!spec) {
    throw new Error(`بخش ناشناخته در فایل بکاپ: «${key}».`);
  }
  return spec;
}

/* ------------------------------------------------------------------ */
/*                    گراف روابط (کلید خارجی + onDelete)                */
/* ------------------------------------------------------------------ */

/**
 * یال‌های روابط والد→فرزند از اسکیما (کاربرِ نشست/مدیر عمداً حذف —
 * نشست کاربران همیشه پاک می‌شود و ربطی به بستار آبشاری ندارد).
 * هم مبنای اعتبارسنجی کلید خارجی و هم مبنای محاسبه‌ی «در معرض خطر».
 */
interface RelationEdge {
  parent: BackupTableKey;
  child: BackupTableKey;
  /** فیلد کلید خارجی روی فرزند */
  field: string;
  /** رفتار حذف والد روی فرزند */
  action: "cascade" | "setnull";
  /** آیا ستون کلید خارجی nullable است (null یعنی بی‌ارتباط) */
  nullable: boolean;
}

const RELATIONS: RelationEdge[] = [
  // — دوره‌ی استاد — Course.teacherId → User (SetNull): اعتبارسنجی مرجعِ
  // استاد در رکوردهای دوره + شناسایی «قطع پیوند دوره‌ها» هنگام جایگزینی
  // کاربران (بکاپ قدیمیِ فاقد کاربران با دوره‌های دارای استاد).
  { parent: "user", child: "course", field: "teacherId", action: "setnull", nullable: true },
  { parent: "course", child: "courseGroup", field: "courseId", action: "cascade", nullable: false },
  { parent: "course", child: "courseInstallment", field: "courseId", action: "cascade", nullable: false },
  { parent: "course", child: "attendanceSession", field: "courseId", action: "cascade", nullable: false },
  { parent: "attendanceSession", child: "attendanceRecord", field: "sessionId", action: "cascade", nullable: false },
  { parent: "enrollment", child: "attendanceRecord", field: "enrollmentId", action: "cascade", nullable: false },
  { parent: "course", child: "exam", field: "courseId", action: "cascade", nullable: true },
  { parent: "classRoom", child: "exam", field: "classId", action: "setnull", nullable: true },
  { parent: "exam", child: "examQuestion", field: "examId", action: "cascade", nullable: false },
  { parent: "exam", child: "examAttempt", field: "examId", action: "cascade", nullable: false },
  { parent: "user", child: "examAttempt", field: "userId", action: "cascade", nullable: false },
  { parent: "user", child: "certificate", field: "userId", action: "cascade", nullable: false },
  { parent: "course", child: "certificate", field: "courseId", action: "setnull", nullable: true },
  { parent: "user", child: "enrollment", field: "userId", action: "setnull", nullable: true },
  { parent: "courseGroup", child: "enrollment", field: "groupId", action: "setnull", nullable: true },
  { parent: "enrollment", child: "installment", field: "enrollmentId", action: "cascade", nullable: false },
  { parent: "enrollment", child: "installmentPayment", field: "enrollmentId", action: "cascade", nullable: false },
  { parent: "sampleQuestionCategory", child: "sampleQuestion", field: "categoryId", action: "setnull", nullable: true },
  { parent: "playlist", child: "video", field: "playlistId", action: "setnull", nullable: true },
  { parent: "chatConversation", child: "chatMessage", field: "conversationId", action: "cascade", nullable: false },
  // — واریزی‌های درآمد استاد — حذف کاربرِ استاد، واریزی‌هایش را آبشاری
  // پاک می‌کند؛ این یال همان چیزی است که «خطر حذف آبشاری واریزی‌های
  // استاد» را هنگام بازیابی بکاپ‌های قدیمی (فاقد این جدول) پیش از حذف
  // کاربران شناسایی می‌کند.
  { parent: "user", child: "teacherPayout", field: "teacherId", action: "cascade", nullable: false },
  // — کلاس‌های حضوری —
  { parent: "user", child: "classRoom", field: "teacherId", action: "setnull", nullable: true },
  { parent: "user", child: "classMembership", field: "userId", action: "cascade", nullable: false },
  { parent: "classRoom", child: "classMembership", field: "classId", action: "cascade", nullable: false },
  // — کلاس آنلاین (استریم) —
  { parent: "user", child: "liveStream", field: "hostId", action: "setnull", nullable: true },
  { parent: "liveStream", child: "streamInvitation", field: "streamId", action: "cascade", nullable: false },
  { parent: "course", child: "streamInvitation", field: "courseId", action: "cascade", nullable: true },
  { parent: "classRoom", child: "streamInvitation", field: "classId", action: "cascade", nullable: true },
  { parent: "liveStream", child: "streamParticipant", field: "streamId", action: "cascade", nullable: false },
  { parent: "user", child: "streamParticipant", field: "userId", action: "cascade", nullable: false },
];

/** مدل‌های prisma به‌صورت امن-نوع برای فراخوانی پویا در تراکنش */
interface BatchModel {
  deleteMany(args?: { where?: unknown }): Promise<unknown>;
  createMany(args: { data: unknown[] }): Promise<unknown>;
  count(args?: { where?: unknown }): Promise<number>;
}

function modelOf(tx: unknown, key: string): BatchModel {
  const model = (tx as Record<string, unknown>)[key] as BatchModel | undefined;
  if (!model) throw new Error(`مدل دیتابیس ناشناخته: ${key}`);
  return model;
}

/** خواندن آرایه‌ی idهای یک جدول از دیتابیس فعلی (برای والدِ بیرون از فایل) */
async function findPrimaryKeysOf(
  key: BackupTableKey
): Promise<Record<string, unknown>[]> {
  const model = modelOf(db, key) as unknown as {
    findMany(args?: { select?: unknown }): Promise<Record<string, unknown>[]>;
  };
  return model.findMany({ select: { [primaryKeyOf(key)]: true } });
}

/* ------------------------------------------------------------------ */
/*                              ساخت بکاپ                              */
/* ------------------------------------------------------------------ */

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  /** نشانگر بخش فایل (نسخه‌ی ۳ به بعد) — غایب در فایل‌های قدیمی */
  section?: BackupSectionKey;
  tables: Partial<Record<BackupTableKey, Record<string, unknown>[]>>;
}

/**
 * خواندن جدول‌های بکاپ — بدون بخش (یا "full") کل سایت؛
 * با بخش مشخص، فقط جدول‌های همان بخش (حتی اگر خالی باشند، تا بازیابی
 * بخش، آن بخش را «کامل» جایگزین کند).
 */
export async function buildBackupPayload(
  section?: BackupSectionKey
): Promise<BackupPayload> {
  const spec = getBackupSection(section ?? "full");
  const include = new Set<BackupTableKey>(spec.tables);
  const tables: BackupPayload["tables"] = {};
  for (const { key } of CREATE_ORDER) {
    if (!include.has(key)) continue;
    const model = modelOf(db, key);
    // findMany بدون فیلتر — پر کردن جدول با findMany مستقیم مدل
    const rows = await (
      model as unknown as {
        findMany(args?: { orderBy?: unknown }): Promise<Record<string, unknown>[]>;
      }
    ).findMany();
    tables[key] = rows;
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    section: spec.key,
    tables,
  };
}

/** خلاصه‌ی آماری برای نمایش در پنل مدیریت */
export async function backupCounts(): Promise<
  Partial<Record<BackupTableKey, number>>
> {
  const counts: Partial<Record<BackupTableKey, number>> = {};
  for (const { key } of CREATE_ORDER) {
    const model = modelOf(db, key);
    counts[key] = Number(await model.count());
  }
  return counts;
}

/* ------------------------------------------------------------------ */
/*                             اعتبارسنجی                              */
/* ------------------------------------------------------------------ */

/**
 * اعتبارسنجی ساختار فایل بکاپ — پیش از هرگونه تغییر روی دیسک/دیتابیس
 * صدا زده می‌شود. هر خطا پیام فارسی برای نمایش به مدیر برمی‌گرداند.
 */
export function validateBackupPayload(raw: unknown): BackupPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("ساختار فایل بکاپ معتبر نیست.");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.format !== BACKUP_FORMAT) {
    throw new Error(
      "این فایل یک بکاپ «آوید» نیست (شناسه‌ی ساختار ناشناخته)."
    );
  }
  const version = Number(obj.version);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("نسخه‌ی فایل بکاپ نامعتبر است.");
  }
  if (version > BACKUP_VERSION) {
    throw new Error(
      `این بکاپ با نسخه‌ی جدیدتری ساخته شده است (${version} > ${BACKUP_VERSION}) و در این نسخه‌ی سایت قابل بازیابی نیست.`
    );
  }
  const tablesRaw = obj.tables;
  if (!tablesRaw || typeof tablesRaw !== "object" || Array.isArray(tablesRaw)) {
    throw new Error("بخش جدول‌ها در فایل بکاپ یافت نشد.");
  }

  // نشانگر بخش (اختیاری) — اگر باشد باید کلید شناخته‌شده باشد
  let section: BackupSectionKey | undefined;
  if (obj.section !== undefined && obj.section !== null) {
    if (
      typeof obj.section !== "string" ||
      !BACKUP_SECTION_KEYS.has(obj.section)
    ) {
      throw new Error("بخش ناشناخته در فایل بکاپ.");
    }
    section = obj.section as BackupSectionKey;
  }

  const known = new Set<string>(CREATE_ORDER.map((t) => t.key));
  const tables: BackupPayload["tables"] = {};
  for (const [key, rows] of Object.entries(
    tablesRaw as Record<string, unknown>
  )) {
    if (!known.has(key)) {
      throw new Error(`جدول ناشناخته در فایل بکاپ: «${key}».`);
    }
    if (!Array.isArray(rows)) {
      throw new Error(`داده‌های جدول «${key}» در فایل بکاپ خراب است.`);
    }
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new Error(`یک ردیف نامعتبر در جدول «${key}» وجود دارد.`);
      }
      const pk = primaryKeyOf(key as BackupTableKey);
      const pkValue = (row as Record<string, unknown>)[pk];
      if (typeof pkValue !== "string" || !pkValue) {
        throw new Error(
          `ردیف‌های جدول «${key}» فاقد کلید اصلی (${pk}) هستند — فایل بکاپ خراب است.`
        );
      }
    }
    tables[key as BackupTableKey] = rows as Record<string, unknown>[];
  }
  return {
    format: BACKUP_FORMAT,
    version,
    exportedAt:
      typeof obj.exportedAt === "string" ? obj.exportedAt : new Date(0).toISOString(),
    section,
    tables,
  };
}

/* ------------------------------------------------------------------ */
/*                          بازیابی — خطاها                            */
/* ------------------------------------------------------------------ */

export interface ImportSummary {
  /** تعداد رکورد بازیابی‌شده به‌ازای هر جدول (فقط جدول‌های موجود در فایل) */
  restored: Partial<Record<BackupTableKey, number>>;
  /** برچسب فارسی جدول برای پیام موفقیت */
  labels: Partial<Record<BackupTableKey, string>>;
  /** بخشی که عملاً بازیابی شد (بخش انتخابی یا نشانگر خود فایل) */
  section?: BackupSectionKey;
}

/** یک مورد «از دست رفتن داده‌ی فعلی» در صورت بازیابی بکاپ قدیمی */
export interface DataLossItem {
  /** کلید جدولی که داده‌ی فعلی‌اش در خطر است */
  key: string;
  /** برچسب فارسی همان بخش */
  label: string;
  /** شمار رکوردهای فعلی در خطر */
  currentCount: number;
  /** کلیدهای جدول‌های والدی که حذف می‌شوند */
  parentKeys: string[];
  /** آیا حذف والد رکوردها را «پاک» می‌کند (cascade) یا فقط پیوند را قطع (setnull) */
  mode: "cascade" | "setnull";
}

/**
 * خطای «بازیابی نیازمند تأیید» — بکاپ قدیمی/بخشی، داده‌ی فعلیِ بخش‌های
 * دیگر را حذف/آسیب می‌زند؛ مدیر باید با force=1 صریحاً تأیید کند.
 */
export class BackupDataLossError extends Error {
  readonly losses: DataLossItem[];
  constructor(losses: DataLossItem[]) {
    super(
      "بازیابی این بکاپ، داده‌های فعلی برخی بخش‌ها را پاک می‌کند؛ برای ادامه تأیید صریح لازم است."
    );
    this.name = "BackupDataLossError";
    this.losses = losses;
  }
}

/** یک مورد کلید خارجیِ بی‌مرجع در رکوردهای فایل بکاپ */
export interface BackupForeignKeyIssue {
  /** جدولی که در فایل بازیابی می‌شود */
  table: string;
  /** فیلد کلید خارجی روی همان جدول */
  field: string;
  /** جدول والدِ مورد اشاره */
  referenced: string;
  /** شمار رکوردهای بی‌مرجع */
  missingCount: number;
  /** کل رکوردهای همان جدول در فایل */
  rowCount: number;
  /** منبع مقایسه: والد در فایل / والد در سایت / والدِ حذف‌شده با این بازیابی */
  source: "file" | "db" | "wiped";
}

/** عبارت‌های فارسی جدول‌های فرزند برای پیام خطای کلید خارجی */
const FK_CHILD_SHORT: Record<string, string> = {
  courseGroup: "گروه دوره",
  courseInstallment: "قالب اقساط",
  attendanceSession: "جلسه حضور و غیاب",
  attendanceRecord: "ردیف حضور و غیاب",
  exam: "آزمون",
  examQuestion: "سؤال آزمون",
  examAttempt: "پاسخ آزمون",
  certificate: "گواهی‌نامه",
  enrollment: "ثبت‌نام",
  installment: "قسط",
  installmentPayment: "تلاش پرداخت",
  sampleQuestion: "نمونه‌سؤال",
  video: "ویدئو",
  chatMessage: "پیام چت",
  classRoom: "کلاس حضوری",
  classMembership: "عضویت کلاس",
  liveStream: "کلاس آنلاین",
  streamInvitation: "دعوت استریم",
  streamParticipant: "حضور شرکت‌کننده",
  teacherPayout: "واریزی استاد",
};

/** چیزی که والدِ مورد اشاره نامیده می‌شود + بکاپ پیشنهادی برای رفع */
const FK_REFERENCED_PHRASES: Record<
  string,
  { thing: string; backupOf: string }
> = {
  user: { thing: "کاربران", backupOf: "کاربران" },
  course: { thing: "دوره‌ها", backupOf: "دوره‌ها" },
  courseGroup: { thing: "گروه‌های دوره", backupOf: "دوره‌ها" },
  exam: { thing: "آزمون‌ها", backupOf: "دوره‌ها" },
  attendanceSession: { thing: "جلسات حضور و غیاب", backupOf: "کل سایت" },
  enrollment: { thing: "ثبت‌نام‌ها", backupOf: "کل سایت" },
  playlist: { thing: "لیست‌های پخش", backupOf: "ویدئوها" },
  sampleQuestionCategory: { thing: "دسته‌های نمونه‌سؤال", backupOf: "نمونه‌سؤال‌ها" },
  chatConversation: { thing: "گفتگوهای چت", backupOf: "کل سایت" },
  classRoom: { thing: "کلاس‌های حضوری", backupOf: "کل سایت" },
  liveStream: { thing: "کلاس‌های آنلاین", backupOf: "کل سایت" },
};

function buildForeignKeyMessage(details: BackupForeignKeyIssue[]): string {
  const lines = details.map((d) => {
    const child = FK_CHILD_SHORT[d.table] ?? labelOf(d.table as BackupTableKey);
    const phrase =
      FK_REFERENCED_PHRASES[d.referenced] ?? {
        thing: labelOf(d.referenced as BackupTableKey),
        backupOf: "کل سایت",
      };
    const count =
      d.missingCount === d.rowCount
        ? `${faDigits(d.missingCount)} ${child}`
        : `${faDigits(d.missingCount)} از ${faDigits(d.rowCount)} ${child}`;
    if (d.source === "wiped") {
      return `${count} به ${phrase.thing} اشاره می‌کنند که در فایل بکاپ نیست و با این بازیابی از سایت هم حذف می‌شود — برای حفظ این داده‌ها، ابتدا بکاپ «${phrase.backupOf}» را بازیابی کنید.`;
    }
    return `${count} به ${phrase.thing} اشاره می‌کنند که در فایل/سایت موجود نیستند — ابتدا بکاپ «${phrase.backupOf}» را بازیابی کنید.`;
  });
  return "ارتباط داده‌ها در فایل بکاپ ناقص است — بازیابی انجام نشد:\n" + lines.join("\n");
}

/**
 * خطای «کلید خارجی بی‌مرجع» — رکوردهای فایل به والد‌هایی اشاره می‌کنند
 * که نه در فایل‌اند و نه (پس از بازیابی) در سایت. قابل دور زدن نیست؛
 * باید ابتدا بکاپ والد مربوطه بازیابی شود.
 */
export class BackupForeignKeyError extends Error {
  readonly details: BackupForeignKeyIssue[];
  constructor(details: BackupForeignKeyIssue[]) {
    super(buildForeignKeyMessage(details));
    this.name = "BackupForeignKeyError";
    this.details = details;
  }
}

/* ------------------------------------------------------------------ */
/*                     بستار آبشاری روی گراف روابط                     */
/* ------------------------------------------------------------------ */

interface RiskInfo {
  /** آیا از مسیری، لبه‌ی cascade دیده شده (رکوردها پاک می‌شوند) */
  hasCascade: boolean;
  /** جدول‌های والدِ «جایگزین‌شده» که به این خطر منتهی می‌شوند */
  roots: Set<BackupTableKey>;
  /** فیلدهای کلید خارجی تهدیدشده → nullable بودن ستون (برای شمارش دقیق) */
  fields: Map<string, boolean>;
}

interface CascadeRisks {
  /** جداولی که همه‌ی رکوردهایشان حذف می‌شود: جایگزین‌شده + آبشاری */
  deleted: Set<BackupTableKey>;
  /** جداولِ در معرض خطر که خودشان جایگزین نمی‌شوند */
  atRisk: Map<BackupTableKey, RiskInfo>;
}

/**
 * محاسبه‌ی بستار آبشاری: از جدول‌های «جایگزین‌شده» شروع، از هر یالِ
 * cascade به فرزند حرکت (فرزند هم حذف می‌شود و خودش هم تهدید می‌کند)؛
 * یال setnull فقط پیوند را قطع می‌کند و انتشار ندارد. ریشه‌ی هر جدولِ
 * در معرض خطر، نزدیک‌ترین والدهای «جایگزین‌شده» در زنجیره است.
 *
 *     course ──cascade──▶ attendanceSession ──cascade──▶ attendanceRecord
 *     enrollment ──cascade──▶ attendanceRecord
 *     user ──setnull──▶ enrollment (رکورد می‌ماند، پیوند کاربر قطع)
 *
 * دو گذر برای رسیدن به نقطه‌ی تثبیتِ ریشه‌ها (گراف DAG است).
 */
function computeCascadeRisks(
  restoreSet: Set<BackupTableKey>
): CascadeRisks {
  const deleted = new Set<BackupTableKey>(restoreSet);
  const atRisk = new Map<BackupTableKey, RiskInfo>();

  const propagate = (requeueAll: boolean): void => {
    const queue: BackupTableKey[] = [...restoreSet];
    while (queue.length > 0) {
      const parent = queue.shift()!;
      const roots = restoreSet.has(parent)
        ? [parent]
        : [...(atRisk.get(parent)?.roots ?? [])];
      for (const edge of RELATIONS) {
        if (edge.parent !== parent) continue;
        // خودِ فرزند جایگزین می‌شود — بخشی از بازیابی است، نه «خطر»
        if (restoreSet.has(edge.child)) continue;
        let info = atRisk.get(edge.child);
        if (!info) {
          info = { hasCascade: false, roots: new Set(), fields: new Map() };
          atRisk.set(edge.child, info);
        }
        for (const r of roots) info.roots.add(r);
        info.fields.set(edge.field, edge.nullable);
        if (edge.action === "cascade") {
          info.hasCascade = true;
          if (requeueAll || !deleted.has(edge.child)) {
            deleted.add(edge.child);
            queue.push(edge.child);
          }
        }
      }
    }
  };

  propagate(false);
  propagate(true);
  return { deleted, atRisk };
}

/**
 * تبدیل بستار آبشاری به فهرست «از دست رفتن داده» — فقط جدول‌هایی که
 * الان رکوردِ در خطر (فیلد تهدیدشده غیر null) دارند. userSession/otpCode
 * عمداً خارج‌اند (نشست کاربران همیشه در بازیابی پاک می‌شود).
 */
async function materializeDataLosses(
  risks: CascadeRisks
): Promise<DataLossItem[]> {
  const losses: DataLossItem[] = [];
  for (const { key, label } of CREATE_ORDER) {
    const info = risks.atRisk.get(key);
    if (!info) continue;
    let currentCount = 0;
    try {
      // فقط رکوردهایی که واقعاً آسیب می‌بینند: فیلد تهدیدشده غیر null
      // (cascade → رکورد پاک می‌شود؛ setnull → پیوندش قطع).
      // نکته: فیلتر «not: null» روی ستون‌های «اجباری» در prisma مجاز نیست —
      // فیلد اجباری همیشه مقدار دارد، پس همه‌ی ردیف‌ها در خطرند.
      const fields = [...info.fields.entries()]; // [فیلد، nullable]
      const hasRequired = fields.some(([, nullable]) => !nullable);
      if (hasRequired) {
        currentCount = Number(await modelOf(db, key).count());
      } else {
        const nullableFields = fields.map(([f]) => f);
        const where =
          nullableFields.length === 1
            ? { [nullableFields[0]]: { not: null } }
            : { OR: nullableFields.map((f) => ({ [f]: { not: null } })) };
        currentCount = Number(await modelOf(db, key).count({ where }));
      }
    } catch {
      continue; // جدول در این نسخه/دیتابیس وجود ندارد — مشکلی نیست
    }
    if (currentCount === 0) continue;
    losses.push({
      key,
      label,
      currentCount,
      parentKeys: [...info.roots],
      mode: info.hasCascade ? "cascade" : "setnull",
    });
  }
  return losses;
}

/* ------------------------------------------------------------------ */
/*                 اعتبارسنجی کلیدهای خارجی فایل بکاپ                   */
/* ------------------------------------------------------------------ */

/**
 * پیش از هر تغییری: فیلدهای کلید خارجیِ «جدول‌های در حال بازیابی» باید به
 * والد‌های موجود اشاره کنند — والد در فایل (اگر خودش هم بازیابی می‌شود)،
 * وگرنه والد در سایتِ فعلی؛ اگر والد با همین بازیابی آبشاری حذف می‌شود،
 * هیچ مقداری مرجعِ معتبر نیست. خنثی‌بودن (null) فقط در فیلدهای nullable
 * مجاز است.
 */
async function checkForeignKeys(
  payload: BackupPayload,
  restoreSet: Set<BackupTableKey>,
  cascadeDeleted: Set<BackupTableKey>
): Promise<void> {
  const entries = RELATIONS.filter((e) => restoreSet.has(e.child));
  if (entries.length === 0) return;

  const issues: BackupForeignKeyIssue[] = [];
  const dbIdsCache = new Map<BackupTableKey, Set<string>>();

  const parentIdsOf = async (
    table: BackupTableKey
  ): Promise<{ ids: Set<string>; source: "file" | "db" | "wiped" }> => {
    if (restoreSet.has(table)) {
      const ids = new Set(
        (payload.tables[table] ?? []).map((row) =>
          String(row[primaryKeyOf(table)] ?? "")
        )
      );
      return { ids, source: "file" };
    }
    // والد بازیابی نمی‌شود — اما با حذف آبشاری والدِ بالاتر می‌رود
    if (cascadeDeleted.has(table)) {
      return { ids: new Set<string>(), source: "wiped" };
    }
    let ids = dbIdsCache.get(table);
    if (!ids) {
      const pk = primaryKeyOf(table);
      const rows = await findPrimaryKeysOf(table);
      ids = new Set(rows.map((row) => String(row[pk] ?? "")));
      dbIdsCache.set(table, ids);
    }
    return { ids, source: "db" };
  };

  for (const edge of entries) {
    const rows = payload.tables[edge.child] ?? [];
    if (rows.length === 0) continue;
    const { ids, source } = await parentIdsOf(edge.parent);
    let missing = 0;
    for (const row of rows) {
      const value = row[edge.field];
      if (value === null || value === undefined) {
        if (edge.nullable) continue; // بی‌ارتباط — مجاز
        missing += 1;
        continue;
      }
      if (typeof value !== "string" || value === "" || !ids.has(value)) {
        missing += 1;
      }
    }
    if (missing > 0) {
      issues.push({
        table: edge.child,
        field: edge.field,
        referenced: edge.parent,
        missingCount: missing,
        rowCount: rows.length,
        source,
      });
    }
  }

  if (issues.length > 0) {
    throw new BackupForeignKeyError(issues);
  }
}

/* ------------------------------------------------------------------ */
/*        پاکسازی امنیتی رکوردهای بازیابی‌شده (بند ۹)                  */
/* ------------------------------------------------------------------ */

/**
 * رکوردهای HTML/آدرس‌دار بازیابی‌شده از فایل بکاپ، همان پاکسازیِ مسیر
 * پنل را می‌بینند — فایل بکاپ نادرست/دست‌کاری‌شده نمی‌تواند HTML/ایشو
 * خطرناک (کد نماد، cssText فونت، آدرس لوگو) را مستقیم تزریق کند.
 */

/** بازسازی امن cssText فونت از نام فایل و خانواده‌ی سالم */
function safeFontCssText(fileName: string, family: string): string | null {
  if (!/^[A-Za-z0-9._-]+$/.test(fileName) || fileName.includes("..")) {
    return null;
  }
  const safeFamily = family.replace(/['"{}\\]/g, "").trim().slice(0, 120);
  if (!safeFamily) return null;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const format =
    ext === "woff2" ? "woff2" : ext === "woff" ? "woff" : ext === "ttf" ? "truetype" : "opentype";
  return `@font-face{font-family:'${safeFamily}';src:url('/uploads/fonts/${fileName}') format('${format}');font-weight:400;font-style:normal;font-display:swap}`;
}

function sanitizeRestoredRows(payload: BackupPayload): void {
  const settings = payload.tables.siteSettings;
  if (Array.isArray(settings)) {
    for (const row of settings) {
      const enamad = row.enamadCode;
      if (typeof enamad === "string" && enamad.trim()) {
        row.enamadCode = sanitizeTrustHtml(enamad);
      }
      const zarinpal = row.zarinpalCode;
      if (typeof zarinpal === "string" && zarinpal.trim()) {
        row.zarinpalCode = sanitizeTrustHtml(zarinpal);
      }
      const logo = row.logoUrl;
      if (typeof logo === "string" && logo && !isSafePublicAssetUrl(logo)) {
        row.logoUrl = "/images/logo.png"; // مقدار پیش‌فرض امن
      }
    }
  }

  const fonts = payload.tables.installedFont;
  if (Array.isArray(fonts)) {
    for (const row of fonts) {
      // cssText فایل معتبر نیست — فقط نام فایل از داخل آن استخراج و با
      // خانواده‌ی پاکسازی‌شده از نو ساخته می‌شود (بدون @import/javascript)
      const css = typeof row.cssText === "string" ? row.cssText : "";
      const m = /url\(\s*['"]?\/uploads\/fonts\/([A-Za-z0-9._-]+)['"]?\s*\)/.exec(css);
      const family = typeof row.family === "string" ? row.family : "";
      const rebuilt =
        m ? safeFontCssText(m[1], family) : null;
      row.cssText = rebuilt ?? "";
    }
  }
}

/* ------------------------------------------------------------------ */
/*                             بازیابی                                 */
/* ------------------------------------------------------------------ */

/**
 * جایگزینی داده‌های محتوایی با محتوای فایل بکاپ —
 * داخل یک تراکنش: پاک‌سازی فرزند→والد، سپس درج والد→فرزند.
 *
 *  • فقط جدول‌های «موجود در فایل» جایگزین می‌شوند؛ جدول‌های غایب از
 *    فایل (بکاپ قدیمی) دست‌نخورده می‌مانند.
 *  • only=<بخش>: از فایل، فقط جدول‌های همان بخش بازیابی می‌شود —
 *    مثلاً از یک بکاپ کامل، فقط ویدئوها. فیلتر پیش از همه‌ی بررسی‌ها
 *    اعمال می‌شود تا هشدارها دقیقاً متناسب با محدوده‌ی واقعی باشند.
 *  • پیش از هر تغییری: اعتبارسنجی کلیدهای خارجی (خطای قطعی) و سپس
 *    بستار آبشاری (هشدارِ نیازمند تأیید force).
 *  • نشست مدیر دست‌نخورده می‌ماند؛ نشست کاربران و کدهای OTP فعال
 *    همیشه پاک می‌شوند (کاربرانِ بازیابی‌شده باید دوباره ورود کنند).
 */
export async function importBackup(
  payload: BackupPayload,
  opts?: { force?: boolean; only?: BackupSectionKey }
): Promise<ImportSummary> {
  // ۰) محدوده‌ی بازیابی — فیلتر جدول‌ها به بخش انتخابی، پیش از هر چیزی
  let effective = payload;
  let sectionEcho: BackupSectionKey | undefined =
    opts?.only ?? payload.section;
  if (opts?.only) {
    const spec = getBackupSection(opts.only);
    const tables: BackupPayload["tables"] = {};
    for (const key of spec.tables) {
      if (payload.tables[key]) tables[key] = payload.tables[key];
    }
    if (Object.keys(tables).length === 0) {
      throw new Error(
        `این فایل بکاپ داده‌ای برای بخش «${spec.label}» ندارد.`
      );
    }
    effective = { ...payload, tables, section: spec.key };
    sectionEcho = spec.key;
  }

  const restoreSet = new Set(
    Object.keys(effective.tables) as BackupTableKey[]
  );

  // ۰.۵) پاکسازی امنیتی رکوردهای حساس (بند ۹) — مسیر بازیابی بکاپ
  // نباید از کنارِ اعتبارسنجیِ پنل رد شود: کدهای نماد اعتماد، آدرس لوگو و
  // cssText فونت‌ها معادلِ امنِ خودشان ساخته می‌شوند.
  sanitizeRestoredRows(effective);

  // ۱) کلیدهای خارجیِ فایل — خطای قطعی، بدون امکان دور زدن (۴۰۰)
  const risks = computeCascadeRisks(restoreSet);
  await checkForeignKeys(effective, restoreSet, risks.deleted);

  // ۲) بستار آبشاری — بدون force، داده‌ی فعلیِ در معرض خطر → ۴۰۹
  const losses = await materializeDataLosses(risks);
  if (losses.length > 0 && !opts?.force) {
    throw new BackupDataLossError(losses);
  }

  const restored: Partial<Record<BackupTableKey, number>> = {};
  const labels: Partial<Record<BackupTableKey, string>> = {};

  // — فقط جدول‌های حاضر در فایل جایگزین می‌شوند (به ترتیب حذف معکوس) —
  const deleteOrder = DELETE_ORDER.filter(
    (key) => key === "userSession" || key === "otpCode" || restoreSet.has(key as BackupTableKey)
  );
  const createOrder = CREATE_ORDER.filter((t) => restoreSet.has(t.key));

  await db.$transaction(
    async (tx) => {
      // ۱) پاک‌سازی (فرزند → والد) + نشست کاربران و کدهای یک‌بارمصرف
      for (const key of deleteOrder) {
        await modelOf(tx, key).deleteMany({});
      }

      // ۲) درج رکوردهای بکاپ (والد → فرزند)
      for (const { key, label } of createOrder) {
        const rows = effective.tables[key];
        if (!rows || rows.length === 0) continue;
        await modelOf(tx, key).createMany({ data: rows });
        restored[key] = rows.length;
        labels[key] = label;
      }
    },
    { timeout: 300_000, maxWait: 20_000 }
  );

  return { restored, labels, section: sectionEcho };
}
