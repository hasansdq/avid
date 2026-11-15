/**
 * بوت‌استرپ مدیر — اجرا در ابتدای استقرار (سرویس migrate در compose):
 *
 *  ۱) اگر هیچ مدیری وجود ندارد: ساخت مدیر با ADMIN_USERNAME و
 *     ADMIN_INITIAL_PASSWORD (یا رمز تصادفی + چاپ یک‌باره در لاگ).
 *  ۲) ADMIN_FORCE_RESET=1: بازنشانی رمز مدیر به ADMIN_INITIAL_PASSWORD
 *     و ابطال همه‌ی نشست‌ها (بازیابی دسترسی مدیر فراموش‌شده).
 *  ۳) فعال‌سازی WAL برای همزمانی بهتر خواندن/نوشتن (وب + سرویس چت).
 *
 * اجرا:  bun scripts/bootstrap.ts
 */
import { randomBytes, scryptSync } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** فرمت هش رمز — همان قرارداد src/lib/auth.ts (salt:scrypt-hex) */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const MIN_PASSWORD = 8;

function randPassword(): string {
  return randomBytes(12).toString("hex");
}

async function main() {
  // — WAL: چندپردازشی بهتر (سرویس چت فقط می‌خواند، وب می‌نویسد) —
  try {
    await prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL;");
  } catch {
    console.warn("bootstrap: WAL در دسترس نیست — با journal پیش‌فرض ادامه می‌دهیم");
  }

  // — رکوردهای یگانه‌ی تنظیمات — در نصب تازه ساخته می‌شوند تا ماژول‌های
  // پنل (تنظیمات سایت، هدر/فوتر، فونت‌ها…) هرگز به رکورد خالی بربخورند —
  const singletons = [
    ["SiteSettings", () => prisma.siteSettings.upsert({ where: { id: "main" }, create: {}, update: {} })],
    ["PaymentSettings", () => prisma.paymentSettings.upsert({ where: { id: "main" }, create: {}, update: {} })],
    ["SmsSettings", () => prisma.smsSettings.upsert({ where: { id: "main" }, create: {}, update: {} })],
    ["ChatSettings", () => prisma.chatSettings.upsert({ where: { id: "main" }, create: {}, update: {} })],
  ] as const;
  for (const [name, run] of singletons) {
    try {
      await run();
    } catch {
      console.warn(`bootstrap: ساخت رکورد ${name} ممکن نشد — در اولین فراخوانی API خودش ساخته می‌شود`);
    }
  }

  const username = (process.env.ADMIN_USERNAME || "admin").trim();
  const password = process.env.ADMIN_INITIAL_PASSWORD?.trim() || "";
  const forceReset = process.env.ADMIN_FORCE_RESET === "1";

  const existing = await prisma.adminUser.findFirst({
    orderBy: { createdAt: "asc" },
  });

  // — حالت ۱: دیتابیس خالی — ساخت مدیر —
  if (!existing) {
    let chosen = password;
    let generated = false;
    if (chosen.length < MIN_PASSWORD) {
      chosen = randPassword();
      generated = true;
    }
    const created = await prisma.adminUser.create({
      data: { username, passwordHash: hashPassword(chosen) },
    });
    console.log(`✔ مدیر «${created.username}» ساخته شد.`);
    if (generated) {
      console.warn(
        "⚠ ADMIN_INITIAL_PASSWORD تنظیم نشده/کوتاه بود؛ این رمز تصادفی را ذخیره کنید:"
      );
      console.warn(`  ${chosen}`);
      console.warn("  و بعد از ورود، آن را از ماژول «حساب و امنیت» عوض کنید.");
    }
    return;
  }

  // — حالت ۲: بازیابی دسترسی با ADMIN_FORCE_RESET=1 —
  if (forceReset) {
    if (password.length < MIN_PASSWORD) {
      console.warn(
        "ADMIN_FORCE_RESET=1 است اما ADMIN_INITIAL_PASSWORD حداقل ۸ نویسه نیست؛ بازنشانی انجام نشد."
      );
      return;
    }
    await prisma.adminUser.update({
      where: { id: existing.id },
      data: { passwordHash: hashPassword(password) },
    });
    const revoked = await prisma.adminSession.deleteMany({
      where: { adminId: existing.id },
    });
    console.log(
      `✔ رمز مدیر «${existing.username}» بازنشانی شد و ${revoked.count} نشست باطل گردید.`
    );
    return;
  }

  console.log(`مدیر «${existing.username}» از قبل وجود دارد — تغییری لازم نیست.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
