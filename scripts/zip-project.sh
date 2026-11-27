#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# ساخت آرشیو ZIP از آخرین نسخه‌ی پروژه «آوید» — آماده‌ی استقرار روی VPS.
#
# امنیت:
#   • .env واقعی هرگز وارد آرشیو نمی‌شود (فقط .env.example)
#   • دیتابیس توسعه (db/custom.db) با همه‌ی هش‌ها/کلیدها حذف می‌شود —
#     روی VPS دیتابیس تازه با migrate + bootstrap ساخته می‌شود
#   • پوشه‌های سندباکس/پلتفرم (skills, .zscripts, examples و…) حذف می‌شوند
#   • فایل‌های گواهینامه‌ی کاربران (public/uploads/certificates) حذف می‌شوند —
#     داده‌ی خصوصی کاربران نباید در آرشیو عمومیِ قابل‌دانلود باشد (بند ۸)
#   • deploy/turn/private/ (کانفیگ خصوصی Coturn و کلید TURN) هرگز وارد
#     آرشیو نمی‌شود — این پوشه فقط هنگام setup روی VPS ساخته می‌شود
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
  --exclude '/public/uploads/certificates' \
  --exclude '/deploy/turn/private' \
  --exclude '/screenshots' \
  --exclude '/skills' \
  --exclude '/examples' \
  --exclude '/Caddyfile' \
  --exclude '.DS_Store' \
  "$ROOT/" "$STAGE/avid/"

# محافظ: فایل‌های حیاتی باید در آرشیو باشند (regression: مسیر آپلود یک‌بار
# با exclude 'upload' سراسری حذف شده بود)؛ پوشه‌ی استقرار TURN
# (deploy/turn — بدون private/) هم جزو فایل‌های حیاتی است
for CRITICAL in \
  "src/app/manifest.ts" \
  "src/app/api/admin/distribution/route.ts" \
  "src/components/pwa/pwa-bootstrap.tsx" \
  "public/sw.js" \
  "public/images/icons/icon-192.png" \
  "public/images/icons/icon-512.png" \
  "public/images/icons/maskable-512.png" \
  "public/images/icons/apple-touch-icon.png" \
  "src/middleware.ts" \
  "src/lib/http.ts" \
  "src/lib/file-signature.ts" \
  "src/lib/svg-sanitize.ts" \
  "src/lib/html-sanitize.ts" \
  "src/lib/cert-files.ts" \
  "src/app/api/uploads/certificates/[...path]/route.ts" \
  "src/app/api/panel/certificates/route.ts" \
  "src/app/api/certificate/verify/route.ts" \
  "src/app/api/admin/certificates/route.ts" \
  "src/app/api/admin/certificates/[id]/route.ts" \
  "src/app/api/admin/upload-image/route.ts" \
  "src/lib/uploaded-files.ts" \
  "src/app/uploads/[...path]/route.ts" \
  "src/app/api/payment/callback/route.ts" \
  "src/app/api/payment/start/route.ts" \
  "src/lib/payment.ts" \
  "src/lib/payment-finalize.ts" \
  "src/lib/media.ts" \
  "src/lib/default-settings.ts" \
  "src/app/api/health/route.ts" \
  "src/app/api/user/otp/request/route.ts" \
  "src/app/api/user/otp/verify/route.ts" \
  "src/app/api/user/phone/request/route.ts" \
  "src/app/api/user/phone/verify/route.ts" \
  "src/app/api/panel/otp/request/route.ts" \
  "src/app/api/panel/otp/verify/route.ts" \
  "src/app/api/auth/login/route.ts" \
  "src/app/api/auth/login/verify/route.ts" \
  "src/app/api/admin/account/2fa/route.ts" \
  "src/lib/rate-limit.ts" \
  "src/lib/sms.ts" \
  "src/lib/trust-seals.ts" \
  "src/components/site/trust-seal.tsx" \
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
  "src/components/site/hero.tsx" \
  "src/components/site/atom-fingerprint-scene.tsx" \
  "src/components/site/atom-code-scene.tsx" \
  "src/lib/hero-animations.ts" \
  "src/app/api/admin/hero-animations/route.ts" \
  "src/components/admin/modules/homepage-module.tsx" \
  "src/lib/teacher.ts" \
  "src/lib/teacher-finance.ts" \
  "src/lib/shaba.ts" \
  "src/lib/course-write.ts" \
  "src/lib/streams.ts" \
  "src/app/api/teacher/exams/route.ts" \
  "src/app/api/teacher/exams/[id]/route.ts" \
  "src/app/api/teacher/exams/[id]/attempts/route.ts" \
  "src/app/api/teacher/exams/[id]/questions/route.ts" \
  "src/app/api/teacher/upload/route.ts" \
  "src/components/panel/teacher/teacher-exams.tsx" \
  "src/app/api/teacher/finance/route.ts" \
  "src/app/api/teacher/courses/route.ts" \
  "src/app/api/teacher/courses/[id]/route.ts" \
  "src/app/api/teacher/courses/[id]/enrollees/route.ts" \
  "src/app/api/teacher/classes/route.ts" \
  "src/app/api/teacher/classes/[id]/route.ts" \
  "src/app/api/teacher/classes/[id]/members/route.ts" \
  "src/app/api/teacher/classes/[id]/members/[memberId]/route.ts" \
  "src/app/api/teacher/streams/route.ts" \
  "src/app/api/teacher/streams/[id]/route.ts" \
  "src/app/api/admin/teachers/route.ts" \
  "src/app/api/admin/teachers/[id]/finance/route.ts" \
  "src/app/api/admin/teachers/[id]/payouts/route.ts" \
  "src/app/api/admin/teachers/[id]/payouts/[payoutId]/route.ts" \
  "src/components/admin/shared/teacher-payments-dialog.tsx" \
  "src/components/admin/shared/user-payments-dialog.tsx" \
  "src/components/panel/teacher/teacher-courses.tsx" \
  "src/components/panel/teacher/teacher-classes.tsx" \
  "src/components/panel/teacher/teacher-finance.tsx" \
  "src/components/panel/teacher/teacher-streams.tsx" \
  "src/components/panel/panel-dashboard.tsx" \
  "src/app/stream/[id]/page.tsx" \
  "src/components/stream/stream-room-client.tsx" \
  "src/components/stream/stream-room.tsx" \
  "src/components/stream/use-stream-room.ts" \
  "src/components/stream/types.ts" \
  "src/lib/socket-proxy.ts" \
  "src/app/stream-socket/[[...rest]]/route.ts" \
  "src/app/socket.io/[[...rest]]/route.ts" \
  "src/app/api/streams/[id]/route.ts" \
  "src/app/api/streams/[id]/join/route.ts" \
  "src/app/api/streams/[id]/leave/route.ts" \
  "src/app/api/admin/streams/route.ts" \
  "src/app/api/admin/streams/[id]/route.ts" \
  "src/app/api/admin/streams/[id]/kick/route.ts" \
  "src/app/api/admin/streams/[id]/export/route.ts" \
  "src/components/admin/modules/streams-module.tsx" \
  "src/components/admin/modules/account-module.tsx" \
  "src/components/chat/chat-widget.tsx" \
  "src/components/chat/use-chat-socket.ts" \
  "src/lib/chat.ts" \
  "src/app/api/chat/bootstrap/route.ts" \
  "src/app/api/chat/messages/route.ts" \
  "src/instrumentation.ts" \
  "src/lib/ensure-schema.ts" \
  "scripts/migrate.ts" \
  "scripts/ensure-schema.ts" \
  "scripts/sqlite-query.ts" \
  "scripts/bootstrap.ts" \
  "scripts/backup.ts" \
  "scripts/restore.ts" \
  "scripts/healthcheck.ts" \
  "prisma/migrations/0_init/migration.sql" \
  "prisma/migrations/20261112000000_payment_attempt_code/migration.sql" \
  "prisma/migrations/20261114000100_add_academy_features/migration.sql" \
  "prisma/migrations/20261115000100_clear_support_hours_default/migration.sql" \
  "prisma/migrations/20261115000200_installment_payments/migration.sql" \
  "prisma/migrations/20261116000100_pending_registration/migration.sql" \
  "prisma/migrations/20261117000100_admin_2fa_stats/migration.sql" \
  "prisma/migrations/20261117170000_homepage_section_visibility/migration.sql" \
  "prisma/migrations/20261118100000_exam_attempt_grades/migration.sql" \
  "prisma/migrations/20261119000000_exam_allow_back/migration.sql" \
  "prisma/migrations/20261130120000_class_stream_tables/migration.sql" \
  "prisma/migrations/20261130130000_exam_class_bank/migration.sql" \
  "prisma/migrations/20261201000000_teacher_role/migration.sql" \
  "prisma/migrations/20261202000000_hero_animations/migration.sql" \
  "prisma/migrations/20261203000000_teacher_shaba_payouts/migration.sql" \
  "prisma/migrations/20261204000000_teacher_exam_creator/migration.sql" \
  "prisma/migrations/20261205000000_chat_avatar_mode/migration.sql" \
  "prisma/migrations/20261206000000_security_hardening/migration.sql" \
  "prisma/migrations/20261207000000_site_text_responsive/migration.sql" \
  "prisma/migrations/20261208000000_chat_welcome_autohide/migration.sql" \
  "prisma/migrations/migration_lock.toml" \
  "prisma/baseline.sql" \
  "mini-services/chat-service/index.ts" \
  "mini-services/chat-service/web-dev-supervisor.ts" \
  "mini-services/chat-service/Dockerfile" \
  "mini-services/chat-service/tsconfig.json" \
  "mini-services/chat-service/package.json" \
  "mini-services/chat-service/bun.lock" \
  "mini-services/stream-service/index.ts" \
  "mini-services/stream-service/healthcheck.ts" \
  "mini-services/stream-service/Dockerfile" \
  "mini-services/stream-service/tsconfig.json" \
  "mini-services/stream-service/package.json" \
  "mini-services/stream-service/bun.lock" \
  "compose.yaml" \
  "Dockerfile" \
  "tsconfig.json" \
  "deploy/update.sh" \
  "deploy/backup.sh" \
  "deploy/restore.sh" \
  "deploy/directadmin-quickstart.md" \
  "deploy/apache/vhost-include.conf" \
  "deploy/nginx/vhost-proxy.conf" \
  "deploy/turn/setup.sh" \
  "deploy/turn/compose.yaml" \
  "deploy/turn/configure-csf.py" \
  "deploy/turn/repair-config.py" \
  "deploy/turn/README.md" \
  "deploy/turn/VALIDATION.md" \
  "deploy/turn/AUDIO-UPDATE.md" \
  "DEPLOY.md" \
  "TEST-RESULTS.md" \
  "tests/admin-login.test.ts" \
  "tests/dependency-compat.test.ts" \
  "tests/site-texts.test.ts" \
  "tests/stream-access.test.ts" \
  "tests/stream-ice.test.ts" \
  ".env.example" \
  ".dockerignore"
do
  if [ ! -e "$STAGE/avid/$CRITICAL" ]; then
    echo "✗ فایل حیاتی در آرشیو نیست: $CRITICAL" >&2
    exit 1
  fi
done

# محافظ امنیتی: کانفیگ خصوصی TURN و کلید TURN هرگز نباید وارد آرشیو شود —
# حتی اگر روی دیسک وجود داشته باشد (rsync باید آن را حذف کرده باشد).
if [ -e "$STAGE/avid/deploy/turn/private" ]; then
  echo "✗ نشت امنیتی: deploy/turn/private در آرشیو استقرار پیدا شد" >&2
  exit 1
fi

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
