#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# آوید — به‌روزرسانی غیرمخرب روی VPS
#
# استفاده (داخل پوشه‌ی پروژه):
#   bash deploy/update.sh
#
# ترتیب گام‌ها (مهم):
#   ۱) ثبتِ ایمیجِ «نسخه‌ی در حال اجرا» با برچسب :rollback و بیلد ایمیج‌های
#      نو «پیش از توقف سرویس‌ها» — سایت در طول بیلد روشن می‌ماند و اگر
#      بیلد شکست بخورد، هیچ وقفه‌ای ایجاد نشده است.
#   ۲) توقف وب و چت — برای «بکاپِ سازگار» دیتابیس/آپلودها (بدون نوشتنِ
#      هم‌زمان) و اجرای مهاجرت روی دیتابیس ساکن.
#   ۳) پشتیبان‌گیری کامل (دیتابیس + آپلودها).
#   ۴) مهاجرت غیرمخرب (migrate.ts: بدون prisma db push؛ آشتی‌سازی مهاجرت‌ها
#      با تحملِ «هم‌اکنون موجود» — خطای ستون تکراری رخ نمی‌دهد).
#   ۵) بالا آوردن سرویس‌ها با ایمیج‌های نو.
#   ۶) انتظار برای «سالم شدن» وب و چت — موفقیت فقط وقتی اعلام می‌شود که
#      migrate با کد ۰ تمام شده و هر دو سرویس healthy باشند.
#
# بازگشت به نسخه‌ی قبلی (واقعی، نه صرفاً up مجدد):
#   اگر «بکاپ» یا «مهاجرت» شکست بخورد، دیتابیس یا دست‌نخورده است یا
#   عیناً از بکاپِ داخل migrate.ts بازگردانده شده — پس باید سرویس‌ها با
#   «همان ایمیج‌های نسخه‌ی قبلی» بالا بیایند، نه با ایمیج‌های نو که
#   از قبل ساخته شده‌اند. اسکریپت نامِ پیش‌فرض compose (مثل avid-web)
#   را دوباره به همان ایمیجِ قبلی (برچسب :rollback) تگ می‌زند و فقط
#   وب و چت را با همان ایمیج‌ها بالا می‌آورد (بدون rebuild و بدون
#   وابستگی‌ها) — نسخه‌ی قبلی عملاً همان‌طور که قبل از به‌روزرسانی
#   می‌رفت، ادامه می‌دهد.
#   ایمیج‌های نو «نگه داشته می‌شوند» (حذف نمی‌شوند؛ docker image prune
#   عمداً در این اسکریپت نیست) تا بعد از رفع علتِ شکست، همین اسکریپت
#   با بیلد تازه دوباره قابل اجرا باشد.
#
#   اگر پس از مهاجرتِ موفق، وب/چت سالم نشد: دیتابیس به «ساختارِ تازه»
#   مهاجرت کرده و بازگشتِ خودکار ممکن است علت را پنهان کند — سرویس‌ها
#   روشن می‌مانند تا لاگ‌ها بررسی شود (docker compose logs) و تصمیمِ
#   بازگشت با مدیر است؛ برچسب‌های :rollback همین لحظه هم در دسترس‌اند:
#     docker tag avid-web:rollback avid-web:latest && \
#     docker tag avid-chat:rollback avid-chat:latest && \
#     docker compose up -d --no-deps --no-build web chat
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# — اطلاع‌رسانی (بدون تغییرِ .env سرور): پورت استاندارد این نسخه ۳۹۰۰ است —
if [ -f .env ]; then
  web_port="$(grep -E '^WEB_PORT=' .env | tail -1 | cut -d= -f2 || true)"
  if [ -n "${web_port:-}" ] && [ "$web_port" != "3900" ]; then
    echo "⚠ WEB_PORT در .env سرور شما «$web_port» است؛ پروکسی دایرکت‌ادمین این نسخه به 127.0.0.1:3900 اشاره می‌کند."
    echo "  فایل .env شما دست‌نخورده می‌ماند — در صورت نیاز مقدار WEB_PORT را خودتان به 3900 تغییر دهید."
  fi
fi

# — انتظار برای «سالم شدن» یک سرویس (healthcheck کانتینر) —
wait_healthy() {
  local service="$1" timeout_s="$2" waited=0 status
  local cid
  cid="$(docker compose ps -q "$service" 2>/dev/null || true)"
  if [ -z "$cid" ]; then
    echo "✖ کانتینر «$service» بالا نیامده است."
    return 1
  fi
  while [ "$waited" -lt "$timeout_s" ]; do
    status="$(docker inspect --format='{{.State.Health.Status}}' "$cid" 2>/dev/null || echo unknown)"
    if [ "$status" = "healthy" ]; then
      echo "✔ «$service» سالم است."
      return 0
    fi
    sleep 3
    waited=$((waited + 3))
  done
  echo "✖ «$service» ظرف ${timeout_s} ثانیه سالم نشد (آخرین وضعیت: ${status:-نامشخص})."
  return 1
}

declare -a previous_services=()
declare -a previous_repositories=()

save_previous_image() {
  local service="$1" cid image_id reference repository
  cid="$(docker compose ps -q "$service")"
  [ -n "$cid" ] || return 0
  image_id="$(docker inspect --format '{{.Image}}' "$cid")"
  reference="$(docker inspect --format '{{.Config.Image}}' "$cid")"
  repository="${reference%@*}"
  if [[ "${repository##*/}" == *:* ]]; then
    repository="${repository%:*}"
  fi
  # .Image is the immutable ID used by the running container.
  docker tag "$image_id" "$repository:rollback"
  previous_services+=("$service")
  previous_repositories+=("$repository")
}

rollback_previous() {
  local repository service
  if [ "${#previous_services[@]}" -eq 0 ]; then
    echo "⚠ کانتینر قبلی برای بازگشت وجود ندارد."
    return 0
  fi

  echo "— بازگشت به ایمیج‌های نسخه‌ی قبل …"
  for repository in "${previous_repositories[@]}"; do
    docker tag "$repository:rollback" "$repository:latest"
  done
  docker compose up -d --no-deps --no-build "${previous_services[@]}"
  for service in "${previous_services[@]}"; do
    wait_healthy "$service" 240
  done
  echo "✔ سرویس‌های نسخه‌ی قبل سالم هستند."
}

echo "— ۱/۶ ثبت شناسه‌ی ایمیج‌های فعلی و بیلد ایمیج‌های جدید …"
save_previous_image web
save_previous_image chat
docker compose build

echo "— ۲/۶ توقف وب و چت برای بکاپِ سازگار و اجرای مهاجرت …"
docker compose stop web chat

echo "— ۳/۶ پشتیبان‌گیری کامل (دیتابیس + آپلودها) …"
if ! bash deploy/backup.sh; then
  echo "✖ پشتیبان‌گیری ناموفق — هیچ تغییری اعمال نشده؛ نسخه‌ی قبلی با همان ایمیج‌های قبلی برگردانده می‌شود."
  rollback_previous
  exit 1
fi

echo "— ۴/۶ مهاجرت غیرمخرب دیتابیس (migrate.ts — بدون prisma db push) …"
if ! docker compose run --rm migrate; then
  echo "✖ مهاجرت ناموفق (لاگ بالا) — دیتابیس توسط migrate.ts از بکاپ بازگردانده یا دست‌نخورده است."
  echo "  نسخه‌ی قبلی با همان ایمیج‌های قبلی بالا می‌آید؛ پس از رفع علت، اسکریپت را دوباره اجرا کنید."
  rollback_previous
  exit 1
fi

echo "— ۵/۶ بالا آوردن سرویس‌ها با ایمیج‌های جدید …"
docker compose up -d

echo "— ۶/۶ انتظار برای سلامت وب و چت …"
if ! wait_healthy web 240 || ! wait_healthy chat 90; then
  echo "✖ به‌روزرسانی کامل نشد — وضعیت سرویس‌ها:"
  docker compose ps || true
  echo "بررسی لاگ‌ها: docker compose logs --tail=100 web chat"
  echo "ℹ مهاجرت با موفقیت انجام شده؛ سرویس‌ها روشن مانده‌اند تا علت بررسی شود."
  echo "  بازگشت دستی به ایمیج‌های قبلی (در صورت نیاز):"
  echo "    docker tag avid-web:rollback avid-web:latest && docker tag avid-chat:rollback avid-chat:latest && docker compose up -d --no-deps --no-build web chat"
  exit 1
fi

docker compose ps
echo "✔ به‌روزرسانی کامل شد — مهاجرت با کد ۰ انجام شد و وب و چت سالم هستند."
