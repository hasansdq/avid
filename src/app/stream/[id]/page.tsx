import type { Metadata } from "next";
import { DEFAULT_SETTINGS } from "@/lib/default-settings";
import { StreamRoomClient } from "@/components/stream/stream-room-client";
import { findStreamByRef } from "@/lib/streams";

/**
 * صفحه‌ی کلاس آنلاین — /stream/{id}
 *
 * {id} هم شناسه‌ی واقعی استریم است و هم «لینک دعوت» یکتای آن (inviteSlug
 * جلسات استاد) — هر دو به همین صفحه می‌رسند. نقش بیننده (استاد/دانشجو)
 * سمت کلاینت از /api/streams/{id} تعیین می‌شود؛ احراز هویت نهایی عضویت
 * اتاق در سرویس سیگنالینگ (mini-services/stream-service) با همان کوکی‌ها
 * انجام می‌شود.
 */

type PageProps = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const stream = await findStreamByRef(id).catch(() => null);

  return {
    title: stream
      ? `کلاس آنلاین ${stream.title} | ${DEFAULT_SETTINGS.siteName}`
      : `کلاس آنلاین | ${DEFAULT_SETTINGS.siteName}`,
    description: "کلاس آنلاین (استریم) با تصویر و صدای استاد، چت و اشتراک صفحه.",
    robots: { index: false, follow: false },
  };
}

export default async function StreamRoomRoute({ params }: PageProps) {
  const { id } = await params;
  return <StreamRoomClient streamId={id} />;
}
