import type {
  ChatConversation,
  ChatMessage,
  ChatSettings,
  ClassMembership,
  ClassRoom,
  Course,
  CourseGroup,
  CourseInstallment,
  DiscountCode,
  Enrollment,
  Exam,
  ExamAttempt,
  ExamQuestion,
  InstalledFont,
  Installment,
  NavLink,
  PaymentSettings,
  Playlist,
  SampleQuestion,
  SampleQuestionCategory,
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
  ClassMembership,
  ClassRoom,
  Course,
  CourseGroup,
  CourseInstallment,
  DiscountCode,
  Enrollment,
  Exam,
  ExamAttempt,
  ExamQuestion,
  InstalledFont,
  Installment,
  NavLink,
  PaymentSettings,
  Playlist,
  SampleQuestion,
  SampleQuestionCategory,
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

/** کاربر + نقش و آمار ثبت‌نام/کلاس/اقساط (پاسخ GET /api/admin/users) */
export type UserWithStats = User & {
  /** نقش حساب — «student» یا «teacher» (ستون خود User؛ برای خوانایی تکرار شده) */
  role: string;
  /** شمار کلاس‌هایی که کاربر عضو آنهاست */
  classesCount: number;
  enrollmentsCount: number;
  installmentPaid: number;
  installmentPending: number;
  installmentTotalAmount: number;
  installmentPaidAmount: number;
};

/** استاد + آمار دوره/کلاس/استریم (پاسخ GET /api/admin/teachers) */
export type TeacherWithStats = User & {
  /** شمار دوره‌هایی که مالکشان این استاد است */
  coursesCount: number;
  /** شمار کلاس‌هایی که مالکشان این استاد است */
  classesCount: number;
  /** شمار کل استریم‌های میزبانی‌شده توسط این استاد */
  streamsCount: number;
  /** شمار استریم‌های پایان‌یافته‌ی این استاد */
  streamsEndedCount: number;
  /** شمار دانشجویان یکتای دوره‌های این استاد */
  studentsCount: number;
};

/** کلاس + شمارنده‌ی اعضا (پاسخ GET /api/admin/classes) */
export type ClassRoomWithCount = ClassRoom & {
  _count: { members: number };
};

/** عضویت + مشخصات کاربر (پاسخ GET /api/admin/classes/[id]/members) */
export type ClassMemberRow = ClassMembership & {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    nationalId: string | null;
  };
};

/** آزمون + عنوان دوره/کلاس و شمارنده‌ها (پاسخ GET /api/admin/exams) */
export type ExamWithStats = Exam & {
  course?: { title: string } | null;
  class?: { title: string } | null;
  _count?: { questions: number; attempts: number };
};

/** ثبت‌نام + اقساط (پاسخ GET /api/admin/users/[id]) */
export type EnrollmentWithInstallments = Enrollment & {
  installments: Installment[];
};

/** دسته‌ی نمونه سوال + شمارنده‌ها (پاسخ GET /api/admin/sample-questions/categories) */
export type SampleQuestionCategoryWithCount = SampleQuestionCategory & {
  _count: { items: number };
  publishedItems: number;
};

/** نمونه سوال + دسته (پاسخ GET /api/admin/sample-questions/items) */
export type SampleQuestionWithCategory = SampleQuestion & {
  category?: { id: string; title: string } | null;
};

/** کلیدهای ماژول‌های پنل مدیریت */
export type ModuleKey =
  | "dashboard"
  | "stats"
  | "homepageSections"
  | "settings"
  | "courses"
  | "videos"
  | "exams"
  | "certificates"
  | "samples"
  | "testimonials"
  | "enrollments"
  | "payment"
  | "users"
  | "classes"
  | "streams"
  | "sms"
  | "chat"
  | "fonts"
  | "headerFooter"
  | "gallery"
  | "backup"
  | "account";

/** props مشترک همه‌ی ماژول‌ها (تا از داشبورد بتوان به ماژول دیگر سوئیچ کرد) */
export interface ModuleProps {
  setActive: (key: ModuleKey) => void;
}

/** ساختار پاسخ GET /api/admin/stats */
export interface Stats {
  courses: { total: number; online: number; inperson: number; hybrid: number; published: number };
  videos: { total: number; published: number };
  testimonials: { total: number; published: number };
  enrollments: { total: number; new: number };
  recentEnrollments: Enrollment[];
}
