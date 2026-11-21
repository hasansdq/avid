# ---------------------------------------------------------------------------
# سرویس کلاس آنلاین (استریم) آوید — سیگنالینگ WebRTC + اتاق چت socket.io
# (جدا از اپ Next.js اجرا می‌شود؛ پشت پروکسی Apache/nginx روی /stream-socket/)
#
# مرحله‌ی «check»: بررسی TypeScript سرویس — جدا از tsc اپ Next.js.
# مرحله‌ی «runner»: فقط وابستگی‌های production + فایل‌های سرویس.
#
# سرویس دیتابیس را فقط‌خواندنی باز می‌کند (احراز هویت کوکی‌ها و بررسی دعوت)؛
# همه‌ی نوشتارها از طریق API اپ Next.js انجام می‌شود.
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.14 AS check
WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
COPY index.ts healthcheck.ts ./
RUN bun install --frozen-lockfile \
 && bun run typecheck

FROM oven/bun:1.3.14 AS runner
ENV NODE_ENV=production \
    TZ=Asia/Tehran \
    STREAM_PORT=3005
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY index.ts healthcheck.ts ./
RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun
EXPOSE 3005
CMD ["bun", "index.ts"]
