"use client";

import { createContext, useContext } from "react";

/**
 * بافت آدرس API بارگذاری فایل — اجازه‌ی هم‌کارکردن فیلدهای آپلود مشترک
 * (تصویر/ویدئو) در دو نشست مختلف:
 *  • پنل مدیریت → پیش‌فرض «/api/admin/upload» (کوکی avid_admin)
 *  • پنل استاد  → با Provider روی «/api/teacher/upload» (کوکی avid_user)
 *
 * فیلدها بدون Provider هم کار می‌کنند (پیش‌فرض ادمین) تا رفتار بخش‌های
 * موجود مدیریت تغییر نکند.
 */
export const UploadUrlContext = createContext<string>("/api/admin/upload");

/** آدرس API بارگذاری فعال — بافت یا پیش‌فرض مدیریت */
export function useUploadUrl(): string {
  return useContext(UploadUrlContext);
}
