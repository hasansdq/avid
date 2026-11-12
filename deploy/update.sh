#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# آوید — به‌روزرسانی غیرمخرب روی VPS
#
# استفاده (داخل پوشه‌ی پروژه):
#   bash deploy/update.sh
#
# گام‌ها: پشتیبان → بیلد ایمیج‌های نو → مهاجرت Prisma (migrate deploy؛
# بدون حذف داده) → بالا آوردن سرویس‌ها → پاک‌سازی ایمیج‌های قدیمی.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "— ۱/۵ پشتیبان‌گیری پیش از تغییر …"
bash deploy/backup.sh

echo "— ۲/۵ بیلد ایمیج‌های جدید …"
docker compose build

echo "— ۳/۵ مهاجرت غیرمخرب دیتابیس (migrate.ts: بکاپ → تطابق ساختار → deploy/baseline) …"
docker compose run --rm migrate

echo "— ۴/۵ بالا آوردن سرویس‌ها …"
docker compose up -d

echo "— ۵/۵ پاک‌سازی ایمیج‌های بدون استفاده …"
docker image prune -f

docker compose ps
echo "✔ به‌روزرسانی کامل شد."
