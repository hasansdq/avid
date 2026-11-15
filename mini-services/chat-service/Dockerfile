# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# سرویس رله‌ی چت (Socket.IO) آوید — جدا از اپ Next.js اجرا می‌شود
# (پشت پروکسی Apache/nginx دامنه روی مسیر /socket.io/)
#
# مرحله‌ی «check»: بررسی TypeScript سرویس چت — جدا از بررسی TS اپ Next.js
# (اپ اصلی mini-services را از tsconfig خود خارج کرده است).
#   توجه: web-dev-supervisor.ts هم به این مرحله کپی می‌شود — index.ts آن را
#   به‌صورت پوی (فقط در محیط توسعه) بارگذاری می‌کند و tsc برای تایپ‌چکِ
#   ایمپورتِ پوی به خودِ فایل نیاز دارد؛ نبودش در مرحله‌ی check، بیلد را
#   با «Cannot find module './web-dev-supervisor'» می‌شکست.
# مرحله‌ی «runner»: فقط وابستگی‌های production + فایل‌های سرویس.
#
# در «runner» عمداً فقط index.ts و healthcheck.ts کپی می‌شوند —
# web-dev-supervisor.ts فقط مخصوص سندباکس توسعه است؛ index.ts آن را فقط در
# محیط توسعه (غیر production) و به‌صورت پوی بارگذاری می‌کند و در production
# هرگز به دنبالش نمی‌رود (NODE_ENV=production در compose ست می‌شود).
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.14 AS check
WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
COPY index.ts healthcheck.ts web-dev-supervisor.ts ./
RUN bun install --frozen-lockfile \
 && bun run typecheck

FROM oven/bun:1.3.14 AS runner
ENV NODE_ENV=production \
    TZ=Asia/Tehran \
    CHAT_PORT=3004
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY index.ts healthcheck.ts ./
RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun
EXPOSE 3004
CMD ["bun", "index.ts"]
