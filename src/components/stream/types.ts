/**
 * انواع مشترک کلاس آنلاین (استریم) — سمت کلاینت.
 * منبع رویدادها: سرویس سیگنالینگ mini-services/stream-service.
 */

export type StreamRole = "host" | "student";

/** حالات کیفیت بیننده — بهینه برای اینترنت ضعیف */
export type QualityMode = "full" | "low" | "audio";

/** عضو حاضر در اتاق (هر سوکت) */
export interface RoomUser {
  /** سوکت عضو — در رویدادهای بعد از ورود ارائه نمی‌شود */
  socketId?: string;
  userId: string | null;
  name: string;
  role: StreamRole;
}

/** پیام چت */
export interface ChatMsg {
  userId: string | null;
  name: string;
  role: string;
  text: string;
  ts: number;
}

/** درخواست دانشجو برای اجازه‌ی تصویر/صدا (نمایش فقط برای استاد) */
export interface MediaRequest {
  userId: string;
  name: string;
  ts: number;
}

/** رسانه‌ی دریافتی از یک ناشر دور — آماده‌ی اتصال به المان‌های ویدئو */
export interface RemotePublisher {
  /** سوکت ناشر — کلید یکتا */
  socketId: string;
  userId: string | null;
  name: string;
  /** استریم صفحه‌ی اصلی (اشتراک صفحه یا دوربین ناشر) */
  main: MediaStream | null;
  /** استریم دوربین ناشر — فقط وقتی هم‌زمان صفحه هم اشتراک شده (PiP) */
  pip: MediaStream | null;
  /** در حال اتصال است؟ */
  state: "connecting" | "live";
}

/** پاسخ GET /api/streams/[id] — نقش بیننده‌ی فعلی */
export interface StreamSession {
  role: "host" | "student" | "guest";
  canJoin: boolean;
  reason?: "login" | "kicked" | "ended" | "not-invited";
  stream: {
    id: string;
    title: string;
    description?: string;
    status: "scheduled" | "live" | "ended";
    startedAt?: string | null;
    endedAt?: string | null;
  };
  me?: { name: string };
}

/** آیتم دعوت فعال پنل کاربر — GET /api/panel/streams */
export interface PanelStreamInvite {
  id: string;
  title: string;
  description: string;
  status: string;
  startedAt: string | null;
  reasons: string[];
}

/** استریم + دعوت‌ها + تعداد شرکت‌کننده (پاسخ GET /api/admin/streams) */
export interface AdminStreamRow {
  id: string;
  title: string;
  description: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  invitations: Array<{
    id: string;
    courseId: string | null;
    courseTitle: string | null;
    classId: string | null;
    classTitle: string | null;
  }>;
  _count: { participants: number };
}
