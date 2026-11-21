import type { Metadata } from "next";
import { db } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/default-settings";
import type { SiteSettings } from "@prisma/client";
import { ClassJoinPage, type JoinClassInfo } from "@/components/site/class-join-page";
import { ChatWidget } from "@/components/chat/chat-widget";

/**
 * صفحه‌ی لینک دعوت کلاس — /join/{inviteSlug}
 *
 * کاربر با کلیک روی لینک دعوت کلاس به این صفحه می‌رسد؛ فرم ثبت‌نام (تایید
 * شماره موبایل و مشخصات برای شماره‌های جدید) را پر می‌کند و عضو کلاس
 * می‌شود. کلاس‌ها با شناسه‌ی یکتای لینک دعوت جست‌وجو می‌شوند — پس از تغییر
 * لینک توسط مدیر، لینک قبلی معتبر نیست.
 */

type PageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const classRoom = await db.classRoom
    .findUnique({ where: { inviteSlug: slug }, select: { title: true } })
    .catch(() => null);

  return {
    title: classRoom
      ? `عضویت در کلاس ${classRoom.title} | ${DEFAULT_SETTINGS.siteName}`
      : `دعوت به کلاس | ${DEFAULT_SETTINGS.siteName}`,
    description: classRoom
      ? `ثبت‌نام و عضویت در کلاس «${classRoom.title}» — با تایید شماره موبایل از طریق لینک دعوت.`
      : "صفحه‌ی دعوت عضویت در کلاس.",
    robots: { index: false, follow: false },
  };
}

export default async function JoinClassRoute({ params }: PageProps) {
  const { slug } = await params;

  const [classRoom, settingsRow] = await Promise.all([
    db.classRoom
      .findUnique({
        where: { inviteSlug: slug },
        include: { _count: { select: { members: true } } },
      })
      .catch(() => null),
    db.siteSettings.findUnique({ where: { id: "main" } }),
  ]);

  const settings: SiteSettings = settingsRow ?? DEFAULT_SETTINGS;

  const classInfo: JoinClassInfo | null = classRoom
    ? {
        slug: classRoom.inviteSlug,
        title: classRoom.title,
        description: classRoom.description,
        membersCount: classRoom._count.members,
      }
    : null;

  return (
    <>
      <ClassJoinPage classInfo={classInfo} settings={settings} />
      {/* ویجت چت پشتیبانی — دکمه‌ی ثابت پایین-چپ در همه‌ی صفحات */}
      <ChatWidget />
    </>
  );
}
