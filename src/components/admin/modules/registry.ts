import {
  Bot,
  ClipboardList,
  CreditCard,
  GraduationCap,
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
import { TestimonialsModule } from "./testimonials-module";
import { EnrollmentsModule } from "./enrollments-module";
import { PaymentModule } from "./payment-module";
import { UsersModule } from "./users-module";
import { SmsModule } from "./sms-module";
import { ChatModule } from "./chat-module";
import { FontsModule } from "./fonts-module";
import { HeaderFooterModule } from "./header-footer-module";
import { AccountModule } from "./account-module";

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
    description: "مدیریت دوره‌های آنلاین و حضوری",
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
    key: "settings",
    label: "تنظیمات سایت",
    description: "هویت، اطلاعات تماس و پیکربندی عمومی",
    icon: Settings,
    component: SettingsModule,
  },
  {
    key: "account",
    label: "حساب و امنیت",
    description: "تغییر رمز عبور مدیر و ابطال نشست‌های ورود",
    icon: ShieldCheck,
    component: AccountModule,
  },
];
