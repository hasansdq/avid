"use client";

import { useState } from "react";
import Image from "next/image";
import { GraduationCap } from "lucide-react";

/**
 * لوگوی آوید — تصویر /images/logo.png با جایگزین کاشی گرادیانی
 * (در صورت نبود یا خطای بارگذاری تصویر).
 */
export function LogoMark({
  className = "size-14",
  iconClassName = "size-7",
}: {
  className?: string;
  iconClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={`flex items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/25 ${className}`}
      >
        <GraduationCap
          className={`${iconClassName} text-teal-950`}
          strokeWidth={1.9}
        />
      </span>
    );
  }

  return (
    <Image
      src="/images/logo.png"
      alt="لوگوی آوید"
      width={56}
      height={56}
      onError={() => setFailed(true)}
      className={`${className} shrink-0 rounded-2xl object-cover`}
    />
  );
}
