"use client";

import { Switch } from "@/components/ui/switch";

/** کلید انتشار/نمایش در سایت — برای استفاده در ردیف جدول‌ها */
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
        aria-label={published ? "فعال" : "غیرفعال"}
      />
      <span
        className={`hidden text-[0.65rem] font-bold whitespace-nowrap lg:inline ${
          published ? "text-teal-600 dark:text-teal-300" : "text-muted-foreground"
        }`}
      >
        {published ? "فعال" : "غیرفعال"}
      </span>
    </div>
  );
}
