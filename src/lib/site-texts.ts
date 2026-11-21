import { DEFAULT_SETTINGS } from "@/lib/default-settings";
import type { SiteSettings } from "@prisma/client";
import { SITE_TEXT_KEY_ALIASES } from "../../scripts/site-text-registry";

// — منبع واحدِ نام‌های مستعار کلیدها برای اپ و ابزارهای عملیات
//   (migrate/restore) — تعریف در scripts/site-text-registry.ts
export { SITE_TEXT_KEY_ALIASES };

/**
 * رجیستری متن‌های قابل‌ویرایش — «ویرایشگر ظاهری مدادی».
 *
 * هر جایگاه متن با یک کلید یکتا شناسایی می‌شود و مدیر می‌تواند از پاپ‌آپ
 * مداد، متن/رنگ/فونت/اندازه/نمایش‌و‌مخفی‌بودن آن را تغییر دهد.
 *
 * متن‌های وابسته به تنظیمات در SiteSettings آینه می‌شوند تا با ماژول
 * «تنظیمات سایت» پنل مدیر دوطرفه همگام بمانند:
 *  • hero.slogan / hero.description / sloganFont
 *  • footer.description / footer.contact* / footer.address / footer.supportHours
 *    (اطلاعات تماس فوتر در صفحات مستقل ثبت‌نام و استعلام گواهی‌نامه نیز
 *     از همین فیلدهای SiteSettings خوانده می‌شود؛ پس ویرایش از مداد،
 *     اطلاعات تماس را در کل صفحات سایت به‌روز می‌کند)
 */

export const SITE_TEXT_MAX_LEN = 600;
export const SITE_TEXT_FONT_MIN = 8;
export const SITE_TEXT_FONT_MAX = 120;

export interface SiteTextSlotInfo {
  /** کلید یکتای جایگاه متن (id رکورد SiteText) */
  key: string;
  /** نام نمایشی فارسی برای عنوان پاپ‌آپ ویرایش */
  label: string;
  /** متن پیش‌فرض قطعه‌ی سایت */
  defaultText: string;
  /** فیلد SiteSettings که متن این جایگاه در آن آینه می‌شود (همگام با ماژول تنظیمات) */
  mirrorSettingsField?:
    | "slogan"
    | "heroDescription"
    | "footerDescription"
    | "contactPhone"
    | "contactEmail"
    | "address"
    | "supportHours";
  /** فیلد فونت SiteSettings که فونت این جایگاه در آن آینه می‌شود */
  mirrorFontField?: "sloganFont";
  /**
   * فیلد عددی SiteSettings که متن (عدد) این جایگاه در آن آینه می‌شود —
   * مخصوص شمارنده‌های کارت‌های «رشد آکادمی در یک نگاه»: تغییر عدد با مداد
   * همان فیلد تنظیمات (و ماژول «تنظیمات سایت») را به‌روز می‌کند و بالعکس.
   */
  mirrorNumberSettingsField?: "studentsCount" | "completedCoursesCount";
}

/** ۳۶ جایگاه متن قابل‌ویرایش — صفحه‌ی اول (هیرو/دوره‌ها/آمار/نظرات/ویدئوها) + فوتر + صفحه‌ی ویدئوها + صفحه‌ی ثبت‌نام + قوانین پیش‌ثبت‌نام */
export const SITE_TEXT_SLOTS: SiteTextSlotInfo[] = [
  {
    key: "hero.slogan",
    label: "اسلوگان اصلی (تیتر بالای صفحه‌ی اول)",
    defaultText: DEFAULT_SETTINGS.slogan,
    mirrorSettingsField: "slogan",
    mirrorFontField: "sloganFont",
  },
  {
    key: "hero.description",
    label: "متن معرفی (زیر اسلوگان اصلی)",
    defaultText: DEFAULT_SETTINGS.heroDescription,
    mirrorSettingsField: "heroDescription",
  },
  {
    key: "courses.title",
    label: "تیتر بخش دوره‌های آموزشی",
    defaultText: "مهارت خود را با دوره‌های حرفه‌ای ارتقا دهید",
  },
  {
    key: "courses.description",
    label: "توضیح بخش دوره‌های آموزشی",
    defaultText:
      "از هوش مصنوعی تا کامپیوتر کودکان؛ هر دوره با پروژه‌های واقعی و پشتیبانی مربی طراحی شده است.",
  },
  {
    key: "actions.title",
    label: "تیتر بخش «سه مسیر برای شروع»",
    defaultText: "سه مسیر برای شروع سریع شما",
  },
  {
    key: "register.title",
    label: "تیتر بخش رزرو دوره",
    defaultText: "جای خود را در دوره‌ها رزرو کنید",
  },
  {
    key: "register.description",
    label: "توضیح فرم ثبت‌نام",
    defaultText:
      "فرم زیر را پر کنید؛ ثبت‌نام نهایی پس از تماس کارشناسان آموزشی و پرداخت شهریه انجام می‌شود.",
  },
  {
    key: "register.whyTitle",
    label: "تیتر «چرا آکادمی؟»",
    defaultText: "چرا آکادمی آوید؟",
  },
  {
    key: "register.benefit-1",
    label: "مزیت ثبت‌نام — دسترسی به پنل",
    defaultText: "دسترسی به پنل کاربری و کلیه جلسات به صورت ضبط‌شده",
  },
  {
    key: "register.benefit-2",
    label: "مزیت ثبت‌نام — پشتیبانی مربی",
    defaultText: "پشتیبانی مستقیم مربی در طول دوره",
  },
  {
    key: "register.benefit-3",
    label: "مزیت ثبت‌نام — برنامه یادگیری",
    defaultText: "برنامه یادگیری شخصی‌سازی‌شده بر اساس هدف شما",
  },
  {
    key: "register.benefit-4",
    label: "مزیت ثبت‌نام — پروژه‌های واقعی",
    defaultText: "پروژه‌های واقعی برای رزومه حرفه‌ای",
  },
  {
    key: "testimonials.title",
    label: "تیتر بخش نظرات کارآموزان",
    defaultText: "کارآموزان ما چه می‌گویند؟",
  },
  {
    key: "testimonials.description",
    label: "توضیح بخش نظرات کارآموزان",
    defaultText:
      "تجربه واقعی افرادی که مسیر یادگیری خود را با ما شروع کردند و امروز به هدفشان رسیده‌اند.",
  },
  {
    key: "testimonials.ratingNote",
    label: "یادداشت میانگین رضایت (زیر نظرات)",
    defaultText: "میانگین رضایت ۴.۹ از ۵ بر اساس نظرات کارآموزان",
  },
  /* ——— بخش ویدئوهای صفحه‌ی اول ——— */
  {
    key: "videos.title",
    label: "تیتر بخش ویدئوها (صفحه‌ی اول)",
    defaultText: "آموزش‌های رایگان را تماشا کنید",
  },
  /* ——— بخش نمونه سوالات صفحه‌ی اول ——— */
  {
    key: "samples.title",
    label: "تیتر بخش نمونه سوالات",
    defaultText: "نمونه سوالات را بررسی کنید",
  },
  {
    key: "samples.description",
    label: "توضیح بخش نمونه سوالات",
    defaultText:
      "نمونه سوالات دوره‌ها به‌صورت رایگان در اختیار شماست؛ فایل‌ها را مشاهده یا دانلود کنید تا سطح آزمون‌ها را از قبل بشناسید.",
  },
  /* ——— کارت‌های «رشد آکادمی در یک نگاه» — عددها هم با مداد ویرایش می‌شوند ——— */
  {
    key: "stats.badge",
    label: "نشان بخش «رشد آکادمی در یک نگاه»",
    defaultText: "رشد آکادمی در یک نگاه",
  },
  {
    key: "stats.students",
    label: "عدد شمارنده‌ی کارآموزان",
    defaultText: String(DEFAULT_SETTINGS.studentsCount),
    mirrorNumberSettingsField: "studentsCount",
  },
  {
    key: "stats.students.label",
    label: "عنوان کارت کارآموزان",
    defaultText: "کارآموزان",
  },
  {
    key: "stats.students.description",
    label: "توضیح کارت کارآموزان",
    defaultText: "در حال یادگیری در دوره‌های مختلف آکادمی",
  },
  {
    key: "stats.completed",
    label: "عدد شمارنده‌ی دوره‌های پایان‌یافته",
    defaultText: String(DEFAULT_SETTINGS.completedCoursesCount),
    mirrorNumberSettingsField: "completedCoursesCount",
  },
  {
    key: "stats.completed.label",
    label: "عنوان کارت دوره‌های پایان‌یافته",
    defaultText: "دوره‌های پایان‌یافته",
  },
  {
    key: "stats.completed.description",
    label: "توضیح کارت دوره‌های پایان‌یافته",
    defaultText: "دوره‌ی برگزارشده با موفقیت تا امروز",
  },
  {
    key: "videos.description",
    label: "توضیح بخش ویدئوها (صفحه‌ی اول)",
    defaultText:
      "همه‌ی ویدئوهای آموزشی به‌صورت کاملاً رایگان و بدون نیاز به ثبت‌نام در دسترس شماست؛ روی هر ویدئو کلیک کنید و همین حالا تماشا کنید.",
  },
  /* ——— فوتر ——— */
  {
    key: "footer.description",
    label: "متن معرفی فوتر (زیر نام آکادمی)",
    defaultText: DEFAULT_SETTINGS.footerDescription,
    mirrorSettingsField: "footerDescription",
  },
  {
    key: "footer.contactPhone",
    label: "شماره تماس فوتر",
    defaultText: DEFAULT_SETTINGS.contactPhone,
    mirrorSettingsField: "contactPhone",
  },
  {
    key: "footer.contactEmail",
    label: "ایمیل فوتر",
    defaultText: DEFAULT_SETTINGS.contactEmail,
    mirrorSettingsField: "contactEmail",
  },
  {
    key: "footer.address",
    label: "آدرس فوتر",
    defaultText: DEFAULT_SETTINGS.address,
    mirrorSettingsField: "address",
  },
  {
    key: "footer.supportHours",
    label: "ساعات پشتیبانی فوتر",
    defaultText: DEFAULT_SETTINGS.supportHours,
    mirrorSettingsField: "supportHours",
  },
  /* ——— صفحه‌ی ویدئوهای آموزشی ——— */
  {
    key: "videosPage.title",
    label: "تیتر صفحه‌ی ویدئوهای آموزشی",
    defaultText: "لیست‌های پخش آموزشی آوید",
  },
  {
    key: "videosPage.description",
    label: "توضیح صفحه‌ی ویدئوهای آموزشی",
    defaultText:
      "مجموعه‌های ویدئویی ما را اینجا تماشا کنید؛ روی هر لیست پخش کلیک کنید تا ویدئوها را پشت‌سرهم ببینید. برخی مجموعه‌ها مخصوص کاربران عضو هستند",
  },
  /* ——— صفحه‌ی پیش‌ثبت‌نام در دوره‌ها ——— */
  {
    key: "registerPage.badge",
    label: "نشان بالای فرم (صفحه‌ی ثبت‌نام)",
    defaultText: "پیش‌ثبت‌نام در دوره‌ها",
  },
  {
    key: "registerPage.title",
    label: "تیتر صفحه‌ی پیش‌ثبت‌نام در دوره‌ها",
    defaultText: "ثبت‌نام کنید و به آوید بپیوندید",
  },
  {
    key: "registerPage.description",
    label: "توضیح فرم (صفحه‌ی ثبت‌نام)",
    defaultText:
      "فرم زیر را پر کنید؛ پس از تایید شماره موبایل، دوره‌ی مورد نظر خود را انتخاب می‌کنید — انتخاب دوره برای تکمیل ثبت‌نام الزامی است. اگر فعلاً دوره‌ای نمی‌خواهید، از دکمه‌ی «ورود / ثبت‌نام» در هدر سایت حساب بسازید.",
  },
  /* ——— مرحله‌ی تایید قوانین (فرم ۵-مرحله‌ای پیش‌ثبت‌نام) ——— */
  {
    key: "enrollTerms.title",
    label: "تیتر قوانین ثبت‌نام (فرم پیش‌ثبت‌نام)",
    defaultText: "قوانین و مقررات ثبت‌نام دوره‌ها",
  },
  {
    key: "enrollTerms.body",
    label: "متن قوانین ثبت‌نام (فرم پیش‌ثبت‌نام)",
    defaultText:
      "۱. ثبت‌نام پس از تایید شماره موبایل، پذیرش قوانین و پرداخت شهریه (نقدی یا قسط اول) نهایی می‌شود.\n۲. لغو ثبت‌نام و عودت کامل وجه تا ۷ روز قبل از شروع دوره امکان‌پذیر است؛ پس از آن مطابق سیاست بازپرداخت اعلام‌شده عمل می‌شود.\n۳. در صورت تکمیل ظرفیت، ثبت‌نام به دوره/گروه جانشین منتقل یا وجه کامل عودت داده می‌شود.\n۴. اقساط باید تا سررسید هر قسط پرداخت شوند؛ تأخیر بیش از ۱۵ روز ممکن است دسترسی به دوره را محدود کند.\n۵. محتوای دوره‌ها فقط برای استفاده‌ی شخصی شماست؛ انتشار مجدد آن مجاز نیست.\n۶. حضور و انجام تکالیف دوره‌های حضوری/ترکیبی طبق برنامه‌ی اعلام‌شده الزامی است.",
  },
];

export const SITE_TEXT_KEY_SET = new Set(SITE_TEXT_SLOTS.map((s) => s.key));

export function findSiteTextSlot(key: string): SiteTextSlotInfo | undefined {
  return SITE_TEXT_SLOTS.find((s) => s.key === key);
}

/** مقدار پیش‌فرضِ فعلی هر جایگاه — برای متن‌های وابسته به تنظیمات (سرویس‌ساید) */
export function buildSiteTextDefaults(
  settings: SiteSettings | null | undefined
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const slot of SITE_TEXT_SLOTS) {
    switch (slot.key) {
      case "hero.slogan":
        map[slot.key] = settings?.slogan ?? slot.defaultText;
        break;
      case "hero.description":
        map[slot.key] = settings?.heroDescription ?? slot.defaultText;
        break;
      case "footer.description":
        map[slot.key] = settings?.footerDescription ?? slot.defaultText;
        break;
      case "footer.contactPhone":
        map[slot.key] = settings?.contactPhone ?? slot.defaultText;
        break;
      case "footer.contactEmail":
        map[slot.key] = settings?.contactEmail ?? slot.defaultText;
        break;
      case "footer.address":
        map[slot.key] = settings?.address ?? slot.defaultText;
        break;
      case "footer.supportHours":
        map[slot.key] = settings?.supportHours ?? slot.defaultText;
        break;
      case "stats.students":
        map[slot.key] = String(
          settings?.studentsCount ?? DEFAULT_SETTINGS.studentsCount
        );
        break;
      case "stats.completed":
        map[slot.key] = String(
          settings?.completedCoursesCount ??
            DEFAULT_SETTINGS.completedCoursesCount
        );
        break;
      case "register.whyTitle":
        map[slot.key] = `چرا آکادمی ${settings?.siteName ?? "آوید"}؟`;
        break;
      case "videosPage.title":
        map[slot.key] = `لیست‌های پخش آموزشی ${settings?.siteName ?? "آوید"}`;
        break;
      default:
        map[slot.key] = slot.defaultText;
    }
  }
  return map;
}

/** نرمال‌سازی رنگ ورودی (هگز) — خالی یا نامعتبر = null (رنگ پیش‌فرض قالب) */
export function normalizeSiteTextColor(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const raw = v.trim().replace(/^#/, "");
  if (!raw) return null;
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const hex =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  return `#${hex.toLowerCase()}`;
}

/**
 * نرمال‌سازی اندازه فونت (پیکسل) — ۰/خالی/خارج از بازه = null (پیش‌فرض قطعه)
 */
export function normalizeSiteTextFontSize(v: unknown): number | null {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim()
        ? Number(v)
        : 0;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  if (r < SITE_TEXT_FONT_MIN || r > SITE_TEXT_FONT_MAX) return null;
  return r;
}

/**
 * استخراج عدد از متن فارسی/انگلیسی — برای جایگاه‌های عددیِ شمارنده
 * (digits فارسی به انگلیسی تبدیل و جداکننده‌ها حذف می‌شوند).
 * خروجی null یعنی متن هیچ رقمی ندارد.
 */
export function parseSiteCounterNumber(text: string): number | null {
  const faToEn = text.replace(/[۰-۹]/g, (d) =>
    String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
  );
  const digits = faToEn.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n <= 100_000_000 ? n : null;
}
