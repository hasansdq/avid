import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * ناظر سرور توسعه‌ی وب — مخصوص سندباکس توسعه.
 *
 * چرا این وجود دارد؟ در سندباکس، سرویس‌ها فقط از بوتِ پلتفرم زنده می‌مانند؛
 * اگر سرور توسعه‌ی Next.js (پورت 3000) بسته شود، هیچ سازوکار بازیابی وجود
 * ندارد و پیش‌نمایش کاربر خاموش می‌ماند. سرویس چت (که همیشه از بوت در
 * پس‌زمینه اجرا می‌شود) این ناظر را میزبانی می‌کند تا سلامت وب را هر چند
 * ثانیه بررسی و در صورت خاموشی، `bun run dev` را دوباره بالا بیاورد.
 *
 * گیت‌های دوسو (در استقرار Docker/VPS عملاً بی‌اثر است):
 *  • NODE_ENV=production → غیرفعال (کانتینر chat در compose همین را ست می‌کند)
 *  • پوشه‌ی «.zscripts» باید در ریشه‌ی پروژه باشد — فقط در سندباکس توسعه
 *    وجود دارد (از آرشیو استقرار حذف می‌شود)
 *  • AVID_WEB_SUPERVISOR=0 → غیرفعال‌سازی دستی اضطراری
 *  • فایل /tmp/avid-web-supervisor-paused → توقف موقت (برای آزمون‌هایی که
 *    باید خودشان سرور را با پیکربندی ویژه بالا بیاورند)
 *
 * منطق: بررسی سلامت (/api/health) → اگر ناسالم و از آخرین تلاش بیشتر از
 * زمان مهلت گذشته باشد، سرور دوباره راه‌اندازی می‌شود. به‌جای ردیابی فرزند
 * (که پس از SIGKILL رویداد exit قابل‌اعتماد نیست)، فقط بر زمان تکیه می‌کنیم؛
 * اگر سرور قبلی هنوز پورت را نگه داشته باشد، تلاش جدید بی‌ضرر شکست می‌خورد.
 */

const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const HEALTH_URL = "http://127.0.0.1:3000/api/health";
const PAUSE_FILE = "/tmp/avid-web-supervisor-paused";
const SANDBOX_MARKER = join(PROJECT_ROOT, ".zscripts");
const CHECK_INTERVAL_MS = 10_000;
const RESPAWN_COOLDOWN_MS = 20_000;

export function startWebDevSupervisor(): void {
  if (process.env.NODE_ENV === "production") return;
  if (process.env.AVID_WEB_SUPERVISOR === "0") return;
  if (!existsSync(SANDBOX_MARKER)) return;

  // با بارگذاری مجدد (bun --hot)، تایمر قبلی حذف و تایمر تازه ساخته می‌شود
  // (روی globalThis تا در همه‌ی نسخه‌های ماژول مشترک باشد)
  const g = globalThis as {
    __avidWebSupervisorTimer?: ReturnType<typeof setInterval>;
  };
  if (g.__avidWebSupervisorTimer) {
    clearInterval(g.__avidWebSupervisorTimer);
  }

  let lastSpawnAt = 0;

  async function healthy(): Promise<boolean> {
    try {
      const res = await fetch(HEALTH_URL, {
        signal: AbortSignal.timeout(2500),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function tick(): Promise<void> {
    if (existsSync(PAUSE_FILE)) return; // توقف موقت خواسته‌شده
    if (await healthy()) return;
    if (Date.now() - lastSpawnAt < RESPAWN_COOLDOWN_MS) return;
    lastSpawnAt = Date.now();
    console.log(
      "[web-dev-supervisor] سرور وب (پورت 3000) خاموش است — راه‌اندازی مجدد..."
    );
    const child = spawn("bun", ["run", "dev"], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();
    // رویداد exit فقط برای لاگ؛ منطق روی زمان است تا پس از SIGKILL گیر نکند
    child.on("exit", (code) => {
      if (code !== null && code !== 0) {
        console.log(
          `[web-dev-supervisor] فرزند با کد ${code} خارج شد (پورت اشغال یا خطای بوت)`
        );
      }
    });
  }

  g.__avidWebSupervisorTimer = setInterval(() => {
    void tick().catch((error) => {
      console.error("[web-dev-supervisor] tick error:", error);
    });
  }, CHECK_INTERVAL_MS);
  void tick().catch(() => {
    /* بی‌صدا — خطا در حلقه‌ی بعدی دوباره بررسی می‌شود */
  });

  console.log(
    "[web-dev-supervisor] فعال — سلامت وب (پورت 3000) هر ۱۰ ثانیه بررسی می‌شود"
  );
}
