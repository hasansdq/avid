/**
 * ساخت آیکون‌های وب‌اپلیکیشن (PWA) از لوگوی سایت — اجرا: bun scripts/make-pwa-icons.ts
 *
 *  • icon-192 / icon-512 — آیکون‌های عمومی مانیفست
 *  • maskable-512 — نسخه‌ی ماسکابل: لوگو در ناحیه‌ی امن ۸۰٪ روی زمینه‌ی برند
 *  • apple-touch-icon — ۱۸۰px برای «افزودن به صفحه اصلی» iOS (زمینه‌ی پر)
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "public", "images", "logo.png");
const OUT_DIR = join(ROOT, "public", "images", "icons");

const BRAND_BG = "#052e28"; // سبز-تیل عمیق برند (روشن‌تر از پس‌زمینه‌ی تیره)

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const src = sharp(SRC);
  const meta = await src.metadata();
  console.log(`logo: ${meta.width}x${meta.height}`);

  // — آیکون‌های معمولی (فقط تغییر اندازه) —
  await sharp(SRC).resize(192, 192, { fit: "contain" }).png().toFile(join(OUT_DIR, "icon-192.png"));
  await sharp(SRC).resize(512, 512, { fit: "contain" }).png().toFile(join(OUT_DIR, "icon-512.png"));

  // — ماسکابل: زمینه‌ی برند + لوگو در ناحیه‌ی امن ۷۸٪ —
  const maskable = async (size: number) =>
    sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: BRAND_BG,
      },
    })
      .composite([
        {
          input: await sharp(SRC)
            .resize(Math.round(size * 0.78), Math.round(size * 0.78), { fit: "contain" })
            .png()
            .toBuffer(),
          gravity: "center",
        },
      ])
      .png()
      .toFile(join(OUT_DIR, `maskable-${size}.png`));

  await maskable(192);
  await maskable(512);

  // — آیکون اپل (۱۸۰): زمینه‌ی برند + لوگو ۸۴٪ —
  await sharp({
    create: { width: 180, height: 180, channels: 4, background: BRAND_BG },
  })
    .composite([
      {
        input: await sharp(SRC)
          .resize(152, 152, { fit: "contain" })
          .png()
          .toBuffer(),
        gravity: "center",
      },
    ])
    .png()
    .toFile(join(OUT_DIR, "apple-touch-icon.png"));

  console.log("✔ PWA icons generated in public/images/icons/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
