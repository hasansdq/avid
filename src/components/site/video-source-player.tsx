"use client";

import * as React from "react";
import { VideoOff } from "lucide-react";
import { VideoPlayer } from "@/components/site/video-player";
import { resolveVideoSource } from "@/lib/video";

/**
 * پخش‌کننده‌ی یکسان برای همه‌ی انواع منبع ویدئو —
 * در بخش ویدئوهای صفحه اصلی و صفحه‌ی /videos مشترک است:
 *
 *  • local  → پلیر اختصاصی آوید (فایل آپلودی)
 *  • direct → پلیر اختصاصی آوید (لینک مستقیم MP4/WebM/… خارجی)
 *  • youtube / aparat / vimeo → iframe امبد استاندارد
 *  • none   → حالت «به‌زودی فعال می‌شود»
 */
export function VideoSourcePlayer({
  url,
  title,
  poster,
  autoPlay = false,
  onEnded,
  className,
}: {
  /** لینک پخش — هر فرمت پشتیبانی‌شده */
  url: string;
  /** عنوان ویدئو — برای ARIA پلیر/iframe */
  title?: string;
  /** تصویر کاور (فقط برای پلیر اختصاصی) */
  poster?: string;
  autoPlay?: boolean;
  onEnded?: () => void;
  className?: string;
}) {
  const source = resolveVideoSource(url);

  if (source.kind === "local" || source.kind === "direct") {
    return (
      <VideoPlayer
        src={source.src ?? url}
        poster={poster}
        title={title}
        autoPlay={autoPlay}
        onEnded={onEnded}
        className={className}
      />
    );
  }

  if (source.embedUrl) {
    return (
      <div className="aspect-video w-full bg-black">
        <iframe
          src={source.embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="size-full"
        />
      </div>
    );
  }

  return <VideoComingSoon />;
}

/** حالت ویدئوی بدون لینک پخش — «به‌زودی فعال می‌شود» */
export function VideoComingSoon() {
  return (
    <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-teal-500/15 to-violet-500/15 dark:from-teal-500/25 dark:via-[#07100d] dark:to-violet-500/25">
      <span className="flex size-16 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-md">
        <VideoOff className="size-8 text-white/90" />
      </span>
      <p className="text-sm font-black text-white/90">به‌زودی فعال می‌شود</p>
    </div>
  );
}
