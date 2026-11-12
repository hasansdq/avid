# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# آوید — ایمیج اپلیکیشن Next.js (خروجی standalone)
# مراحل: deps → build → (tools برای عملیات migrate/bootstrap/backup) → runner
# ---------------------------------------------------------------------------
ARG BUN_IMAGE=oven/bun:1.3.14

# ———————————————————— ۱) نصب وابستگی‌ها ————————————————————
FROM ${BUN_IMAGE} AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ———————————————————— ۲) بیلد پروداکشن ————————————————————
FROM ${BUN_IMAGE} AS build
ARG NEXT_PUBLIC_SOCKET_URI="/"
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SOCKET_URI=${NEXT_PUBLIC_SOCKET_URI} \
    DATABASE_URL="file:/tmp/avid-build.db"
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate \
 && bun run build \
 && (mkdir -p .next/standalone/node_modules && \
     cp -r node_modules/sharp .next/standalone/node_modules/ 2>/dev/null || true) \
 && (cp -r node_modules/@img .next/standalone/node_modules/ 2>/dev/null || true)

# ———————————————————— ۳) ابزارهای عملیات ————————————————————
# فقط برای سرویس «migrate» در compose (مهاجرت/بوت‌استرپ/بکاپ/بازیابی)
FROM ${BUN_IMAGE} AS tools
ENV NODE_ENV=production \
    TZ=Asia/Tehran
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json ./
COPY prisma ./prisma
COPY scripts ./scripts
RUN bunx prisma generate \
 && mkdir -p /app/data /app/backups \
 && chown -R bun:bun /app
USER bun

# ———————————————————— ۴) اجرای اپ ————————————————————
FROM ${BUN_IMAGE} AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Tehran
WORKDIR /app
COPY --from=build /app/.next/standalone ./
# فایل‌های استاتیک public/ (favicon، تصاویر نمونه‌ی دوره‌ها و…) — خروجی
# standalone آن‌ها را شامل نمی‌شود؛ بدون این کپی هیچ فایلی از public/ سرو
# نمی‌شود. والی avid_uploads روی /app/public/uploads سوار می‌شود و بار
# نخست با همین فایل‌های نمونه پر می‌شود؛ فایل‌های آپلودیِ تازه هم در همان
# مسیر نوشته و «در زمان اجرا» از همان URL سرو می‌شوند (ماندگار پس از
# بازسازی کانتینر).
COPY --from=build /app/public ./public
RUN mkdir -p /app/data /app/public/uploads \
 && chown -R bun:bun /app
COPY --from=build /app/scripts/healthcheck.ts /app/scripts/healthcheck.ts
USER bun
EXPOSE 3000
CMD ["bun", "server.js"]
