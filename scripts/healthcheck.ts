/**
 * بررسی سلامت سرویس — استفاده در healthcheck کانتینر:
 *   bun scripts/healthcheck.ts <URL>
 * کد خروج ۰ = پاسخ ۲xx، غیر از آن = ناسالم.
 */
export {}; // ماژول مستقل برای await سطح بالا

const url = process.argv[2];
if (!url) {
  console.error("usage: bun scripts/healthcheck.ts <url>");
  process.exit(2);
}
try {
  const res = await fetch(url, { redirect: "manual" });
  process.exit(res.ok ? 0 : 1);
} catch {
  process.exit(1);
}
