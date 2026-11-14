#!/usr/bin/env bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker compose config --quiet
echo "— ساخت ایمیج جدید در زمان اجرای نسخه فعلی …"
docker compose build

echo "— توقف وب و چت برای ثبت بکاپ سازگار …"
docker compose stop web chat
bash deploy/backup.sh

echo "— اجرای مهاجرت و انتظار برای سلامت سرویس‌ها …"
if ! docker compose up -d --wait --wait-timeout 180; then
  docker compose ps -a
  echo "راه‌اندازی کامل نشد. لاگ migrate، web و chat و بکاپ را بررسی کنید." >&2
  exit 1
fi
docker compose ps -a
