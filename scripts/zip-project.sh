#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# ساخت آرشیو ZIP از آخرین نسخه‌ی پروژه «آوید» — آماده‌ی استقرار روی VPS.
#
# امنیت:
#   • .env واقعی هرگز وارد آرشیو نمی‌شود (فقط .env.example)
#   • دیتابیس توسعه (db/custom.db) با همه‌ی هش‌ها/کلیدها حذف می‌شود —
#     روی VPS دیتابیس تازه با migrate + bootstrap ساخته می‌شود
#   • پوشه‌های سندباکس/پلتفرم (skills, .zscripts, examples و…) حذف می‌شوند
#
# سیاست پوشه‌ی تحویل:
#   • download/ و public/Download/ بعد از هر اجرا «فقط و فقط» شامل
#     آخرین نسخه‌ی ریپو (avid-latest.zip) هستند — هر فایل قدیمی
#     (ZIP تاریخ‌دار، README، TEST-RESULTS و…) به‌طور خودکار حذف می‌شود.
#
# استفاده:  bash scripts/zip-project.sh
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/public/Download"
DL_DIR="$ROOT/download"
OUT="$OUT_DIR/avid-latest.zip"
STAGE="$ROOT/.zip-stage"

mkdir -p "$OUT_DIR" "$DL_DIR"

# پاک‌سازی مرحله‌ی قبلی
rm -rf "$STAGE"
mkdir -p "$STAGE/avid"

# فهرست استثناها — چیزهایی که به آرشیو استقرار تعلق ندارند.
# توجه: الگوهای rsync بدون «/» ابتدایی در «هر عمقی» اعمال می‌شوند و
# به‌طور تصادفی مسیرهای درون سورس را هم حذف می‌کردند (مثل
# src/app/api/admin/upload/)؛ بنابراین همه به ریشه‌ی پروژه لنگر شده‌اند
# و فقط node_modules (در هر عمق) سراسری حذف می‌شود.
rsync -a --delete \
  --include='.env.example' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude 'node_modules' \
  --exclude '/.next' \
  --exclude '/.next-prod' \
  --exclude '/.git' \
  --exclude '/.zip-stage' \
  --exclude '/.research' \
  --exclude '/.smoke' \
  --exclude '/.zscripts' \
  --exclude '/db' \
  --exclude '*.db' \
  --exclude '*.db-journal' \
  --exclude '*.db-wal' \
  --exclude '*.db-shm' \
  --exclude 'dev.log' \
  --exclude 'server.log' \
  --exclude '*.log' \
  --exclude '*.tsbuildinfo' \
  --exclude '/tool-results' \
  --exclude '/upload' \
  --exclude '/agent-ctx' \
  --exclude '/public/Download' \
  --exclude '/download' \
  --exclude '/screenshots' \
  --exclude '/skills' \
  --exclude '/examples' \
  --exclude '/tests' \
  --exclude '/Caddyfile' \
  --exclude '.DS_Store' \
  "$ROOT/" "$STAGE/avid/"

# محافظ: فایل‌های حیاتی باید در آرشیو باشند (regression: مسیر آپلود یک‌بار
# با exclude 'upload' سراسری حذف شده بود)
for CRITICAL in \
  "src/app/api/admin/upload-image/route.ts" \
  "src/lib/uploaded-files.ts" \
  "src/app/uploads/[...path]/route.ts" \
  "src/app/api/payment/callback/route.ts" \
  "src/app/api/payment/start/route.ts" \
  "src/lib/payment.ts" \
  "src/app/api/health/route.ts" \
  "src/app/api/user/otp/request/route.ts" \
  "src/app/api/panel/otp/request/route.ts" \
  "src/lib/sms.ts" \
  "src/app/api/admin/sms-settings/route.ts" \
  "src/app/api/admin/sms-test/route.ts" \
  "src/app/api/admin/sms-send/route.ts" \
  "src/app/api/admin/sms-logs/route.ts" \
  "src/components/admin/modules/sms-module.tsx" \
  "src/lib/backup.ts" \
  "src/app/api/admin/backup/route.ts" \
  "src/app/api/admin/backup/import/route.ts" \
  "src/components/admin/modules/backup-module.tsx" \
  "src/components/site/enroll-form.tsx" \
  "scripts/migrate.ts" \
  "scripts/bootstrap.ts" \
  "scripts/backup.ts" \
  "scripts/restore.ts" \
  "scripts/healthcheck.ts" \
  "prisma/migrations/0_init/migration.sql" \
  "mini-services/chat-service/index.ts" \
  "mini-services/chat-service/web-dev-supervisor.ts" \
  "compose.yaml" \
  "Dockerfile" \
  "deploy/update.sh" \
  "deploy/backup.sh" \
  "deploy/restore.sh" \
  "deploy/directadmin-quickstart.md" \
  "deploy/apache/vhost-include.conf" \
  "DEPLOY.md" \
  "TEST-RESULTS.md" \
  ".env.example" \
  ".dockerignore"
do
  if [ ! -e "$STAGE/avid/$CRITICAL" ]; then
    echo "✗ فایل حیاتی در آرشیو نیست: $CRITICAL" >&2
    exit 1
  fi
done

# ساخت ZIP (مرتب و تکرارپذیر) — سیاست «فقط آخرین نسخه»:
# ۱) همه‌ی فایل‌های قدیمی هر دو پوشه‌ی تحویل پاک می‌شوند
# ۲) فقط avid-latest.zip نوشته می‌شود (لینک پنل مدیریت: /Download/avid-latest.zip)
find "$DL_DIR" -mindepth 1 -maxdepth 1 -delete 2>/dev/null || true
find "$OUT_DIR" -mindepth 1 -maxdepth 1 -delete 2>/dev/null || true
(cd "$STAGE" && zip -r -q "$OUT" avid)

cp "$OUT" "$DL_DIR/avid-latest.zip"

rm -rf "$STAGE"

SIZE=$(du -h "$OUT" | cut -f1)
COUNT=$(unzip -l "$OUT" | tail -n 1 | awk '{print $2}')
echo "✔ $OUT ساخته شد ($SIZE — $COUNT فایل)"
echo "✔ download/ و public/Download/ فقط شامل آخرین نسخه: avid-latest.zip"
