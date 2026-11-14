import {
  Award,
  Bot,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  DatabaseBackup,
  GraduationCap,
  Images,
  LayoutDashboard,
  MessageSquare,
  MessagesSquare,
  MonitorPlay,
  PanelTop,
  Settings,
  ShieldCheck,
  Type,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import type { ModuleKey, ModuleProps } from "../types";
import { DashboardModule } from "./dashboard-module";
import { SettingsModule } from "./settings-module";
import { CoursesModule } from "./courses-module";
import { VideosModule } from "./videos-module";
import { ExamsModule } from "./exams-module";
import { CertificatesModule } from "./certificates-module";
import { TestimonialsModule } from "./testimonials-module";
import { EnrollmentsModule } from "./enrollments-module";
import { PaymentModule } from "./payment-module";
import { UsersModule } from "./users-module";
import { SmsModule } from "./sms-module";
import { ChatModule } from "./chat-module";
import { FontsModule } from "./fonts-module";
import { HeaderFooterModule } from "./header-footer-module";
import { AccountModule } from "./account-module";
import { BackupModule } from "./backup-module";
import { GalleryModule } from "./gallery-module";

/**
 * رجیستری ماژول‌های CMS — قلب معماری ماژولار پنل.
 * افزودن ماژول جدید = یک فایل کامپوننت + یک ردیف در این آرایه.
 */
export interface AdminModule {
  key: ModuleKey;
  label: string;
  description: string;
  icon: LucideIcon;
  component: ComponentType<ModuleProps>;
}

export const MODULES: AdminModule[] = [
  {
    key: "dashboard",
    label: "داشبورد",
    description: "نمای کلی آمار سایت و آخرین ثبت‌نام‌ها",
    icon: LayoutDashboard,
    component: DashboardModule,
  },
  {
    key: "courses",
    label: "دوره‌ها",
    description: "مدیریت دوره‌های آنلاین، حضوری و ترکیبی",
    icon: GraduationCap,
    component: CoursesModule,
  },
  {
    key: "videos",
    label: "ویدئوها",
    description: "مدیریت ویدئوها و لیست‌های پخش آموزشی سایت",
    icon: MonitorPlay,
    component: VideosModule,
  },
  {
    key: "exams",
    label: "آزمون‌ها",
    description: "آزمون‌های دوره‌ای، آزاد و رمزدار — سوالات، پاسخ‌ها و تصحیح تشریحی",
    icon: ClipboardCheck,
    component: ExamsModule,
  },
  {
    key: "certificates",
    label: "صدور گواهینامه",
    description: "صدور گواهینامه‌ی دوره برای کاربران — آپلود فایل PDF یا تصویر و تخصیص به کاربر و دوره",
    icon: Award,
    component: CertificatesModule,
  },
  {
    key: "headerFooter",
    label: "ویرایش هدر و فوتر",
    description: "مدیریت لینک‌ها و دکمه‌های هدر و فوتر + فونت هرکدام",
    icon: PanelTop,
    component: HeaderFooterModule,
  },
  {
    key: "testimonials",
    label: "نظرات کاربران",
    description: "مدیریت نظرات و تجربه‌های کاربران",
    icon: MessagesSquare,
    component: TestimonialsModule,
  },
  {
    key: "enrollments",
    label: "مدیریت پیش‌ثبت‌نام‌ها",
    description: "لیست پیش‌ثبت‌نام‌های دریافت‌شده و وضعیت پرداخت هر مورد",
    icon: ClipboardList,
    component: EnrollmentsModule,
  },
  {
    key: "payment",
    label: "تنظیمات درگاه پرداخت",
    description: "درگاه پرداخت، طرح اقساطی و کدهای تخفیف پیش‌ثبت‌نام",
    icon: CreditCard,
    component: PaymentModule,
  },
  {
    key: "users",
    label: "مدیریت کاربران",
    description: "کاربران سایت، وضعیت حساب و اقساط آنها",
    icon: Users,
    component: UsersModule,
  },
  {
    key: "sms",
    label: "پنل پیامکی",
    description: "اتصال به ملی پیامک، ارسال پیامک و گزارش ارسال",
    icon: MessageSquare,
    component: SmsModule,
  },
  {
    key: "chat",
    label: "مدیریت چت",
    description: "گفتگو با کاربران سایت و تنظیمات چت‌بات پشتیبانی",
    icon: Bot,
    component: ChatModule,
  },
  {
    key: "fonts",
    label: "فونت‌ها",
    description: "کتابخانه‌ی فونت‌های نصب‌شده سایت — نصب و حذف فونت",
    icon: Type,
    component: FontsModule,
  },
  {
    key: "gallery",
    label: "گالری",
    description: "آرشیو همه‌ی فایل‌های بارگذاری‌شده — دسته‌بندی فرمت، مرتب‌سازی تاریخ/حجم و مشخصات بارگذاری‌کننده",
    icon: Images,
    component: GalleryModule,
  },
  {
    key: "settings",
    label: "تنظیمات سایت",
    description: "هویت، اطلاعات تماس و پیکربندی عمومی",
    icon: Settings,
    component: SettingsModule,
  },
  {
    key: "backup",
    label: "بکاپ و بازیابی",
    description: "دانلود بکاپ داده‌ها و فایل‌ها + بازیابی از فایل بکاپ",
    icon: DatabaseBackup,
    component: BackupModule,
  },
  {
    key: "account",
    label: "حساب و امنیت",
    description: "تغییر رمز عبور مدیر و ابطال نشست‌های ورود",
    icon: ShieldCheck,
    component: AccountModule,
  },
];
