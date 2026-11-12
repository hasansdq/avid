/**
 * انواع مشترک «ظرفیت دوره و گروه‌ها» — ایمن برای استفاده در کلاینت
 * (بدون وابستگی به Prisma/DB تا باندل سمت مرورگر سبک بماند).
 */

/** وضعیت ظرفیت یک گروه زمان‌بندی (دوره‌های حضوری) */
export interface GroupAvailability {
  /** شناسه‌ی گروه — هنگام ثبت‌نام ارسال می‌شود */
  id: string;
  /** نام گروه مثل «گروه ۱» */
  title: string;
  /** زمان‌بندی گروه مثل «دوشنبه و چهارشنبه، ۱۶ تا ۱۸» */
  schedule: string;
  /** ظرفیت جداگانه‌ی گروه (نفر)؛ صفر یعنی بدون محدودیت */
  capacity: number;
  /** ثبت‌نام‌های فعال این گروه */
  enrolled: number;
  /** جای خالی باقیمانده */
  remaining: number;
  /** آیا این گروه پر شده؟ */
  full: boolean;
}

/** وضعیت ظرفیت یک دوره بر اساس ثبت‌نام‌های فعال */
export interface CourseAvailability {
  /** ظرفیت تعریف‌شده‌ی دوره (نفر)؛ صفر یعنی بدون محدودیت */
  capacity: number;
  /** تعداد ثبت‌نام‌های فعال (همه‌ی وضعیت‌ها به‌جز «بایگانی») */
  enrolled: number;
  /** جای خالی باقیمانده؛ برای دوره‌های بدون محدودیت صفر است */
  remaining: number;
  /**
   * آیا ظرفیت تکمیل شده؟
   * برای دوره‌های حضوریِ گروه‌دار: وقتی «همه‌ی گروه‌ها» پر شده باشند.
   */
  full: boolean;
  /** گروه‌های زمان‌بندی — فقط برای دوره‌های حضوریِ دارای گروه */
  groups?: GroupAvailability[];
}

/** نقشه‌ی عنوان دوره → وضعیت ظرفیت */
export type AvailabilityMap = Record<string, CourseAvailability>;

/**
 * محاسبه‌ی وضعیت ظرفیت از روی اعداد خام — همین منطق هم در
 * سرور (برای اعمال محدودیت) و هم در UI استفاده می‌شود.
 */
export function computeAvailability(
  capacity: number,
  enrolled: number
): CourseAvailability {
  const capped = Math.max(0, capacity);
  const count = Math.max(0, enrolled);
  const unlimited = capped === 0;
  const remaining = unlimited ? 0 : Math.max(0, capped - count);
  return {
    capacity: capped,
    enrolled: count,
    remaining,
    full: !unlimited && count >= capped,
  };
}

/** محاسبه‌ی وضعیت ظرفیت یک گروه */
export function computeGroupAvailability(
  group: Pick<GroupAvailability, "id" | "title" | "schedule" | "capacity">,
  enrolled: number
): GroupAvailability {
  const base = computeAvailability(group.capacity, enrolled);
  return {
    id: group.id,
    title: group.title,
    schedule: group.schedule,
    capacity: base.capacity,
    enrolled: base.enrolled,
    remaining: base.remaining,
    full: base.full,
  };
}

/**
 * وضعیت کل دوره‌ی حضوریِ گروه‌دار از روی وضعیت گروه‌ها:
 * ظرفیت = مجموع ظرفیت گروه‌ها؛ تکمیل = پر بودن همه‌ی گروه‌ها.
 */
export function aggregateGroupsAvailability(
  groups: GroupAvailability[]
): Pick<CourseAvailability, "capacity" | "enrolled" | "remaining" | "full"> {
  const capacity = groups.reduce((sum, g) => sum + g.capacity, 0);
  const enrolled = groups.reduce((sum, g) => sum + g.enrolled, 0);
  const remaining = groups.reduce((sum, g) => sum + g.remaining, 0);
  return {
    capacity,
    enrolled,
    remaining,
    // دوره فقط وقتی «تکمیل» است که گروه دیگری با جای خالی نمانده باشد
    full: groups.length > 0 && groups.every((g) => g.full),
  };
}
