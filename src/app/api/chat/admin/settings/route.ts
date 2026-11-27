import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getChatSettings, parseChatAvatarMode, parseChatWelcomeAutoHideSeconds, CHAT_WELCOME_AUTOHIDE_MIN, CHAT_WELCOME_AUTOHIDE_MAX } from "@/lib/chat";

/** GET /api/chat/admin/settings — تنظیمات چت‌بات */
export async function GET(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const settings = await getChatSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("chat settings GET error:", error);
    return NextResponse.json(
      { error: "خطا در دریافت تنظیمات چت." },
      { status: 500 }
    );
  }
}

/** PUT /api/chat/admin/settings — ذخیره‌ی تنظیمات چت‌بات */
export async function PUT(req: NextRequest) {
  const { denial } = await requireAdmin(req);
  if (denial) return denial;

  try {
    const body = await req.json().catch(() => null);

    const botName =
      typeof body?.botName === "string" ? body.botName.trim() : "";
    const botTitle =
      typeof body?.botTitle === "string" ? body.botTitle.trim() : "";
    const botAvatar =
      typeof body?.botAvatar === "string" ? body.botAvatar.trim() : "";
    const welcomeMessage =
      typeof body?.welcomeMessage === "string"
        ? body.welcomeMessage.trim()
        : "";

    if (!botName) return NextResponse.json({ error: "نام چت‌بات را وارد کنید." }, { status: 400 });
    if (botName.length > 60)
      return NextResponse.json({ error: "نام چت‌بات حداکثر ۶۰ کاراکتر است." }, { status: 400 });
    if (botTitle.length > 80)
      return NextResponse.json({ error: "عنوان چت‌بات حداکثر ۸۰ کاراکتر است." }, { status: 400 });
    if (!welcomeMessage)
      return NextResponse.json({ error: "پیام خوش‌آمدگویی را وارد کنید." }, { status: 400 });
    if (welcomeMessage.length > 1000)
      return NextResponse.json(
        { error: "پیام خوش‌آمدگویی حداکثر ۱۰۰۰ کاراکتر است." },
        { status: 400 }
      );
    if (botAvatar.length > 500)
      return NextResponse.json({ error: "آدرس تصویر خیلی طولانی است." }, { status: 400 });

    // مطمئ شویم رکورد وجود دارد
    const current = await getChatSettings();

    // ثانیه‌های مخفی‌شدن خودکار حباب خوش‌آمدگویی —
    // ارسال‌نشده = حفظ مقدار فعلی؛ ۰ = بدون مخفی‌شدن خودکار
    let welcomeAutoHideSeconds: number;
    if ("welcomeAutoHideSeconds" in (body ?? {})) {
      const parsed = parseChatWelcomeAutoHideSeconds(
        body?.welcomeAutoHideSeconds
      );
      if (parsed === null) {
        return NextResponse.json(
          {
            error:
              `ثانیه‌های مخفی‌شدن خودکار حباب خوش‌آمدگویی باید بین ` +
              `${CHAT_WELCOME_AUTOHIDE_MIN} تا ${CHAT_WELCOME_AUTOHIDE_MAX} ` +
              `باشد (۰ = بدون مخفی‌شدن خودکار).`,
          },
          { status: 400 }
        );
      }
      welcomeAutoHideSeconds = parsed;
    } else {
      welcomeAutoHideSeconds = current.welcomeAutoHideSeconds;
    }

    const settings = await db.chatSettings.update({
      where: { id: "main" },
      data: {
        botName,
        botTitle,
        botAvatar,
        // نحوه‌ی نمایش تصویر پروفایل چت‌بات — دایره‌ای (circle) یا دلخواه (custom)؛
        // مقدار نامعتبر با اعتبارسنجی به دایره‌ای برمی‌گردد
        botAvatarMode: parseChatAvatarMode(body?.botAvatarMode),
        welcomeMessage,
        autoOpen: body?.autoOpen === true,
        welcomeAutoHideSeconds,
        isActive: body?.isActive === true,
      },
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("chat settings PUT error:", error);
    return NextResponse.json(
      { error: "خطا در ذخیره تنظیمات چت. لطفاً دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}
