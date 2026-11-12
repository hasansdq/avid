#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# آوید — پشتیبان‌گیری (غیرمخرب و آنلاین) از دیتابیس + آپلودها
#
# استفاده (روی VPS، داخل پوشه‌ی پروژه):
#   bash deploy/backup.sh
#
# خروجی: والی avid_backups ← /var/lib/docker/volumes/avid_avid_backups/_data
# نگهداری آخرین ۱۴ نسخه‌ی دیتابیس (BACKUP_KEEP در .env قابل تغییر است).
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "— پشتیبان دیتابیس (VACUUM INTO — بدون توقف سایت) …"
docker compose run --rm migrate bun scripts/backup.ts

echo "— پشتیبان فایل‌های آپلودی …"
docker compose run --rm migrate sh -c '
  set -e
  cd /app/uploads
  tar czf /app/backups/uploads-'"$(date +%Y%m%d-%H%M%S)"'.tar.gz .
  ls -1t /app/backups/uploads-*.tar.gz 2>/dev/null | tail -n +5 | xargs -r rm -f
'

echo "✔ پشتیبان‌گیری کامل شد. فهرست:"
docker compose run --rm migrate sh -c 'ls -lh /app/backups | tail -n 8'
