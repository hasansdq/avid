import type { LucideIcon } from "lucide-react";
import type * as React from "react";

/** حالت خالی/بدون داده برای ماژول‌ها (با دکمه‌ی اختیاری) */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="glass flex flex-col items-center justify-center gap-3 rounded-2xl px-6 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-foreground/[0.04]">
        <Icon className="size-7 text-muted-foreground" strokeWidth={1.8} />
      </span>
      <p className="text-sm font-black text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}
