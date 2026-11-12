import type {
  ChatConversation,
  ChatMessage,
  ChatSettings,
  Course,
  CourseGroup,
  CourseInstallment,
  DiscountCode,
  Enrollment,
  InstalledFont,
  Installment,
  NavLink,
  PaymentSettings,
  Playlist,
  SiteSettings,
  SmsLog,
  SmsSettings,
  Testimonial,
  User,
  Video,
} from "@prisma/client";

/** انواع موجودیت‌های دامنه — مستقیم از Prisma Client */
export type {
  ChatConversation,
  ChatMessage,
  ChatSettings,
  Course,
  CourseGroup,
  CourseInstallment,
  DiscountCode,
  Enrollment,
  InstalledFont,
  Installment,
  NavLink,
  PaymentSettings,
  Playlist,
  SiteSettings,
  SmsLog,
  SmsSettings,
  Testimonial,
  User,
  Video,
};

/** آیتم لیست گفتگوها (پاسخ GET /api/chat/admin/conversations) */
export interface ChatConversationListItem {
  id: string;
  displayName: string;
  visitorToken: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadForAdmin: number;
  createdAt: string;
}

/** جزئیات یک گفتگو + پیام‌ها (پاسخ GET /api/chat/admin/conversations/[id]) */
export interface ChatConversationDetail {
  id: string;
  displayName: string;
  visitorToken: string;
  createdAt: string;
  lastMessageAt: string;
  messages: ChatMessage[];
}

/** گروه زمان‌بندی + تعداد ثبت‌نام فعال آن (پاسخ GET /api/admin/courses) */
export type CourseGroupWithUsage = CourseGroup & { enrolledCount?: number };

/** دوره + تعداد ثبت‌نام فعال آن و گروه‌هایش (پاسخ GET /api/admin/courses) */
export type CourseWithUsage = Course & {
  enrolledCount?: number;
  groups?: CourseGroupWithUsage[];
  /** قالب اقساط دوره — تعریف مدیر برای تعداد و سررسید اقساط */
  installmentTemplate?: CourseInstallment[];
};

/** کاربر + آمار ثبت‌نام و اقساط (پاسخ GET /api/admin/users) */
export type UserWithStats = User & {
  enrollmentsCount: number;
  installmentPaid: number;
  installmentPending: number;
  installmentTotalAmount: number;
  installmentPaidAmount: number;
};

/** ثبت‌نام + اقساط (پاسخ GET /api/admin/users/[id]) */
export type EnrollmentWithInstallments = Enrollment & {
  installments: Installment[];
};

/** کلیدهای ماژول‌های پنل مدیریت */
export type ModuleKey =
  | "dashboard"
  | "settings"
  | "courses"
  | "videos"
  | "testimonials"
  | "enrollments"
  | "payment"
  | "users"
  | "sms"
  | "chat"
  | "fonts"
  | "headerFooter"
  | "account";

/** props مشترک همه‌ی ماژول‌ها (تا از داشبورد بتوان به ماژول دیگر سوئیچ کرد) */
export interface ModuleProps {
  setActive: (key: ModuleKey) => void;
}

/** ساختار پاسخ GET /api/admin/stats */
export interface Stats {
  courses: { total: number; online: number; inperson: number; published: number };
  videos: { total: number; published: number };
  testimonials: { total: number; published: number };
  enrollments: { total: number; new: number };
  recentEnrollments: Enrollment[];
}
