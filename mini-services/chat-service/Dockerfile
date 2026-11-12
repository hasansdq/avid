# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# سرویس رله‌ی چت (Socket.IO) آوید — جدا از اپ Next.js اجرا می‌شود
# (پشت پروکسی Apache/nginx دامنه روی مسیر /socket.io/)
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.14
ENV NODE_ENV=production \
    TZ=Asia/Tehran \
    CHAT_PORT=3004
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY index.ts healthcheck.ts ./
RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun
EXPOSE 3004
CMD ["bun", "index.ts"]
