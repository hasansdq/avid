import { toast } from "sonner";

/**
 * لایه ارتباط با API مدیریت —
 * همه‌ی درخواست‌ها از همین تابع عبور می‌کنند تا خطاها و ۴۰۱ یکدست مدیریت شوند.
 */

/** نام رویداد سراسری «دسترسی غیرمجاز» */
export const UNAUTHORIZED_EVENT = "avid:unauthorized";

/** خطای API همراه با وضعیت HTTP */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  const data: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    // نشست منقضی شده: رویداد سراسری صادر می‌شود تا ریشه‌ی پنل کاربر را به صفحه ورود برگرداند
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    const message =
      (data as { error?: string } | null)?.error ?? "خطای ناشناخته رخ داد.";
    throw new ApiError(message, res.status);
  }

  return data as T;
}

/**
 * نمایش خطای API با توست — خطاهای ۴۰۱ توسط شنونده‌ی سراسری
 * (در super-admin) مدیریت می‌شوند و دوباره توست نمی‌خورند.
 */
export function toastApiError(error: unknown): void {
  if (error instanceof ApiError && error.status === 401) return;
  if (error instanceof ApiError) {
    toast.error(error.message);
    return;
  }
  toast.error("خطای ناشناخته رخ داد. لطفاً دوباره تلاش کنید.");
}
