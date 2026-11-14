"use client";

import { Switch } from "@/components/ui/switch";

/**
 * کلید وضعیت انتشار — برای استفاده در ردیف جدول‌ها.
 * روشن = «منتشر شده» (در سایت قابل مشاهده) · خاموش = «پیش‌نویس» (فقط پنل مدیر).
 */
export function PublishSwitch({
  published,
  onToggle,
  disabled = false,
}: {
  published: boolean;
  onToggle: (next: boolean) => void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={published}
        onCheckedChange={onToggle}
        disabled={disabled}
        aria-label={published ? "منتشر شده" : "پیش‌نویس"}
      />
      <span
        className={`hidden text-[0.65rem] font-bold whitespace-nowrap lg:inline ${
          published ? "text-teal-600 dark:text-teal-300" : "text-muted-foreground"
        }`}
      >
        {published ? "منتشر شده" : "پیش‌نویس"}
      </span>
    </div>
  );
}
