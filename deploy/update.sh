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
# اگر بکاپ یا مهاجرت شکست بخورد، همان کانتینرهای متوقف‌شده را شروع
# می‌کنیم. تا قبل از موفقیت مهاجرت، وب و چت بازسازی نمی‌شوند.
# تگ‌های rollback فقط برای بازگشت دستی پس از ساخت کانتینرهای جدیدند.
# اگر Docker ایمیج قدیمی را پیدا نکند، تا زمانی که کانتینر قبلی موجود
# است، ثبت نشدن تگ مانع ادامه‌ی آپدیت نمی‌شود.
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
declare -a previous_containers=()
rollback_images=0

save_previous_image() {
  local service="$1" cid image_id reference repository
  cid="$(docker compose ps -q "$service")"
  [ -n "$cid" ] || return 0
  previous_services+=("$service")
  previous_containers+=("$cid")
  image_id="$(docker inspect --format '{{.Image}}' "$cid")"
  reference="$(docker inspect --format '{{.Config.Image}}' "$cid")"
  repository="${reference%@*}"
  if [[ "${repository##*/}" == *:* ]]; then
    repository="${repository%:*}"
  fi
  if docker tag "$image_id" "$repository:rollback"; then
    rollback_images=$((rollback_images + 1))
  else
    echo "⚠ تگ بازگشت برای «$service» ثبت نشد. در صورت شکست بکاپ یا مهاجرت، همان کانتینر قبلی دوباره شروع می‌شود." >&2
  fi
}

rollback_previous() {
  local service
  if [ "${#previous_containers[@]}" -eq 0 ]; then
    echo "ℹ کانتینر در حال اجرایی برای بازیابی وجود نداشت."
    return 0
  fi

  echo "— راه‌اندازی دوباره‌ی کانتینرهای قبلی …"
  docker container start "${previous_containers[@]}"
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
if ! docker compose stop web chat; then
  echo "✖ توقف سرویس‌ها کامل نشد. کانتینرهای قبلی دوباره شروع می‌شوند." >&2
  rollback_previous
  exit 1
fi

echo "— ۳/۶ پشتیبان‌گیری کامل (دیتابیس + آپلودها) …"
if ! bash deploy/backup.sh; then
  echo "✖ پشتیبان‌گیری ناموفق — هیچ تغییری اعمال نشده؛ نسخه‌ی قبلی با همان ایمیج‌های قبلی برگردانده می‌شود."
  rollback_previous
  exit 1
fi

echo "— ۴/۶ مهاجرت غیرمخرب دیتابیس (migrate.ts — بدون prisma db push) …"
if ! docker compose run --rm migrate; then
  echo "✖ مهاجرت ناموفق بود. وضعیت دیتابیس و بکاپ را در لاگ بالا بررسی کنید."
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
  if [ "$rollback_images" -eq 2 ]; then
    echo "  ایمیج‌های قبلی با تگ :rollback ثبت شده‌اند. قبل از بازگشت، سازگاری دیتابیس را بررسی کنید."
  else
    echo "  تگ :rollback برای هر دو سرویس ثبت نشده است. بکاپ و لاگ‌های به‌روزرسانی را بررسی کنید."
  fi
  exit 1
fi

docker compose ps
echo "✔ به‌روزرسانی کامل شد — مهاجرت با کد ۰ انجام شد و وب و چت سالم هستند."
