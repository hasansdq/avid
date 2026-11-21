#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# آوید — بازیابی دیتابیس از پشتیبان (سایت موقتاً می‌ایستد)
#
# استفاده:
#   bash deploy/restore.sh avid-20260101-120000.db
#
# فایل بکاپ داخل والی avid_backups قرار دارد (فقط نام فایل کافی است).
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FILE="${1:-}"
if [ -z "$FILE" ]; then
  echo "استفاده: bash deploy/restore.sh <نام-فایل-بکاپ.db>"
  echo "نام‌های موجود:"
  docker compose run --rm migrate sh -c 'ls -1 /app/backups/*.db 2>/dev/null | tail -n 10' || true
  exit 1
fi

echo "— توقف سرویس‌ها (وب و چت و استریم) …"
docker compose stop web chat stream

echo "— بازیابی $FILE …"
docker compose run --rm -e RESTORE_DB="/app/backups/$FILE" migrate bun scripts/restore.ts

echo "— بالا آوردن سرویس‌ها …"
docker compose up -d
echo "✔ بازیابی کامل شد."
