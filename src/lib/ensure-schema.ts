/**
 * پوسته‌ی سمت اپ برای خودترمیمی اسکیما —
 * پیاده‌سازی واقعی در scripts/ensure-schema.ts است تا سرویس migrate
 * (اجرای bun در tools image) و بوتِ اپ (src/instrumentation.ts) از یک
 * منبعِ واحد استفاده کنند. ابزار بیلد Next این ماژول را داخل باندل
 * استاندالون قرار می‌دهد و در زمان اجرا فقط prisma/baseline.sql از
 * دیسک خوانده می‌شود (در Dockerfile مرحله‌ی runner کپی می‌شود).
 */
export {
  ensureSchema,
  ensureSchemaOnBoot,
} from "../../scripts/ensure-schema";
